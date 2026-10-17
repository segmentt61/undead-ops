// DOM heads-up display in Black Ops zombies style.
import { PERKS, POWERUP_NAMES } from '/shared/config.js';
import { POWERUP_ICONS } from './textures.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const PERK_ABBR = { jugg: 'JN', speed: 'SC', dtap: 'DT', revive: 'QR' };

export class HUD {
  constructor() {
    this.scoreEls = new Map();
    this.lastRound = -1;
    this.noticeTimer = null;
    this.subTimer = null;
    this.promptText = '';
    this.perkKey = '';
    this.puKey = '';
    const scope = document.createElement('div');
    scope.id = 'scope';
    scope.style.cssText = 'position:absolute;inset:0;display:none;background:radial-gradient(circle at center, transparent 0 32vh, #000 32.3vh);';
    scope.innerHTML = '<div style="position:absolute;left:50%;top:0;bottom:0;width:2px;background:#000;transform:translateX(-1px)"></div><div style="position:absolute;top:50%;left:0;right:0;height:2px;background:#000;transform:translateY(-1px)"></div>';
    $('hud').prepend(scope);
    this.scope = scope;
  }

  show(on) { $('hud').classList.toggle('hidden', !on); }

  // ---- round counter: chalk tally marks for 1-5 like BO1, numbers after
  setRound(n, flash = false) {
    if (n === this.lastRound) return;
    this.lastRound = n;
    const el = $('roundNum');
    if (n <= 0) el.innerHTML = '';
    else if (n <= 5) {
      let svg = '<svg viewBox="0 0 120 100" width="120"><g stroke="#b80d0d" stroke-width="9" stroke-linecap="round" fill="none">';
      for (let i = 0; i < Math.min(n, 4); i++) svg += `<path d="M${14 + i * 22} ${10 + (i % 2) * 3} L${18 + i * 22} 92"/>`;
      if (n === 5) svg += '<path d="M4 70 L106 26"/>';
      el.innerHTML = svg + '</g></svg>';
    } else el.textContent = String(n);
    if (flash) {
      el.classList.add('flash');
      setTimeout(() => el.classList.remove('flash'), 2600);
    }
  }

  notice(text, sub = '', dur = 3500) {
    const n = $('notice'), s = $('subnotice');
    n.textContent = text;
    n.style.opacity = 1;
    s.textContent = sub;
    s.style.opacity = sub ? 1 : 0;
    clearTimeout(this.noticeTimer);
    this.noticeTimer = setTimeout(() => { n.style.opacity = 0; s.style.opacity = 0; }, dur);
  }

  /** Room name callout when you walk into a new area. */
  zone(name) {
    const el = $('zoneLabel');
    el.textContent = name;
    el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
  }

  /** Mission-style title card typed out at the start of a game. */
  intro(lines) {
    const el = $('introCard');
    clearInterval(this.introTimer);
    el.innerHTML = lines.map((l, i) => `<div class="l${i}"></div>`).join('');
    el.classList.add('show');
    const rows = [...el.children];
    let li = 0, ci = 0;
    this.introTimer = setInterval(() => {
      if (li >= lines.length) {
        clearInterval(this.introTimer);
        setTimeout(() => el.classList.remove('show'), 2600);
        return;
      }
      ci++;
      rows[li].textContent = lines[li].slice(0, ci);
      if (ci >= lines[li].length) { li++; ci = 0; }
    }, 38);
  }

  subnotice(text, dur = 2500) {
    const s = $('subnotice');
    s.textContent = text;
    s.style.opacity = 1;
    clearTimeout(this.subTimer);
    this.subTimer = setTimeout(() => { s.style.opacity = 0; }, dur);
  }

  prompt(html) {
    if (html === this.promptText) return;
    this.promptText = html;
    $('prompt').innerHTML = html;
  }

  reloadHint(text) {
    const el = $('reloadHint');
    if (el.textContent !== text) el.textContent = text;
  }

