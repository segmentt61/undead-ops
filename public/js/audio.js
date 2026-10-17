// Sound engine: recorded CC0 samples (guns, reloads, zombies, monsters, music) + FM/noise synthesis
// for UI stingers, with distance muffling, stereo panning, a generated room reverb and a limiter.
import { registerSounds, loadSounds } from './assets.js';

const G = '/assets/sfx/guns/';
registerSounds({
  pistol: G + 'pistol.m4a', pistol2: G + 'pistol2.m4a', magnum: G + 'magnum.m4a',
  shotgun_double: G + 'shotgun_double.m4a', shotgun_pump: G + 'shotgun_pump.m4a', shotgun_semi: G + 'shotgun_semi.m4a',
  rifle_semi: G + 'rifle_semi.m4a', smg: G + 'smg.m4a', smg2: G + 'smg2.m4a', ak: G + 'ak.m4a', ar15: G + 'ar15.m4a',
  lmg: G + 'lmg.m4a', sniper: G + 'sniper.m4a',
  reload_pistol: G + 'reload_pistol.m4a', reload_rifle: G + 'reload_rifle.m4a', pump: G + 'pump.m4a',
  // idle moans: the longer clips of the zombie pack
  zombie: [1, 8, 9, 12, 15, 16, 17, 18, 19, 20, 21, 23].map((i) => `/assets/sfx/zombie/z${i}.m4a`),
  // short snarls for attacks and hits
  zattack: [1, 3, 4, 5, 6, 7, 8, 9, 11, 14, 16, 17, 18].map((i) => `/assets/sfx/monster/m${i}.m4a`).concat([2, 3, 5, 6, 7, 10, 11, 13, 14, 22, 24].map((i) => `/assets/sfx/zombie/z${i}.m4a`)),
  zdeath: [2, 10, 12, 13, 15].map((i) => `/assets/sfx/monster/m${i}.m4a`),
  music: '/assets/sfx/music.m4a',
});
// Round music is streamed in one track at a time (decoded songs are big, phones have little memory).
// Heavy metal from round one, getting heavier as the rounds climb; dog rounds get their own track.
const MUSIC = Object.fromEntries([1, 2, 3, 4, 5, 6, 7, 8].map((i) => [`rock${i}`, `/assets/sfx/rock${i}.m4a`]));
const ROCK = ['rock4', 'rock7', 'rock5', 'rock8', 'rock3', 'rock1'];
const DOG_TRACK = 'rock6';

const SYNTH_KIND = {
  pistol: 'pistol', pistol2: 'pistol', magnum: 'magnum', shotgun_double: 'shotgun', shotgun_pump: 'shotgun', shotgun_semi: 'shotgun',
  rifle_semi: 'rifle', smg: 'smg', smg2: 'smg', ak: 'rifle', ar15: 'rifle', lmg: 'lmg', sniper: 'sniper',
};

