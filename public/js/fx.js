// Particles, tracers, explosions, projectiles and other short-lived effects.
import * as THREE from 'three';
import { glowTexture } from './textures.js';

const MAX_PARTICLES = 900;
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _c = new THREE.Color();

export class FX {
  constructor(scene) {
    this.scene = scene;
    this.particles = [];
    const geo = new THREE.BoxGeometry(1, 1, 1);
    this.pMesh = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ color: '#ffffff' }), MAX_PARTICLES);
    this.pMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.pMesh.setColorAt(0, new THREE.Color());
    this.pMesh.count = 0;
    this.pMesh.frustumCulled = false;
    scene.add(this.pMesh);

    this.tracers = [];
    this.glowTex = glowTexture();
    this.sprites = [];
    this.lights = [];
    for (let i = 0; i < 2; i++) {
      const l = new THREE.PointLight('#ffaa55', 0, 10, 1.5);
      scene.add(l);
      this.lights.push({ l, t: 0, dur: 1, peak: 0 });
    }
    this.decals = [];
    this.decalGeo = new THREE.PlaneGeometry(0.1, 0.1);
    this.decalMat = new THREE.MeshBasicMaterial({ color: '#111', transparent: true, opacity: 0.8, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 });
    this.bolts = [];
    this.timers = [];
    // brass casings
    this.casingGeo = new THREE.CylinderGeometry(0.006, 0.006, 0.026, 6).rotateZ(Math.PI / 2);
    this.shellGeo = new THREE.CylinderGeometry(0.011, 0.011, 0.05, 8).rotateZ(Math.PI / 2);
    this.brass = new THREE.MeshStandardMaterial({ color: '#c99a3a', metalness: 1, roughness: 0.3 });
    this.shellMat = new THREE.MeshStandardMaterial({ color: '#a3201a', metalness: 0.2, roughness: 0.5 });
    this.casings = [];
    // blood pools
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const x = c.getContext('2d');
    for (let i = 0; i < 9; i++) {
      const px = 64 + (Math.random() - 0.5) * 50, py = 64 + (Math.random() - 0.5) * 50, r = 14 + Math.random() * 30;
      const g = x.createRadialGradient(px, py, 0, px, py, r);
      g.addColorStop(0, 'rgba(70,0,0,0.95)'); g.addColorStop(0.7, 'rgba(55,0,0,0.85)'); g.addColorStop(1, 'rgba(40,0,0,0)');
      x.fillStyle = g; x.beginPath(); x.arc(px, py, r, 0, 7); x.fill();
    }
    this.poolGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    this.poolTex = new THREE.CanvasTexture(c);
    this.pools = [];
    this.chunks = [];
    this.spurts = [];
    this.splats = [];
    this.splatGeo = new THREE.PlaneGeometry(1, 1);
    this.splatTex = [0, 1, 2, 3].map((k) => {
      const cv = document.createElement('canvas'); cv.width = cv.height = 128;
      const x = cv.getContext('2d');
      x.fillStyle = 'rgba(120,0,0,0.95)';
      x.beginPath(); x.arc(64, 64, 18 + k * 3, 0, 7); x.fill();
      for (let i = 0; i < 26; i++) {
        const a = Math.random() * 6.28, d = 14 + Math.random() * 46, r = 2 + Math.random() * 7;
        x.globalAlpha = 0.6 + Math.random() * 0.4;
        x.beginPath(); x.arc(64 + Math.cos(a) * d, 64 + Math.sin(a) * d, r, 0, 7); x.fill();
        // drips running down
        if (Math.random() < 0.3) x.fillRect(64 + Math.cos(a) * d - 1.5, 64 + Math.sin(a) * d, 3, 10 + Math.random() * 30);
      }
      x.globalAlpha = 1;
      return new THREE.CanvasTexture(cv);
    });
  }

  // ---------------------------------------------------------------- gore
  chunk(mesh, pos, vel) {
    mesh.position.copy(pos);
    mesh.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
    this.scene.add(mesh);
    this.chunks.push({ m: mesh, v: vel.clone(), spin: new THREE.Vector3((Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14), t: 0, trail: 0, rest: false });
    while (this.chunks.length > 26) this.removeChunk(0);
  }

  removeChunk(i) {
    const c = this.chunks[i];
    this.scene.remove(c.m);
    if (c.m.userData.ownGeometry) c.m.geometry.dispose();
    this.chunks.splice(i, 1);
  }

  /** blood pumping out of a stump that follows the (moving) parent bone */
  spurt(bone, at, dur) {
    const local = bone.worldToLocal(at.clone());
    this.spurts.push({ bone, local, t: dur, acc: 0 });
  }

  bloodSplat(pos, normal, size = 1) {
    if (!normal) return;
    const mat = new THREE.MeshBasicMaterial({ map: this.splatTex[(Math.random() * this.splatTex.length) | 0], transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, color: '#9a1010' });
    const m = new THREE.Mesh(this.splatGeo, mat);
    m.position.copy(pos).addScaledVector(normal, 0.015);
    m.lookAt(pos.clone().add(normal));
    m.rotateZ(Math.random() * 6);
    m.scale.setScalar(size * (0.5 + Math.random() * 0.7));
    this.scene.add(m);
    this.splats.push(m);
    if (this.splats.length > 70) { const o = this.splats.shift(); this.scene.remove(o); o.material.dispose(); }
  }

  casing(pos, vel, shotgun = false) {
    const m = new THREE.Mesh(shotgun ? this.shellGeo : this.casingGeo, shotgun ? this.shellMat : this.brass);
    m.position.copy(pos);
    this.scene.add(m);
    this.casings.push({ m, v: vel.clone(), spin: new THREE.Vector3(Math.random() * 20, Math.random() * 20, 0), life: 4, bounced: false });
    if (this.casings.length > 40) { const c = this.casings.shift(); this.scene.remove(c.m); }
  }

  bloodPool(pos, size = 1) {
    const mat = new THREE.MeshStandardMaterial({ map: this.poolTex, transparent: true, depthWrite: false, roughness: 0.15, metalness: 0, polygonOffset: true, polygonOffsetFactor: -3 });
    const m = new THREE.Mesh(this.poolGeo, mat);
    m.position.set(pos.x, 0.012, pos.z);
    m.rotation.y = Math.random() * 6;
    m.scale.setScalar(0.1);
    this.scene.add(m);
    this.pools.push({ m, t: 0, size: size * (0.9 + Math.random() * 0.6) });
    if (this.pools.length > 40) { const p = this.pools.shift(); this.scene.remove(p.m); p.m.material.dispose(); }
  }

  particle(pos, vel, { color = '#ffffff', life = 0.6, size = 0.06, gravity = 9, drag = 0.5, grow = 0 } = {}) {
    if (this.particles.length >= MAX_PARTICLES) this.particles.shift();
    this.particles.push({ p: pos.clone(), v: vel.clone(), life, max: life, size, gravity, drag, grow, color: new THREE.Color(color), rot: Math.random() * 6 });
  }

  burst(pos, count, opts = {}) {
    const { speed = 3, dir = null, spread = 1, colors = ['#ffffff'] } = opts;
    for (let i = 0; i < count; i++) {
      const v = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.3, Math.random() - 0.5).normalize().multiplyScalar(spread);
      if (dir) v.add(dir);
      v.normalize().multiplyScalar(speed * (0.4 + Math.random() * 0.8));
      this.particle(pos, v, { ...opts, color: colors[(Math.random() * colors.length) | 0], size: (opts.size ?? 0.06) * (0.6 + Math.random() * 0.8) });
    }
  }

  blood(pos, dir, amount = 8) {
    this.burst(pos, amount, { speed: 3, dir: dir ? dir.clone().multiplyScalar(0.7) : null, colors: ['#8a0a0a', '#b31212', '#5a0505'], size: 0.07, life: 0.7, gravity: 12 });
  }

  gib(pos) {
    this.burst(pos, 26, { speed: 5.5, colors: ['#8a0a0a', '#b31212', '#5a0505', '#6a0808', '#9aa8ac', '#d8d0c0'], size: 0.09, life: 1.1, gravity: 14, spread: 1.4 });
  }

  sparks(pos, normal) {
    this.burst(pos, 5, { speed: 4, dir: normal, colors: ['#ffd27a', '#fff2c0', '#ff9a3a'], size: 0.035, life: 0.3, gravity: 8 });
    this.burst(pos, 3, { speed: 1, dir: normal, colors: ['#6a6460', '#857e75'], size: 0.08, life: 0.6, gravity: -0.5, grow: 0.25 });
  }

  tracer(from, to, color = '#ffe6a0', width = 1, life = 0.08) {
    const geo = new THREE.BufferGeometry().setFromPoints([from, to]);
    const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
    const line = new THREE.Line(geo, mat);
    this.scene.add(line);
    this.tracers.push({ line, t: life, max: life });
  }

  glow(pos, color = '#ffb060', size = 1, life = 0.08) {
    const mat = new THREE.SpriteMaterial({ map: this.glowTex, color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    const sp = new THREE.Sprite(mat);
    sp.position.copy(pos);
    sp.scale.setScalar(size);
    this.scene.add(sp);
    this.sprites.push({ sp, t: life, max: life, size });
  }

  flash(pos, color = '#ffaa55', peak = 6, dur = 0.08) {
    let best = this.lights[0];
    for (const l of this.lights) if (l.t <= 0) { best = l; break; } else if (l.t < best.t) best = l;
    best.l.position.copy(pos);
    best.l.color.set(color);
    best.t = dur; best.dur = dur; best.peak = peak;
    best.l.intensity = peak;
  }

  explosion(pos, color = '#ff8a2a', scale = 1) {
    this.flash(pos.clone().setY(pos.y + 0.5), color, 30 * scale, 0.35);
    this.glow(pos.clone().setY(pos.y + 0.4), color, 4.5 * scale, 0.35);
    this.burst(pos, Math.round(30 * scale), { speed: 7 * scale, colors: [color, '#ffd27a', '#ffffff'], size: 0.09, life: 0.5, gravity: 4 });
    this.burst(pos, Math.round(16 * scale), { speed: 2.5, colors: ['#3a3633', '#56504a', '#2a2622'], size: 0.25, life: 1.4, gravity: -1.2, grow: 0.6, drag: 1.5 });
  }

  muzzle(pos, color = '#ffc070', big = false) {
    this.glow(pos, color, big ? 0.9 : 0.55, 0.05);
    this.flash(pos, color, big ? 8 : 4, 0.06);
  }

  decal(pos, normal) {
    if (!normal) return;
    const d = new THREE.Mesh(this.decalGeo, this.decalMat);
    d.position.copy(pos).addScaledVector(normal, 0.01);
    d.lookAt(pos.clone().add(normal));
    d.rotation.z = Math.random() * 6;
    this.scene.add(d);
    this.decals.push(d);
    if (this.decals.length > 80) this.scene.remove(this.decals.shift());
  }

  bolt(from, to, color, speed, onArrive, size = 0.5) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex, color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    sp.scale.setScalar(size);
    sp.position.copy(from);
    this.scene.add(sp);
    const dist = from.distanceTo(to);
    this.bolts.push({ sp, from: from.clone(), to: to.clone(), t: 0, dur: Math.max(0.02, dist / speed), onArrive, color, trailT: 0 });
  }

  lightning(x, z) {
    const pts = [];
    let px = x, pz = z;
    for (let y = 14; y >= 0; y -= 1.2) {
      pts.push(new THREE.Vector3(px, y, pz));
      px = x + (Math.random() - 0.5) * 1.2;
      pz = z + (Math.random() - 0.5) * 1.2;
    }
    pts.push(new THREE.Vector3(x, 0, z));
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: '#bfe4ff', transparent: true, blending: THREE.AdditiveBlending }));
    this.scene.add(line);
    this.tracers.push({ line, t: 0.35, max: 0.35 });
    const p = new THREE.Vector3(x, 1, z);
    this.flash(p, '#9fd0ff', 40, 0.4);
    this.glow(p, '#bfe4ff', 3, 0.4);
    this.burst(new THREE.Vector3(x, 0.2, z), 20, { speed: 4, colors: ['#bfe4ff', '#ffffff', '#ff7a2a'], size: 0.06, life: 0.5 });
  }

  after(sec, fn) { this.timers.push({ t: sec, fn }); }

  update(dt) {
    for (let i = this.timers.length - 1; i >= 0; i--) {
      this.timers[i].t -= dt;
      if (this.timers[i].t <= 0) { const f = this.timers[i].fn; this.timers.splice(i, 1); f(); }
    }
    // particles
    let n = 0;
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) { this.particles.splice(i, 1); continue; }
      p.v.y -= p.gravity * dt;
      p.v.multiplyScalar(Math.max(0, 1 - p.drag * dt));
      p.p.addScaledVector(p.v, dt);
      if (p.p.y < 0.02) { p.p.y = 0.02; p.v.y *= -0.3; p.v.x *= 0.6; p.v.z *= 0.6; }
      p.size += p.grow * dt;
    }
    for (const p of this.particles) {
      if (n >= MAX_PARTICLES) break;
      const k = p.life / p.max;
      const s = p.size * (p.grow ? 1 : Math.min(1, k * 2));
      _q.setFromAxisAngle(_s.set(0.3, 1, 0.2).normalize(), p.rot + (1 - k) * 4);
      _m.compose(p.p, _q, _s.set(s, s, s));
      this.pMesh.setMatrixAt(n, _m);
      _c.copy(p.color);
      if (p.grow) _c.multiplyScalar(0.5 + k * 0.5);
      this.pMesh.setColorAt(n, _c);
      n++;
    }
    this.pMesh.count = n;
    this.pMesh.instanceMatrix.needsUpdate = true;
    if (this.pMesh.instanceColor) this.pMesh.instanceColor.needsUpdate = true;

    for (let i = this.chunks.length - 1; i >= 0; i--) {
      const c = this.chunks[i];
      c.t += dt;
      if (!c.rest) {
        c.v.y -= 16 * dt;
        c.m.position.addScaledVector(c.v, dt);
        c.m.rotation.x += c.spin.x * dt; c.m.rotation.y += c.spin.y * dt; c.m.rotation.z += c.spin.z * dt;
        c.trail -= dt;
        if (c.trail <= 0 && c.t < 1.2) { c.trail = 0.03; this.particle(c.m.position, new THREE.Vector3(0, -0.5, 0), { color: '#7a0606', life: 0.5, size: 0.05, gravity: 10 }); }
        if (c.m.position.y < 0.08) {
          c.m.position.y = 0.08;
          if (Math.abs(c.v.y) > 2.5 && this.onSplat) this.onSplat(c.m.position);
          c.v.y *= -0.3; c.v.x *= 0.5; c.v.z *= 0.5; c.spin.multiplyScalar(0.4);
          if (c.v.lengthSq() < 0.5) { c.rest = true; c.m.rotation.x = Math.round(c.m.rotation.x / (Math.PI / 2)) * Math.PI / 2 + Math.PI / 2; }
        }
      }
      if (c.t > 14) c.m.position.y -= dt * 0.3;
      if (c.t > 16) this.removeChunk(i);
    }
    for (let i = this.spurts.length - 1; i >= 0; i--) {
      const sp = this.spurts[i];
      sp.t -= dt;
      sp.acc += dt;
      if (sp.t <= 0 || !sp.bone.parent) { this.spurts.splice(i, 1); continue; }
      while (sp.acc > 0.025) {
        sp.acc -= 0.025;
        const p = sp.bone.localToWorld(sp.local.clone());
        const pulse = 0.5 + Math.abs(Math.sin(sp.t * 9)) * 1.2;
        this.particle(p, new THREE.Vector3((Math.random() - 0.5) * 1.2, 1.5 * pulse, (Math.random() - 0.5) * 1.2), { color: Math.random() < 0.5 ? '#8a0a0a' : '#5a0505', life: 0.6, size: 0.045, gravity: 11 });
      }
    }
    for (let i = this.casings.length - 1; i >= 0; i--) {
      const c = this.casings[i];
      c.life -= dt;
      c.v.y -= 14 * dt;
      c.m.position.addScaledVector(c.v, dt);
      c.m.rotation.x += c.spin.x * dt;
      c.m.rotation.y += c.spin.y * dt;
      if (c.m.position.y < 0.01) {
        c.m.position.y = 0.01;
        if (Math.abs(c.v.y) > 0.6 && this.onCasingBounce && !c.bounced) this.onCasingBounce(c.m.position);
        c.bounced = true;
        c.v.y *= -0.35; c.v.x *= 0.5; c.v.z *= 0.5; c.spin.multiplyScalar(0.5);
      }
      if (c.life <= 0) { this.scene.remove(c.m); this.casings.splice(i, 1); }
    }
    for (let i = this.pools.length - 1; i >= 0; i--) {
      const p = this.pools[i];
      p.t += dt;
      p.m.scale.setScalar(Math.min(p.size, 0.1 + p.t * 1.2 * p.size));
      if (p.t > 25) p.m.material.opacity = Math.max(0, 1 - (p.t - 25) / 5);
      if (p.t > 30) { this.scene.remove(p.m); p.m.material.dispose(); this.pools.splice(i, 1); }
    }
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const t = this.tracers[i];
      t.t -= dt;
      t.line.material.opacity = Math.max(0, t.t / t.max);
      if (t.t <= 0) { this.scene.remove(t.line); t.line.geometry.dispose(); t.line.material.dispose(); this.tracers.splice(i, 1); }
    }
    for (let i = this.sprites.length - 1; i >= 0; i--) {
      const s = this.sprites[i];
      s.t -= dt;
      const k = Math.max(0, s.t / s.max);
      s.sp.material.opacity = k;
      s.sp.scale.setScalar(s.size * (1.3 - k * 0.3));
      if (s.t <= 0) { this.scene.remove(s.sp); s.sp.material.dispose(); this.sprites.splice(i, 1); }
    }
    for (const l of this.lights) {
      if (l.t > 0) { l.t -= dt; l.l.intensity = Math.max(0, l.peak * (l.t / l.dur)); }
      else l.l.intensity = 0;
    }
    for (let i = this.bolts.length - 1; i >= 0; i--) {
      const b = this.bolts[i];
      b.t += dt;
      const k = Math.min(1, b.t / b.dur);
      b.sp.position.lerpVectors(b.from, b.to, k);
      b.trailT -= dt;
      if (b.trailT <= 0) {
        b.trailT = 0.015;
        this.particle(b.sp.position, new THREE.Vector3(), { color: b.color, life: 0.18, size: 0.08, gravity: 0 });
      }
      if (k >= 1) {
        this.scene.remove(b.sp);
        b.sp.material.dispose();
        this.bolts.splice(i, 1);
        if (b.onArrive) b.onArrive(b.to);
      }
    }
  }
}