  // ---- points
  setScores(players, meId) {
    const list = $('scoreList');
    const ordered = [...players.values()].filter((p) => p.spawned !== false).sort((a, b) => (a.id === meId) - (b.id === meId) || a.id - b.id);
    const ids = new Set(ordered.map((p) => p.id));
    for (const [id, el] of this.scoreEls) if (!ids.has(id)) { el.remove(); this.scoreEls.delete(id); }
    for (const p of ordered) {
      let el = this.scoreEls.get(p.id);
      if (!el) {
        el = document.createElement('div');
        el.className = 'score';
        el.innerHTML = '<span class="v"></span>';
        this.scoreEls.set(p.id, el);
      }
      list.appendChild(el);
      el.classList.toggle('me', p.id === meId);
      el.classList.toggle('down', !!p.downed);
      el.style.color = p.color;
      el.style.borderColor = p.color;
      const v = el.querySelector('.v');
      const txt = String(p.points);
      if (v.textContent !== txt) v.textContent = txt;
    }
  }

  floatPoints(id, n) {
    const el = this.scoreEls.get(id);
    if (!el || !n) return;
    const f = document.createElement('span');
    f.className = 'float' + (n < 0 ? ' neg' : '');
    f.textContent = (n > 0 ? '+' : '') + n;
    f.style.top = `${(Math.random() - 0.5) * 16}px`;
    el.appendChild(f);
    setTimeout(() => f.remove(), 1100);
  }

  // ---- ammo
  setAmmo(slot, grenades) {
    const name = $('weaponName');
    if (!slot) {
      name.textContent = 'KNIFE';
      $('ammoMag').textContent = '–';
      $('ammoRes').textContent = '';
    } else {
      const label = slot.stats.name;
      if (name.textContent !== label) name.textContent = label;
      name.classList.toggle('pap', slot.pap);
      const m = String(slot.mag);
      const mag = $('ammoMag');
      if (mag.textContent !== m) mag.textContent = m;
      mag.classList.toggle('low', slot.mag <= Math.ceil(slot.stats.mag * 0.25));
      const r = `/ ${slot.reserve}`;
      if ($('ammoRes').textContent !== r) $('ammoRes').textContent = r;
    }
    const g = '●'.repeat(Math.max(0, grenades));
    if ($('grenades').textContent !== g) $('grenades').textContent = g;
  }

  setPerks(perks) {
    const key = perks.join(',');
    if (key === this.perkKey) return;
    this.perkKey = key;
    $('perkIcons').innerHTML = perks.map((p) => `<div class="perk" title="${PERKS[p].name}" style="background:${PERKS[p].color};color:${PERKS[p].color}"><span style="color:#fff">${PERK_ABBR[p]}</span></div>`).join('');
  }

  setActivePowerups(insta, dbl) {
    const items = [];
    if (insta > 0) items.push(['insta', insta]);
    if (dbl > 0) items.push(['double', dbl]);
    const key = items.map(([k, t]) => `${k}${t < 5 ? 'b' : ''}`).join();
    if (key === this.puKey) return;
    this.puKey = key;
    $('activePowerups').innerHTML = items.map(([k, t]) => `<div class="apu ${t < 5 ? 'blink' : ''}"><div class="ic">${POWERUP_ICONS[k]}</div>${POWERUP_NAMES[k]}</div>`).join('');
  }

  // ---- crosshair / hit feedback
  /** Tactical sprint stamina, a thin bar under the crosshair while it is used or refilling. */
  stamina(v, active) {
    if (!this.stamBar) {
      this.stamBar = document.createElement('div');
      this.stamBar.id = 'stamina';
      this.stamBar.innerHTML = '<i></i>';
      document.getElementById('hud').appendChild(this.stamBar);
    }
    const show = active || v < 0.999;
    if (show !== this.stamShown) { this.stamBar.classList.toggle('on', show); this.stamShown = show; }
    if (show) this.stamBar.firstChild.style.transform = `scaleX(${v.toFixed(3)})`;
  }