class AudioEngine {
  constructor() {
    this.ctx = null;
    this.volume = 0.7;
    this.musicVolume = 0.5;
    this.listener = { x: 0, z: 0, yaw: 0 };
    this.samples = {};
    this.loading = null;
    this.musicSrc = null;
  }

  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    // iPhone: play through the ring/silent switch like a video or game would, instead of muting WebAudio
    try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch { /* older Safari */ }
    this.ctx = new AC();
    // iOS unlocks audio only when a sound starts inside a tap, so play one silent sample now
    const unlock = this.ctx.createBufferSource();
    unlock.buffer = this.ctx.createBuffer(1, 1, 22050);
    unlock.connect(this.ctx.destination);
    unlock.start(0);
    // iOS suspends ("interrupted") the context on calls, Siri or app switches; wake it on the next touch
    const wake = () => { if (this.ctx.state !== 'running' && !document.hidden) Promise.resolve(this.ctx.resume()).catch(() => {}); };
    document.addEventListener('visibilitychange', wake);
    for (const ev of ['pointerdown', 'touchend', 'keydown']) document.addEventListener(ev, wake, true);
    // master -> gentle glue compressor -> brick-wall limiter -> speakers
    this.master = this.ctx.createGain();
    this.master.gain.value = this.volume;
    const glue = this.ctx.createDynamicsCompressor();
    glue.threshold.value = -18; glue.knee.value = 12; glue.ratio.value = 3; glue.attack.value = 0.005; glue.release.value = 0.2;
    const limiter = this.ctx.createDynamicsCompressor();
    limiter.threshold.value = -3; limiter.knee.value = 0; limiter.ratio.value = 20; limiter.attack.value = 0.001; limiter.release.value = 0.1;
    this.master.connect(glue).connect(limiter).connect(this.ctx.destination);
    this.musicBus = this.ctx.createGain();
    this.musicBus.gain.value = this.musicVolume * 0.32;
    this.musicBus.connect(limiter);
    this.calmGain = this.ctx.createGain();
    this.calmGain.gain.value = 1;
    this.calmGain.connect(this.musicBus);
    this.combatGain = this.ctx.createGain();
    this.combatGain.gain.value = 0;
    this.combatGain.connect(this.musicBus);
    this.musicMode = 'calm';
    const len = this.ctx.sampleRate * 2;
    this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.makeReverb();
    this.startAmbience();
  }

  loadSamples(onProgress) {
    if (!this.ctx) return Promise.resolve();
    if (!this.loading) this.loading = loadSounds(this.ctx, onProgress).then((s) => { this.samples = s; this.startMusic(); });
    return this.loading;
  }

  makeReverb() {
    const ctx = this.ctx;
    const len = Math.floor(ctx.sampleRate * 1.6);
    const ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        const t = i / ctx.sampleRate;
        const early = t < 0.07 && Math.random() < 0.015 ? 0.8 : 0;
        d[i] = ((Math.random() * 2 - 1) * Math.exp(-t * 4) * 0.45 + early * (Math.random() - 0.5)) * Math.min(1, t / 0.008);
      }
    }
    const conv = ctx.createConvolver();
    conv.buffer = ir;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 3800;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 180;
    this.reverbIn = ctx.createGain();
    this.reverbIn.gain.value = 0.22;
    this.reverbIn.connect(hp).connect(lp).connect(conv).connect(this.master);
  }

  setVolume(v) { this.volume = v; if (this.master) this.master.gain.value = v; }
  setMusicVolume(v) { this.musicVolume = v; if (this.musicBus) this.musicBus.gain.value = v * 0.32; }
  setListener(x, z, yaw) { this.listener.x = x; this.listener.z = z; this.listener.yaw = yaw; }
  get t() { return this.ctx.currentTime; }

  // Output node with distance attenuation, muffling and stereo pan. Returns null if inaudible.
  out(vol = 1, x, z, range = 6, reverb = 1) {
    if (!this.ctx) return null;
    const g = this.ctx.createGain();
    let gain = vol, pan = 0, d = 0;
    if (x !== undefined) {
      const dx = x - this.listener.x, dz = z - this.listener.z;
      d = Math.hypot(dx, dz);
      gain = vol / (1 + Math.pow(d / range, 1.7));
      if (gain < 0.008) return null;
      if (d > 0.3) {
        const y = this.listener.yaw;
        pan = Math.max(-1, Math.min(1, (dx * Math.cos(y) - dz * Math.sin(y)) / d)) * 0.75;
      }
    }
    g.gain.value = gain;
    let tail = g;
    if (d > 5) {
      const lp = this.ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = Math.max(900, 18000 / (1 + (d - 5) * 0.3));
      tail = tail.connect(lp);
    }
    if (pan && this.ctx.createStereoPanner) {
      const p = this.ctx.createStereoPanner();
      p.pan.value = pan;
      tail = tail.connect(p);
    }
    tail.connect(this.master);
    if (this.reverbIn && reverb > 0) {
      const send = this.ctx.createGain();
      send.gain.value = reverb * Math.min(1.6, 0.5 + d * 0.06);
      tail.connect(send).connect(this.reverbIn);
    }
    return g;
  }

  sample(name, { vol = 1, x, z, range = 8, rate = 1, vary = 0.04, delay = 0, reverb = 1, offset = 0 } = {}) {
    const list = this.samples[name];
    if (!this.ctx || !list || !list.length) return false;
    const o = this.out(vol, x, z, range, reverb);
    if (!o) return true;
    const src = this.ctx.createBufferSource();
    src.buffer = list[(Math.random() * list.length) | 0];
    src.playbackRate.value = rate * (1 + (Math.random() - 0.5) * 2 * vary);
    src.connect(o);
    src.start(this.t + delay, offset);
    return true;
  }

  // ------------------------------------------------------------- synthesis helpers
  env(param, t0, attack, peak, decay) {
    param.cancelScheduledValues(t0);
    param.setValueAtTime(0.0001, t0);
    param.linearRampToValueAtTime(peak, t0 + attack);
    param.exponentialRampToValueAtTime(0.0001, t0 + attack + decay);
  }

  burst(dest, { dur = 0.2, type = 'lowpass', freq = 2000, q = 0.7, peak = 1, attack = 0.002, sweep = null, delay = 0 }) {
    const t0 = this.t + delay;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t0);
    if (sweep) f.frequency.exponentialRampToValueAtTime(sweep, t0 + dur);
    f.Q.value = q;
    const g = this.ctx.createGain();
    this.env(g.gain, t0, attack, peak, dur);
    src.connect(f).connect(g).connect(dest);
    src.start(t0, Math.random() * 1.5, dur + attack + 0.1);
  }

  tone(dest, { freq = 440, to = null, dur = 0.2, type = 'sine', peak = 0.5, attack = 0.005, delay = 0, detune = 0 }) {
    const t0 = this.t + delay;
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (to) o.frequency.exponentialRampToValueAtTime(to, t0 + dur);
    o.detune.value = detune;
    const g = this.ctx.createGain();
    this.env(g.gain, t0, attack, peak, dur);
    o.connect(g).connect(dest);
    o.start(t0);
    o.stop(t0 + attack + dur + 0.05);
    return o;
  }

  /** FM bell: music box, chime or church bell depending on ratio and length. */
  bell(dest, { freq = 880, dur = 1.2, peak = 0.25, ratio = 3.5, index = 2.5, delay = 0 }) {
    const t0 = this.t + delay;
    const car = this.ctx.createOscillator();
    const mod = this.ctx.createOscillator();
    const modGain = this.ctx.createGain();
    car.frequency.value = freq;
    mod.frequency.value = freq * ratio;
    modGain.gain.setValueAtTime(freq * index, t0);
    modGain.gain.exponentialRampToValueAtTime(freq * 0.05, t0 + dur);
    mod.connect(modGain).connect(car.frequency);
    const g = this.ctx.createGain();
    this.env(g.gain, t0, 0.003, peak, dur);
    car.connect(g).connect(dest);
    car.start(t0); mod.start(t0);
    car.stop(t0 + dur + 0.1); mod.stop(t0 + dur + 0.1);
  }

  /** Slow detuned pad (eerie, choir-like). */
  pad(dest, { freqs, dur = 4, peak = 0.08, attack = 0.8, cutoff = 900, delay = 0 }) {
    const t0 = this.t + delay;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(cutoff * 0.4, t0);
    f.frequency.linearRampToValueAtTime(cutoff, t0 + attack);
    f.frequency.exponentialRampToValueAtTime(cutoff * 0.3, t0 + attack + dur);
    const g = this.ctx.createGain();
    this.env(g.gain, t0, attack, peak, dur);
    f.connect(g).connect(dest);
    for (const fr of freqs)
      for (const det of [-9, 0, 8]) {
        const o = this.ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = fr;
        o.detune.value = det;
        o.connect(f);
        o.start(t0);
        o.stop(t0 + attack + dur + 0.1);
      }
  }

  // ------------------------------------------------------------- weapons
  shot(kind, x, z, local = false, pap = false) {
    if (SYNTH_KIND[kind] && this.samples[kind]) {
      this.sample(kind, { vol: local ? 1.0 : 0.75, x, z, range: 22, vary: 0.035, reverb: local ? 0.55 : 1.2 });
      if (local) {
        // heavy low-end thump, a crisp mechanical crack and the room slapping back
        const heavy = kind.startsWith('shotgun') || kind === 'sniper' || kind === 'magnum' || kind === 'lmg';
        const o = this.out(0.75, undefined, undefined, 14, 0);
        if (o) {
          this.tone(o, { freq: heavy ? 80 : 105, to: 34, dur: heavy ? 0.2 : 0.13, peak: heavy ? 1.3 : 1.0 });
          this.burst(o, { dur: 0.03, type: 'bandpass', freq: 3200, q: 1.2, peak: 0.5 });
          this.burst(o, { dur: heavy ? 0.45 : 0.28, type: 'lowpass', freq: 700, sweep: 180, peak: heavy ? 0.45 : 0.28, delay: 0.035 });
          if (kind === 'rifle_semi' || kind === 'sniper') this.burst(o, { dur: 0.04, type: 'highpass', freq: 4000, peak: 0.2, delay: 0.07 });
        }
        if (pap) { const p = this.out(0.3, undefined, undefined, 14, 0.3); if (p) this.tone(p, { freq: 700, to: 2400, dur: 0.12, type: 'triangle', peak: 0.12 }); }
        if (kind === 'shotgun_pump') this.sample('pump', { vol: 0.5, delay: 0.32, reverb: 0.2, vary: 0.02 });
      }
      return;
    }
    const o = this.out(local ? 0.8 : 0.65, x, z, 16);
    if (!o) return;
    if (kind === 'ray') {
      this.tone(o, { freq: 1600, to: 220, dur: 0.24, type: 'sawtooth', peak: 0.16 });
      this.tone(o, { freq: 820, to: 120, dur: 0.28, type: 'square', peak: 0.07 });
      this.bell(o, { freq: 1320, dur: 0.25, peak: 0.12, ratio: 1.41, index: 4 });
      return;
    }
    if (kind === 'launcher') {
      this.burst(o, { dur: 0.22, type: 'lowpass', freq: 1300, sweep: 300, peak: 0.8 });
      this.tone(o, { freq: 130, to: 45, dur: 0.15, peak: 0.8 });
      return;
    }
    if (kind === 'thunder') {
      this.burst(o, { dur: 1.1, type: 'lowpass', freq: 250, sweep: 2500, peak: 1.2, attack: 0.04 });
      this.burst(o, { dur: 0.9, type: 'lowpass', freq: 900, sweep: 70, peak: 0.9, delay: 0.1 });
      this.tone(o, { freq: 60, to: 22, dur: 0.9, peak: 1.0 });
      this.sample('shotgun_double', { vol: 0.6, rate: 0.5, reverb: 1.4 });
      return;
    }
    const P = { pistol: [3200, 0.12, 150], magnum: [2400, 0.3, 110], smg: [3800, 0.09, 140], rifle: [2600, 0.17, 120], lmg: [2200, 0.2, 100], shotgun: [1700, 0.38, 85], sniper: [2000, 0.55, 90] }[SYNTH_KIND[kind] || kind];
    if (!P) return;
    this.burst(o, { dur: P[1], type: 'lowpass', freq: P[0], sweep: P[0] * 0.3, peak: 0.9 });
    this.tone(o, { freq: P[2], to: P[2] * 0.4, dur: P[1] * 0.6, peak: 0.8 });
  }

  click() {
    const o = this.out(0.35);
    if (o) { this.burst(o, { dur: 0.02, type: 'highpass', freq: 3500, peak: 0.6 }); this.tone(o, { freq: 1800, dur: 0.02, type: 'square', peak: 0.08 }); }
  }

  reloadStart(cls, duration) {
    const key = cls === 'pistol' || cls === 'wonder' ? 'reload_pistol' : cls === 'shotgun' ? null : 'reload_rifle';
    if (!key || !this.samples[key]) return false;
    const len = this.samples[key][0].duration;
    const rate = Math.max(0.85, Math.min(1.6, len / (duration * 0.85)));
    this.sample(key, { vol: 0.6, rate, vary: 0.02, reverb: 0.15 });
    return true;
  }

  pumpRack(delay = 0) { return this.sample('pump', { vol: 0.55, delay, reverb: 0.15 }); }

  reload(phase) {
    const o = this.out(0.45, undefined, undefined, 6, 0.1);
    if (!o) return;
    if (phase === 'out') { this.burst(o, { dur: 0.05, type: 'bandpass', freq: 1800, q: 3, peak: 0.6 }); this.tone(o, { freq: 300, to: 200, dur: 0.04, peak: 0.15 }); }
    if (phase === 'in') { this.burst(o, { dur: 0.06, type: 'bandpass', freq: 1200, q: 4, peak: 0.8 }); this.tone(o, { freq: 170, dur: 0.05, peak: 0.25 }); }
    if (phase === 'bolt') { this.burst(o, { dur: 0.04, type: 'bandpass', freq: 2500, q: 3, peak: 0.7 }); this.burst(o, { dur: 0.04, type: 'bandpass', freq: 1600, q: 3, peak: 0.7, delay: 0.08 }); }
  }

  hit(head = false, kill = false) {
    const o = this.out(0.4, undefined, undefined, 6, 0);
    if (!o) return;
    // fleshy thwack + a short tick so hits are readable
    this.burst(o, { dur: 0.07, type: 'bandpass', freq: head ? 1400 : 900, q: 1.2, peak: 0.55 });
    this.tone(o, { freq: head ? 2400 : 1700, dur: 0.03, type: 'triangle', peak: head ? 0.3 : 0.18 });
    if (kill) this.tone(o, { freq: 150, to: 60, dur: 0.12, peak: 0.35 });
  }

  explosion(x, z, big = 1) {
    this.sample('shotgun_double', { vol: 0.85 * big, x, z, range: 18, rate: 0.42, vary: 0.05, reverb: 1.6 });
    this.sample('lmg', { vol: 0.5 * big, x, z, range: 18, rate: 0.35, vary: 0.05, reverb: 1.2 });
    const o = this.out(1.0 * big, x, z, 18);
    if (!o) return;
    this.burst(o, { dur: 1.4, type: 'lowpass', freq: 900, sweep: 50, peak: 1.0, attack: 0.005 });
    this.tone(o, { freq: 75, to: 24, dur: 0.9, peak: 0.9 });
    this.burst(o, { dur: 1.5, type: 'bandpass', freq: 3000, sweep: 800, q: 0.5, peak: 0.15, delay: 0.25 }); // debris
  }

  rayImpact(x, z, pap) {
    const o = this.out(0.75, x, z, 12);
    if (!o) return;
    this.burst(o, { dur: 0.35, type: 'bandpass', freq: pap ? 900 : 1400, q: 1.5, sweep: 200, peak: 0.8 });
    this.tone(o, { freq: 520, to: 70, dur: 0.3, type: 'sawtooth', peak: 0.12 });
  }

  knife() {
    const o = this.out(0.45, undefined, undefined, 6, 0.1);
    if (o) this.burst(o, { dur: 0.16, type: 'bandpass', freq: 900, sweep: 4200, q: 2.2, peak: 0.75, attack: 0.03 });
  }

  stab() {
    const o = this.out(0.55, undefined, undefined, 6, 0.1);
    if (o) { this.burst(o, { dur: 0.1, type: 'lowpass', freq: 650, peak: 0.9 }); this.tone(o, { freq: 110, to: 55, dur: 0.09, peak: 0.5 }); }
  }

  // ------------------------------------------------------------- zombies
  groan(x, z, pitch = 1, scream = false) {
    const name = scream ? 'zattack' : 'zombie';
    if (this.sample(name, { vol: scream ? 0.65 : 0.5, x, z, range: 7, rate: (scream ? 1.0 : 0.94) * pitch, vary: 0.07, reverb: 0.9 })) return;
    const o = this.out(0.35, x, z, 7);
    if (o) this.tone(o, { freq: 95 * pitch, to: 70 * pitch, dur: 0.9, type: 'sawtooth', peak: 0.15, attack: 0.1 });
  }

  zombieDeath(x, z) { this.sample('zdeath', { vol: 0.55, x, z, range: 7, rate: 0.82, vary: 0.08 }); }

  zombieHit(x, z) { this.sample('zattack', { vol: 0.25, x, z, range: 6, rate: 1.1, vary: 0.1, reverb: 0.4 }); }

  bark(x, z) {
    if (this.sample('zattack', { vol: 0.6, x, z, range: 8, rate: 1.45, vary: 0.08 })) return;
    const o = this.out(0.5, x, z, 8);
    if (o) this.tone(o, { freq: 380, to: 160, dur: 0.12, type: 'sawtooth', peak: 0.35 });
  }

  swipe(x, z) {
    const o = this.out(0.45, x, z, 6, 0.3);
    if (o) this.burst(o, { dur: 0.18, type: 'bandpass', freq: 500, sweep: 2200, q: 1.5, peak: 0.55, attack: 0.04 });
    this.sample('zattack', { vol: 0.5, x, z, range: 7, rate: 0.95, vary: 0.08 });
  }

  boardTear(x, z) {
    const o = this.out(0.75, x, z, 10);
    if (!o) return;
    this.burst(o, { dur: 0.22, type: 'bandpass', freq: 1200, q: 1.0, peak: 0.9 });
    this.burst(o, { dur: 0.08, type: 'highpass', freq: 3000, peak: 0.4 });
    this.tone(o, { freq: 140, to: 65, dur: 0.14, peak: 0.55, delay: 0.02 });
    this.burst(o, { dur: 0.3, type: 'lowpass', freq: 450, peak: 0.5, delay: 0.32 });
  }

  boardAdd(x, z) {
    const o = this.out(0.65, x, z, 8);
    if (!o) return;
    for (let i = 0; i < 2; i++) {
      this.burst(o, { dur: 0.05, type: 'bandpass', freq: 2000, q: 2, peak: 0.8, delay: i * 0.13 });
      this.tone(o, { freq: 210, to: 110, dur: 0.06, peak: 0.45, delay: i * 0.13 });
    }
  }

  // ------------------------------------------------------------- player / world
  footstep(vol = 0.25) {
    const o = this.out(vol * 0.8, undefined, undefined, 6, 0.15);
    if (!o) return;
    this.burst(o, { dur: 0.05, type: 'lowpass', freq: 260 + Math.random() * 120, peak: 0.9 });
    this.burst(o, { dur: 0.04, type: 'bandpass', freq: 1400 + Math.random() * 600, q: 1, peak: 0.12, delay: 0.03 });
  }

  hurt() {
    const o = this.out(0.7, undefined, undefined, 6, 0.2);
    if (!o) return;
    this.tone(o, { freq: 85, to: 45, dur: 0.22, peak: 0.8 });
    this.burst(o, { dur: 0.15, type: 'lowpass', freq: 700, peak: 0.6 });
  }

  heartbeat() {
    const o = this.out(0.55, undefined, undefined, 6, 0);
    if (!o) return;
    this.tone(o, { freq: 58, to: 38, dur: 0.12, peak: 1 });
    this.tone(o, { freq: 52, to: 36, dur: 0.12, peak: 0.7, delay: 0.22 });
  }

  buy() {
    const o = this.out(0.45, undefined, undefined, 6, 0.4);
    if (!o) return;
    this.bell(o, { freq: 1318, dur: 0.35, peak: 0.16, ratio: 2, index: 1.2 });
    this.bell(o, { freq: 1760, dur: 0.6, peak: 0.16, ratio: 2, index: 1.2, delay: 0.08 });
  }

  deny() {
    const o = this.out(0.35, undefined, undefined, 6, 0.1);
    if (o) { this.tone(o, { freq: 140, dur: 0.18, type: 'square', peak: 0.12 }); this.tone(o, { freq: 133, dur: 0.18, type: 'square', peak: 0.12 }); }
  }

  door(x, z) {
    const o = this.out(0.9, x, z, 14);
    if (!o) return;
    this.burst(o, { dur: 1.1, type: 'lowpass', freq: 380, sweep: 110, peak: 0.9, attack: 0.02 });
    this.tone(o, { freq: 240, to: 110, dur: 0.55, type: 'sawtooth', peak: 0.05, delay: 0.05 });
    this.burst(o, { dur: 0.25, type: 'bandpass', freq: 2200, q: 1, peak: 0.25, delay: 0.6 });
  }

  power() {
    const o = this.out(0.9);
    if (!o) return;
    this.burst(o, { dur: 0.2, type: 'lowpass', freq: 500, peak: 1.1 });
    this.pad(o, { freqs: [41.2, 61.7, 82.4], dur: 3, peak: 0.07, attack: 1.2, cutoff: 1400 });
    this.burst(o, { dur: 2.6, type: 'lowpass', freq: 160, sweep: 1600, peak: 0.45, attack: 0.6 });
    this.bell(o, { freq: 220, dur: 3, peak: 0.12, ratio: 1.4, index: 3, delay: 0.4 });
  }

  roundStart(dog = false) {
    const o = this.out(0.85);
    if (!o) return;
    const root = dog ? 46.25 : 55;
    this.pad(o, { freqs: dog ? [root, root * 1.06, root * 1.5] : [root, root * 1.19, root * 1.5, root * 2], dur: 4.5, peak: 0.065, attack: 0.9, cutoff: 1100 });
    this.burst(o, { dur: 2.5, type: 'lowpass', freq: 160, sweep: 50, peak: 0.55, attack: 0.25 });
    this.tone(o, { freq: 49, to: 30, dur: 2.2, peak: 0.6, attack: 0.05 });
    // three slow church-bell tolls
    [0.2, 1.35, 2.5].forEach((dl, i) => this.bell(o, { freq: [220, 207.6, 164.8][i], dur: 2.6, peak: 0.16, ratio: 1.41, index: 3.2, delay: dl }));
  }

  roundEnd() {
    const o = this.out(0.75);
    if (!o) return;
    [659.3, 587.3, 523.3, 440].forEach((f, i) => this.bell(o, { freq: f, dur: 1.8, peak: 0.12, ratio: 3.5, index: 1.6, delay: i * 0.4 }));
    this.pad(o, { freqs: [55, 82.4], dur: 3.5, peak: 0.05, attack: 0.6, cutoff: 700 });
  }

  powerupSpawn(x, z) {
    const o = this.out(0.55, x, z, 10);
    if (o) [784, 988, 1175].forEach((f, i) => this.bell(o, { freq: f, dur: 0.5, peak: 0.12, ratio: 2, index: 1, delay: i * 0.06 }));
  }

  powerupGrab() {
    const o = this.out(0.7);
    if (!o) return;
    this.pad(o, { freqs: [110, 164.8, 220], dur: 1.6, peak: 0.07, attack: 0.05, cutoff: 2200 });
    [523.3, 659.3, 784, 1046.5].forEach((f, i) => this.bell(o, { freq: f, dur: 0.9, peak: 0.16, ratio: 2, index: 1.5, delay: i * 0.07 }));
    this.burst(o, { dur: 0.6, type: 'highpass', freq: 5000, peak: 0.12 });
  }

  musicBox(x, z, dur = 3.6) {
    const o = this.out(0.6, x, z, 9);
    if (!o) return;
    const mel = [1046.5, 1318.5, 1568, 1318.5, 1174.7, 1396.9, 1760, 1396.9, 1046.5, 1318.5, 1568, 2093, 1568, 1318.5, 1174.7, 1046.5];
    const step = dur / mel.length;
    mel.forEach((f, i) => this.bell(o, { freq: f, dur: 0.7, peak: 0.12, ratio: 3.5, index: 1.1, delay: i * step }));
  }

  teddyLaugh(x, z) {
    const o = this.out(0.7, x, z, 12);
    if (!o) return;
    this.sample('zattack', { vol: 0.5, x, z, range: 12, rate: 0.6 });
    for (let i = 0; i < 5; i++) this.tone(o, { freq: 170 - i * 10, to: 110, dur: 0.12, type: 'sawtooth', peak: 0.15, delay: i * 0.15 });
    this.bell(o, { freq: 98, dur: 2.5, peak: 0.2, ratio: 1.41, index: 4, delay: 0.1 });
  }

  papWhirr(x, z) {
    const o = this.out(0.75, x, z, 10);
    if (!o) return;
    this.tone(o, { freq: 48, to: 95, dur: 3.2, type: 'sawtooth', peak: 0.12, attack: 0.3 });
    this.burst(o, { dur: 3.1, type: 'bandpass', freq: 280, sweep: 900, q: 2, peak: 0.35, attack: 0.3 });
    for (let i = 0; i < 6; i++) this.burst(o, { dur: 0.05, type: 'bandpass', freq: 2500, q: 3, peak: 0.25, delay: 0.5 + i * 0.45 });
    this.bell(o, { freq: 1568, dur: 1.6, peak: 0.2, ratio: 1.41, index: 2.5, delay: 3.4 });
    this.bell(o, { freq: 2093, dur: 1.6, peak: 0.16, ratio: 1.41, index: 2.5, delay: 3.5 });
  }

  perkDrink() {
    const o = this.out(0.55, undefined, undefined, 6, 0.3);
    if (!o) return;
    // short jingle, cap pop, three gulps and a satisfied breath
    [784, 988, 1175, 988, 1318.5].forEach((f, i) => this.bell(o, { freq: f, dur: 0.3, peak: 0.1, ratio: 2, index: 0.8, delay: i * 0.11 }));
    this.burst(o, { dur: 0.05, type: 'bandpass', freq: 2500, q: 4, peak: 0.6, delay: 0.62 });
    for (let i = 0; i < 3; i++) { this.burst(o, { dur: 0.1, type: 'lowpass', freq: 420, peak: 0.7, delay: 0.85 + i * 0.22 }); this.tone(o, { freq: 180, to: 120, dur: 0.07, peak: 0.25, delay: 0.85 + i * 0.22 }); }
    this.burst(o, { dur: 0.35, type: 'bandpass', freq: 700, q: 0.8, peak: 0.25, attack: 0.05, delay: 1.6 });
  }

  downed() {
    const o = this.out(0.85);
    if (!o) return;
    this.pad(o, { freqs: [55, 58.3, 82.4], dur: 2.5, peak: 0.07, attack: 0.1, cutoff: 600 });
    this.bell(o, { freq: 110, dur: 2.5, peak: 0.25, ratio: 1.41, index: 4 });
    this.burst(o, { dur: 0.8, type: 'lowpass', freq: 400, peak: 0.5 });
  }

  revived() {
    const o = this.out(0.6);
    if (o) [440, 554.4, 659.3, 880].forEach((f, i) => this.bell(o, { freq: f, dur: 0.8, peak: 0.13, ratio: 2, index: 1.2, delay: i * 0.08 }));
  }

  casing() {
    const o = this.out(0.16, undefined, undefined, 6, 0.1);
    if (!o) return;
    const f = 3200 + Math.random() * 1800;
    this.bell(o, { freq: f, dur: 0.12, peak: 0.25, ratio: 2.76, index: 0.6 });
    this.bell(o, { freq: f * 1.13, dur: 0.08, peak: 0.15, ratio: 2.76, index: 0.6, delay: 0.08 });
  }

  nadeBounce(x, z) {
    const o = this.out(0.35, x, z, 6);
    if (o) this.bell(o, { freq: 600 + Math.random() * 300, dur: 0.12, peak: 0.25, ratio: 2.3, index: 1 });
  }

  lightning(x, z) {
    const o = this.out(1, x, z, 14);
    if (!o) return;
    this.burst(o, { dur: 0.5, type: 'highpass', freq: 1500, peak: 0.9 });
    this.burst(o, { dur: 1.4, type: 'lowpass', freq: 260, sweep: 60, peak: 0.8, delay: 0.05 });
    this.tone(o, { freq: 60, to: 28, dur: 1, peak: 0.5, delay: 0.05 });
  }

  // ------------------------------------------------------------- ambience & music
  startAmbience() {
    // low wind bed
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 220;
    const g = this.ctx.createGain();
    g.gain.value = 0.035;
    const lfo = this.ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lg = this.ctx.createGain();
    lg.gain.value = 90;
    lfo.connect(lg).connect(f.frequency);
    src.connect(f).connect(g).connect(this.master);
    src.start();
    lfo.start();
    // rain bed (enabled on rainy maps)
    const rain = this.ctx.createBufferSource();
    rain.buffer = this.noise;
    rain.loop = true;
    const rf = this.ctx.createBiquadFilter();
    rf.type = 'bandpass';
    rf.frequency.value = 2500;
    rf.Q.value = 0.4;
    this.rainGain = this.ctx.createGain();
    this.rainGain.gain.value = 0;
    rain.connect(rf).connect(this.rainGain).connect(this.master);
    rain.start();
  }

  setRain(amount) {
    if (this.rainGain) this.rainGain.gain.setTargetAtTime(amount * 0.05, this.t, 0.5);
  }

  startMusic() {
    if (this.musicSrc || !this.samples.music || !this.samples.music.length) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.samples.music[0];
    src.loop = true;
    src.connect(this.calmGain);
    src.start();
    this.musicSrc = src;
  }

  /** 'calm' = ambient between rounds, 'combat' = rock/metal while a round is on. */
  setMusicMode(mode, round = 1, dog = false) {
    if (!this.ctx || !this.calmGain) return;
    if (mode === 'combat' && this.rockEnabled === false) mode = 'calm';
    const t = this.t;
    if (mode === 'combat') {
      const key = dog ? DOG_TRACK : ROCK[(round - 1) % ROCK.length];
      if (this.combatKey !== key && !this.samples[key]?.length) {
        this.loadTrack(key).then(() => { if (this.musicMode === 'combat' && this.wantKey === key) this.setMusicMode('combat', round, dog); });
        this.wantKey = key;
      }
      if (this.combatKey !== key && this.samples[key]?.length) {
        // free the previous song's decoded audio once it has faded out
        const prevKey = this.combatKey;
        if (prevKey && prevKey !== key) setTimeout(() => { if (this.combatKey !== prevKey) delete this.samples[prevKey]; }, 2500);
        const old = this.combatSrc;
        if (old) { const g = old._gain; g.gain.setTargetAtTime(0, t, 0.4); old.stop(t + 2); }
        const src = this.ctx.createBufferSource();
        src.buffer = this.samples[key][0];
        src.loop = true;
        const g = this.ctx.createGain();
        g.gain.value = 0;
        g.gain.setTargetAtTime(1, t, 0.6);
        src._gain = g;
        src.connect(g).connect(this.combatGain);
        src.start(t);
        this.combatSrc = src;
        this.combatKey = key;
      }
      this.combatGain.gain.setTargetAtTime(1.7, t, 0.6);
      this.calmGain.gain.setTargetAtTime(0.15, t, 0.8);
    } else {
      this.combatGain.gain.setTargetAtTime(mode === 'off' ? 0 : 0, t, 1.5);
      this.calmGain.gain.setTargetAtTime(mode === 'off' ? 0 : 1, t, 1.5);
      if (mode !== 'combat') this.combatKey = this.combatKey; // keep the track ready for the next round
    }
    this.musicMode = mode;
  }

  loadTrack(key) {
    if (!this.trackLoads) this.trackLoads = {};
    if (!this.trackLoads[key]) {
      this.trackLoads[key] = fetch(MUSIC[key]).then((r) => r.arrayBuffer()).then((b) => this.ctx.decodeAudioData(b))
        .then((buf) => { this.samples[key] = [buf]; }).catch(() => {}).finally(() => { delete this.trackLoads[key]; });
    }
    return this.trackLoads[key];
  }

  say() { /* the robotic text-to-speech announcer was removed; stingers carry the moment instead */ }
}

export const audio = new AudioEngine();