  crosshair(gapPx, visible) {
    const c = $('crosshair');
    c.style.opacity = visible ? 1 : 0;
    c.style.setProperty('--gap', `${Math.round(Math.min(120, gapPx))}px`);
  }

  hitmarker(kill) {
    const h = $('hitmarker');
    h.classList.remove('show');
    h.classList.toggle('kill', kill);
    void h.offsetWidth;
    h.classList.add('show');
  }

  setScope(on) { this.scope.style.display = on ? 'block' : 'none'; }

  health(ratio) {
    $('vignette').style.opacity = Math.max(0, Math.min(1, (1 - ratio) * 1.3));
  }

  hurt(angle) {
    const f = $('hurtFlash');
    f.style.transition = 'none';
    f.style.opacity = 1;
    void f.offsetWidth;
    f.style.transition = 'opacity 0.5s';
    f.style.opacity = 0;
    if (angle !== null) {
      const i = document.createElement('i');
      i.style.transform = `rotate(${angle}rad)`;
      $('dmgDir').appendChild(i);
      setTimeout(() => i.remove(), 1200);
    }
  }

  nukeFlash() {
    const f = $('nukeFlash');
    f.style.transition = 'none';
    f.style.opacity = 0.9;
    void f.offsetWidth;
    f.style.transition = 'opacity 1.6s';
    f.style.opacity = 0;
  }

  downed(state, bleedFrac, selfRevive) {
    $('downedBox').classList.toggle('hidden', !state);
    if (!state) return;
    $('bleedBar').style.width = `${Math.max(0, bleedFrac) * 100}%`;
    $('downedSub').textContent = selfRevive ? 'Quick Revive is bringing you back…' : 'Hold on! A teammate can revive you.';
  }

  dead(state) { $('deadBox').classList.toggle('hidden', !state); }

  progress(label, frac) {
    const box = $('progressBox');
    if (label === null) { box.classList.add('hidden'); return; }
    box.classList.remove('hidden');
    $('progressLabel').textContent = label;
    $('progressBar').style.width = `${Math.min(1, frac) * 100}%`;
  }

  netInfo(text) { $('netInfo').textContent = text; }

  // ---- chat
  chat(name, color, msg, system = false) {
    const log = $('chatLog');
    const d = document.createElement('div');
    if (system) { d.className = 'sys'; d.textContent = msg; }
    else d.innerHTML = `<b style="color:${esc(color)}">${esc(name)}:</b> ${esc(msg)}`;
    log.appendChild(d);
    while (log.children.length > 8) log.firstChild.remove();
  }

  // ---- scoreboard
  scoreboard(show, players, round) {
    $('scoreboard').classList.toggle('hidden', !show);
    if (!show) return;
    $('sbRound').textContent = round;
    $('sbBody').innerHTML = [...players.values()].sort((a, b) => b.points - a.points).map((p) =>
      `<tr><td><span class="swatch" style="background:${esc(p.color)}"></span>${esc(p.name)}</td><td>${p.points}</td><td>${p.kills}</td><td>${p.heads}</td><td>${p.downs}</td><td>${p.revives}</td><td>${p.ping}</td></tr>`).join('');
  }

  gameOver(round, stats) {
    $('goRounds').textContent = `You survived ${round} round${round === 1 ? '' : 's'}`;
    $('goBody').innerHTML = stats.sort((a, b) => b.points - a.points).map((p) =>
      `<tr><td><span class="swatch" style="background:${esc(p.color)}"></span>${esc(p.name)}</td><td>${p.points}</td><td>${p.kills}</td><td>${p.heads}</td><td>${p.downs}</td><td>${p.revives}</td></tr>`).join('');
  }

  reset() {
    this.lastRound = -1;
    this.setRound(0);
    this.scoreEls.forEach((el) => el.remove());
    this.scoreEls.clear();
    this.perkKey = 'x';
    this.setPerks([]);
    this.puKey = 'x';
    this.setActivePowerups(0, 0);
    this.prompt('');
    this.downed(false);
    this.dead(false);
    this.progress(null);
    this.setScope(false);
  }
}

export { esc };
