// Network-driven entities: zombies, hellhounds, remote players, power-ups.
import * as THREE from 'three';
import * as MD from './models.js';
import * as CH from './characters.js';
import { RigCharacter, rigLoaded, raycastRig, limbChunk, LIMB_BITS, LIMB_BONE_NAMES, zombieSkin } from './rig.js';

// gore level is read from the game settings ('extreme' | 'normal' | 'off')
export const goreCfg = { level: 'extreme' };
import * as TX from './textures.js';
import { audio } from './audio.js';

const INTERP_DELAY = 110; // ms

let blobGeo = null, blobMat = null;
function blobShadow(size) {
  if (!blobGeo) {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const x = c.getContext('2d'); const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(0,0,0,0.65)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g; x.fillRect(0, 0, 64, 64);
    blobGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    blobMat = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
  }
  const m = new THREE.Mesh(blobGeo, blobMat);
  m.scale.set(size, 1, size);
  m.position.y = 0.015;
  m.renderOrder = 1;
  return m;
}

function sampleBuffer(buf, t) {
  if (!buf.length) return null;
  if (t <= buf[0].ts) return buf[0];
  for (let i = buf.length - 1; i >= 0; i--) {
    const a = buf[i];
    if (a.ts <= t) {
      const b = buf[i + 1];
      if (!b) return a;
      const k = (t - a.ts) / (b.ts - a.ts);
      let dy = b.yaw - a.yaw;
      while (dy > Math.PI) dy -= Math.PI * 2;
      while (dy < -Math.PI) dy += Math.PI * 2;
      return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, z: a.z + (b.z - a.z) * k, yaw: a.yaw + dy * k, pitch: a.pitch !== undefined ? a.pitch + (b.pitch - a.pitch) * k : 0 };
    }
  }
  return buf[0];
}

function pushSample(buf, s) {
  buf.push(s);
  while (buf.length > 30) buf.shift();
}

const _v = new THREE.Vector3();

// Ray / sphere: returns t or -1
function raySphere(o, d, c, r) {
  const ox = o.x - c.x, oy = o.y - c.y, oz = o.z - c.z;
  const b = ox * d.x + oy * d.y + oz * d.z;
  const cc = ox * ox + oy * oy + oz * oz - r * r;
  const disc = b * b - cc;
  if (disc < 0) return -1;
  const t = -b - Math.sqrt(disc);
  return t >= 0 ? t : (cc < 0 ? 0 : -1);
}

// Ray / vertical cylinder (finite)
function rayCylinder(o, d, cx, cz, y0, y1, r) {
  const ox = o.x - cx, oz = o.z - cz;
  const a = d.x * d.x + d.z * d.z;
  if (a < 1e-8) return -1;
  const b = ox * d.x + oz * d.z;
  const c = ox * ox + oz * oz - r * r;
  const disc = b * b - a * c;
  if (disc < 0) return -1;
  let t = (-b - Math.sqrt(disc)) / a;
  if (t < 0) t = c < 0 ? 0 : -1;
  if (t < 0) return -1;
  const y = o.y + d.y * t;
  if (y < y0 || y > y1) return -1;
  return t;
}

// ===================================================================== zombies
export class Zombies {
  constructor(scene, fx) {
    this.scene = scene;
    this.fx = fx;
    this.map = new Map();
    this.dying = [];
    this.groanBudget = 0;
  }

  onSnapshot(ts, rows) {
    const seen = new Set();
    for (const r of rows) {
      const [id, type, x, y, z, yaw, state, tier, lost = 0] = r;
      seen.add(id);
      let e = this.map.get(id);
      if (!e) e = this.create(id, type, x, z, state);
      pushSample(e.buf, { ts, x, y, z, yaw });
      if (state === 1 && e.state !== 1) {
        e.attackT = 0;
        audio.swipe(x, z);
        if (Math.random() < 0.4) audio.groan(x, z, 1, true);
      }
      e.state = state;
      e.tier = tier;
      e.lastSeen = ts;
      if (lost !== e.lost) this.syncLimbs(e, lost);
    }
    for (const [id, e] of this.map) {
      if (!seen.has(id) && ts - e.lastSeen > 400) this.remove(id);
    }
  }

  create(id, type, x, z, state) {
    const root = new THREE.Group();
    let model, rig = null;
    if (type === 0 && rigLoaded()) {
      rig = new RigCharacter(zombieSkin(id), { height: 1.7 + ((id * 37) % 20) / 100 });
      model = rig.body;
      root.add(rig.root);
    } else {
      model = type === 1 ? CH.createDog() : CH.createZombie(id * 0.6180339);
      if (type === 0) CH.setZombieEyes(model, this.powered);
      root.add(model);
    }
    const shadow = blobShadow(type === 1 ? 1.1 : 0.9);
    root.add(shadow);
    root.position.set(x, 0, z);
    this.scene.add(root);
    const e = {
      id, type, root, model, rig, lost: 0, shadow, parts: model.userData.parts || {}, buf: [], state, tier: 0, phase: Math.random() * 6,
      lastSeen: 0, riseT: 0, attackT: 1, groanT: 1 + Math.random() * 4, prev: new THREE.Vector3(x, 0, z), speed: 0,
      headless: false,
    };
    if (type === 1 && state === 3) {
      this.fx.lightning(x, z);
      audio.lightning(x, z);
    }
    if (type === 0 && state === 3) {
      root.position.y = -1.8;
      this.fx.burst(new THREE.Vector3(x, 0.1, z), 10, { speed: 2, colors: ['#3a2e20', '#2a2218', '#4a3a28'], size: 0.12, life: 1.2, gravity: 8 });
    }
    this.map.set(id, e);
    return e;
  }

  remove(id) {
    const e = this.map.get(id);
    if (!e) return;
    this.scene.remove(e.root);
    CH.disposeModel(e.root);
    this.map.delete(id);
  }

  setPowered(on) {
    this.powered = on;
    for (const e of this.map.values()) if (e.type === 0) CH.setZombieEyes(e.model, on);
  }

  kill(id, kind, fling, part = 0, overkill = 0, dir = null) {
    const e = this.map.get(id);
    if (!e) return null;
    this.map.delete(id);
    const pos = e.root.position.clone();
    const d = { e, t: 0, kind, vel: null, spin: 0, back: Math.random() < 0.6 };
    if (e.rig) {
      this.rigDeath(e, d, kind, fling, part, overkill, dir);
      this.dying.push(d);
      return pos;
    }
    if (e.parts.eyes) e.parts.eyes.visible = false;
    if (kind === 'head' && e.type === 0) {
      e.parts.head.visible = false;
      this.fx.gib(pos.clone().setY(pos.y + 1.7));
    } else if (kind === 'thunder' && fling) {
      d.vel = new THREE.Vector3(fling[0] * 14, 7, fling[1] * 14);
      d.spin = (Math.random() - 0.5) * 14;
    } else if (kind === 'nuke') {
      const black = MD.mat('#110c0a');
      e.model.traverse((o) => { if (o.isMesh) o.material = black; });
      this.fx.burst(pos.clone().setY(1), 12, { speed: 2, colors: ['#ff7a2a', '#ffcf3f', '#333'], life: 0.8 });
    } else if (kind === 'splash') {
      this.fx.gib(pos.clone().setY(pos.y + 1));
      if (Math.random() < 0.5 && e.type === 0) e.parts.head.visible = false;
    } else {
      this.fx.blood(pos.clone().setY(pos.y + 1.2), null, 10);
    }
    if (kind !== 'nuke' && e.type === 0) this.fx.after(0.5, () => this.fx.bloodPool(pos, kind === 'splash' || kind === 'head' ? 1.5 : 1.1));
    if (kind !== 'nuke' && kind !== 'head' && Math.random() < 0.6) audio.zombieDeath(pos.x, pos.z);
    if (e.type === 1) {
      this.fx.explosion(pos.clone().setY(0.6), '#ff6a1a', 0.6);
      audio.explosion(pos.x, pos.z, 0.5);
    }
    this.dying.push(d);
    return pos;
  }

  // ---------------------------------------------------------------- gore (rigged zombies)
  goreOn() { return goreCfg.level !== 'off'; }
  extreme() { return goreCfg.level === 'extreme'; }

  /** Shoot a limb off: collapse the bone, spawn a flying chunk and a blood spurt from the stump. */
  sever(e, part, dir, power = 1) {
    const names = part === 1 ? ['Head'] : LIMB_BONE_NAMES[part];
    if (!names || !e.rig) return;
    const upper = Math.random() < (part >= 7 ? 0.45 : 0.55) || power > 1.5;
    const bone = part === 1 ? 'Head' : upper ? names[0] : names[1];
    const res = e.rig.cut(bone);
    if (!res) return;
    if (!this.goreOn()) return;
    const kind = part === 1 ? 'head' : part <= 6 ? (upper ? 'arm' : 'forearm') : (upper ? 'leg' : 'shin');
    const chunk = limbChunk(e.rig.skin, kind);
    const push = dir ? new THREE.Vector3(dir[0], 0, dir[2]).normalize() : new THREE.Vector3((Math.random() - 0.5), 0, (Math.random() - 0.5)).normalize();
    const vel = push.multiplyScalar(2.5 + power * 3).add(new THREE.Vector3((Math.random() - 0.5) * 2, 2.5 + Math.random() * 3 * power, (Math.random() - 0.5) * 2));
    this.fx.chunk(chunk, res.at, vel);
    const extreme = this.extreme();
    this.fx.blood(res.at, push, extreme ? 18 : 8);
    if (extreme) this.fx.spurt(res.parent, res.at, part === 1 ? 2.5 : 1.6);
  }

  /** server says a limb was shot off this zombie */
  limb(id, part, dir) {
    const e = this.map.get(id);
    if (!e || !e.rig) return;
    e.lost |= LIMB_BITS[part] || 0;
    this.sever(e, part, dir, 1);
    if (part >= 7) audio.zombieDeath(e.root.position.x, e.root.position.z);
  }

  syncLimbs(e, lost) {
    if (!e.rig) { e.lost = lost; return; }
    for (const [part, bit] of Object.entries(LIMB_BITS)) {
      if ((lost & bit) && !(e.lost & bit)) {
        const names = LIMB_BONE_NAMES[part];
        if (!e.rig.hidden.has(names[0]) && !e.rig.hidden.has(names[1])) e.rig.cut(names[1]);
      }
    }
    e.lost = lost;
  }

  rigDeath(e, d, kind, fling, part, overkill, dir) {
    const pos = e.root.position;
    const big = overkill > 0.6 || kind === 'splash' || kind === 'thunder' || kind === 'knife' && false;
    const gore = this.goreOn();
    if (kind === 'thunder' && fling) {
      d.vel = new THREE.Vector3(fling[0] * 14, 7, fling[1] * 14);
      d.spin = (Math.random() - 0.5) * 12;
    }
    if (kind === 'nuke') {
      e.rig.model.traverse((o) => { if (o.isMesh) o.material = MD.mat('#110c0a'); });
      this.fx.burst(pos.clone().setY(1), 12, { speed: 2, colors: ['#ff7a2a', '#ffcf3f', '#333'], life: 0.8 });
    } else if (gore) {
      // the killing blow takes something with it
      if (part === 1 && (overkill > 0.25 || this.extreme())) {
        this.sever(e, 1, dir, 1 + overkill);
        this.fx.gib(e.rig.boneWorld('Neck').setY(pos.y + 1.65));
      } else if (part >= 5 && part <= 8 && (overkill > 0.3 || this.extreme() && Math.random() < 0.6)) {
        this.sever(e, part, dir, 1 + overkill);
      }
      if (big) {
        // explosions and wonder weapons tear zombies apart
        const n = this.extreme() ? 2 + Math.floor(Math.random() * 3) : 1 + Math.floor(Math.random() * 2);
        const limbs = [5, 6, 7, 8, 1].sort(() => Math.random() - 0.5).slice(0, n);
        for (const l of limbs) this.sever(e, l, dir, 2);
        this.fx.gib(pos.clone().setY(pos.y + 1));
        if (this.extreme()) this.fx.gib(pos.clone().setY(pos.y + 0.6));
      }
      this.fx.blood(pos.clone().setY(pos.y + 1.2), null, this.extreme() ? 16 : 8);
    }
    if (kind !== 'nuke' && gore) this.fx.after(0.4, () => this.fx.bloodPool(pos.clone(), big ? 1.8 : 1.2));
    if (kind !== 'nuke' && part !== 1 && Math.random() < 0.6) audio.zombieDeath(pos.x, pos.z);
    e.rig.frozen = true;
    d.rig = true;
  }

  // all hittable zombies with their current render transforms
  raycast(origin, dir, maxDist) {
    const hits = [];
    const head = new THREE.Vector3();
    for (const e of this.map.values()) {
      const p = e.root.position;
      if (Math.abs(p.x - origin.x) > maxDist + 2 && Math.abs(p.z - origin.z) > maxDist + 2) continue;
      if (e.rig) {
        if (e.state === 3 && p.y < -1) continue;
        const h = raycastRig(e.rig, origin, dir, maxDist);
        if (h) hits.push({ id: e.id, part: h.part, dist: h.t, point: origin.clone().addScaledVector(dir, h.t), e });
        continue;
      }
      const fwdX = Math.sin(e.root.rotation.y), fwdZ = Math.cos(e.root.rotation.y);
      let best = -1, part = 0;
      if (e.type === 1) {
        head.set(p.x + fwdX * 0.55, p.y + 0.8, p.z + fwdZ * 0.55);
        const th = raySphere(origin, dir, head, 0.24);
        const body = _v.set(p.x, p.y + 0.6, p.z);
        const tb = raySphere(origin, dir, body, 0.5);
        if (th >= 0 && (tb < 0 || th <= tb + 0.2)) { best = th; part = 1; } else if (tb >= 0) { best = tb; part = 0; }
      } else {
        const lean = e.tier >= 2 ? 0.2 : 0.08;
        let headY = p.y + 1.78;
        if (e.parts.head.visible) {
          e.parts.head.localToWorld(head.set(0, 0.14, 0.02));
          headY = head.y;
          const th = raySphere(origin, dir, head, 0.19);
          if (th >= 0) { best = th; part = 1; }
        }
        const tb = rayCylinder(origin, dir, p.x + fwdX * lean * 0.5, p.z + fwdZ * lean * 0.5, p.y, headY - 0.17, MD.ZOMBIE_BODY_R);
        if (tb >= 0 && (best < 0 || tb < best - 0.15)) { best = tb; part = 0; }
      }
      if (best >= 0 && best <= maxDist) {
        hits.push({ id: e.id, part, dist: best, point: origin.clone().addScaledVector(dir, best), e });
      }
    }
    hits.sort((a, b) => a.dist - b.dist);
    return hits;
  }

  within(center, radius) {
    const out = [];
    for (const e of this.map.values()) {
      const p = e.root.position;
      const d = Math.hypot(p.x - center.x, p.y + 0.9 - center.y, p.z - center.z);
      if (d <= radius) out.push({ e, dist: d });
    }
    return out;
  }

  update(dt, renderTs, listener) {
    this.groanBudget = Math.min(3, this.groanBudget + dt * 1.5);
    for (const e of this.map.values()) {
      const s = sampleBuffer(e.buf, renderTs);
      if (!s) continue;
      const root = e.root;
      const prevX = root.position.x, prevZ = root.position.z;
      let targetY = s.y;
      if (e.state === 3 && e.type === 0) {
        e.riseT += dt;
        targetY = -1.8 + Math.min(1, e.riseT / 1.2) * 1.8;
        if (Math.random() < dt * 8) this.fx.burst(new THREE.Vector3(s.x, 0.05, s.z), 2, { speed: 1.5, colors: ['#3a2e20', '#4a3a28'], size: 0.1, life: 0.8 });
      }
      root.position.set(s.x, targetY, s.z);
      root.rotation.y = s.yaw;
      const sp = Math.hypot(s.x - prevX, s.z - prevZ) / Math.max(dt, 1e-3);
      e.speed += (Math.min(sp, 9) - e.speed) * Math.min(1, dt * 8);
      if (e.rig) this.animateRig(e, dt); else this.animate(e, dt);

      e.groanT -= dt;
      if (e.groanT <= 0) {
        e.groanT = 2.5 + Math.random() * 5;
        const d = Math.hypot(s.x - listener.x, s.z - listener.z);
        if (d < 22 && this.groanBudget >= 1) {
          this.groanBudget -= 1;
          if (e.type === 1) audio.bark(s.x, s.z);
          else audio.groan(s.x, s.z, 0.9 + Math.random() * 0.3, e.tier >= 3 && Math.random() < 0.3);
        }
      }
    }
    for (let i = this.dying.length - 1; i >= 0; i--) {
      const d = this.dying[i];
      d.t += dt;
      const { e } = d;
      if (d.rig) {
        const body = e.rig.body;
        if (d.vel) {
          d.vel.y -= 20 * dt;
          e.root.position.addScaledVector(d.vel, dt);
          if (e.root.position.y < 0) { e.root.position.y = 0; d.vel.multiplyScalar(0.3); d.vel.y = 0; }
          body.rotation.x += d.spin * dt * (d.vel.lengthSq() > 1 ? 1 : 0);
        } else if (!(e.lost & 12)) {
          const k = Math.min(1, d.t / 0.55);
          body.rotation.x = (d.back ? -1 : 1) * k * k * Math.PI / 2;
          body.position.y = k * 0.1;
          e.root.position.y = Math.max(0, e.root.position.y - dt * 2);
        }
      } else if (d.vel) {
        d.vel.y -= 20 * dt;
        e.root.position.addScaledVector(d.vel, dt);
        if (e.root.position.y < 0) { e.root.position.y = 0; d.vel.multiplyScalar(0.3); d.vel.y = 0; }
        e.model.rotation.x += d.spin * dt * (d.vel.lengthSq() > 1 ? 1 : 0);
      } else {
        const k = Math.min(1, d.t / 0.5);
        const ease = k * k;
        if (e.type === 1) {
          e.model.rotation.z = ease * Math.PI / 2;
          e.model.position.y = -ease * 0.2;
        } else {
          e.model.rotation.x = (d.back ? -1 : 1) * ease * Math.PI / 2;
          e.model.position.y = ease * 0.12;
          e.root.position.y = Math.max(0, e.root.position.y - dt * 2);
          e.parts.armL.rotation.x = -0.3 - k;
          e.parts.armR.rotation.x = -0.3 - k * 0.8;
          e.parts.kneeL.rotation.x = k * 0.6;
          e.parts.kneeR.rotation.x = k * 0.2;
        }
      }
      if (d.t > 3) e.root.position.y -= dt * 0.6;
      if (d.t > 3) e.shadow.visible = false;
      if (d.t > 4.2) {
        this.scene.remove(e.root);
        CH.disposeModel(e.root);
        this.dying.splice(i, 1);
      }
    }
    while (this.dying.length > 30) { const d = this.dying.shift(); this.scene.remove(d.e.root); CH.disposeModel(d.e.root); }
  }

  animateRig(e, dt) {
    const rig = e.rig;
    const crawler = (e.lost & 12) !== 0;
    const t = performance.now() / 1000 + e.id;
    if (crawler) {
      // legless: dragging itself along the floor
      rig.body.rotation.x = Math.PI / 2 - 0.15;
      rig.body.position.set(0, 0.28, -0.55);
      rig.animate(dt, Math.max(1.5, e.speed * 3), 0.6);
      rig.applyHidden();
      const k = Math.sin(t * 4);
      rig.reach([0.25, 1.45 + k * 0.12, 0.25], [-0.25, 1.45 - k * 0.12, 0.25], 0.3);
      return;
    }
    rig.body.rotation.x = 0;
    rig.body.position.set(0, 0, 0);
    const walker = e.tier < 2;
    rig.animate(dt, walker ? e.speed * 2.2 : e.speed, walker ? 0.55 : 1);
    rig.applyHidden();
    const sway = Math.sin(t * 2.2) * 0.06;
    if (e.state === 1) {
      e.attackT += dt;
      const k = Math.min(1, e.attackT / 0.35);
      const y = 1.45 - k * 0.6, z = 0.3 + k * 0.28;
      rig.reach([0.2, y, z], [-0.2, y + 0.08, z - 0.04]);
    } else if (e.state === 2) {
      const c = Math.sin(t * 6);
      rig.reach([0.18, 1.05 + c * 0.08, 0.45 + c * 0.12], [-0.18, 1.05 - c * 0.08, 0.45 - c * 0.12]);
    } else if (walker || e.state === 4) {
      // the classic zombie reach
      rig.reach([0.19, 1.04 + sway, 0.58], [-0.19, 1.02 - sway, 0.56]);
    }
  }

  animate(e, dt) {
    const P = e.parts;
    const sp = e.speed;
    if (e.type === 1) {
      e.phase += dt * (4 + sp * 2.2);
      const s = Math.sin(e.phase);
      P.legs[0].rotation.x = s * 0.9;
      P.legs[3].rotation.x = s * 0.9;
      P.legs[1].rotation.x = -s * 0.9;
      P.legs[2].rotation.x = -s * 0.9;
      P.body.position.y = 0.62 + Math.abs(Math.cos(e.phase)) * 0.06 * Math.min(1, sp / 3);
      P.tail.rotation.y = Math.sin(e.phase * 1.5) * 0.4;
      P.head.rotation.x = e.state === 1 ? -0.5 : Math.sin(e.phase) * 0.08;
      return;
    }
    const running = e.tier >= 2;
    e.phase += dt * (running ? 1.6 + sp * 1.5 : 1.2 + sp * 2.2);
    const s = Math.sin(e.phase), c = Math.cos(e.phase);
    const legAmp = Math.min(1, sp / (running ? 4 : 1.4)) * (running ? 0.85 : 0.45);
    P.legL.rotation.x = s * legAmp;
    P.legR.rotation.x = -s * legAmp;
    // knees bend while the leg swings back
    P.kneeL.rotation.x = Math.max(0, -c) * legAmp * (running ? 1.6 : 1.0) + 0.05;
    P.kneeR.rotation.x = Math.max(0, c) * legAmp * (running ? 1.6 : 1.0) + 0.05;
    P.torso.rotation.x = running ? 0.35 : 0.12;
    P.torso.rotation.z = Math.sin(e.phase * 0.5 + e.id) * (running ? 0.04 : 0.12);
    P.torso.rotation.y = s * (running ? 0.12 : 0.06);
    P.head.rotation.z = Math.sin(e.id * 3.1) * 0.35 + Math.sin(e.phase * 0.5) * 0.08;
    P.head.rotation.x = running ? -0.25 : -0.05;
    P.jaw.rotation.x = 0.25 + Math.abs(Math.sin(performance.now() / 260 + e.id)) * 0.3;
    P.hips.position.y = 0.94 + Math.abs(c) * (running ? 0.06 : 0.025) - (running ? 0.04 : 0);

    if (e.state === 1) {
      e.attackT += dt;
      const k = Math.min(1, e.attackT / 0.35);
      P.armL.rotation.x = -2.4 + k * 1.9;
      P.armR.rotation.x = -2.6 + Math.min(1, k * 1.3) * 2.0;
      P.elbowL.rotation.x = -0.3; P.elbowR.rotation.x = -0.3;
      P.jaw.rotation.x = 0.7;
    } else if (e.state === 2) {
      const cc = Math.sin(performance.now() / 160 + e.id);
      P.armL.rotation.x = -1.7 + cc * 0.5;
      P.armR.rotation.x = -1.7 - cc * 0.5;
      P.elbowL.rotation.x = -0.6 - cc * 0.4; P.elbowR.rotation.x = -0.6 + cc * 0.4;
      P.legL.rotation.x = 0; P.legR.rotation.x = 0;
      P.kneeL.rotation.x = 0.1; P.kneeR.rotation.x = 0.1;
    } else if (e.state === 4) {
      P.legL.rotation.x = -1.2; P.legR.rotation.x = -0.4;
      P.kneeL.rotation.x = 1.4; P.kneeR.rotation.x = 0.6;
      P.armL.rotation.x = -1.8; P.armR.rotation.x = -1.6;
    } else if (running) {
      P.armL.rotation.x = -0.9 - s * 0.9;
      P.armR.rotation.x = -0.9 + s * 0.9;
      P.elbowL.rotation.x = -0.9; P.elbowR.rotation.x = -0.9;
    } else {
      P.armL.rotation.x = -1.4 + Math.sin(e.phase * 0.7) * 0.12;
      P.armR.rotation.x = -1.3 - Math.sin(e.phase * 0.7) * 0.12;
      P.elbowL.rotation.x = -0.15 - Math.max(0, Math.sin(e.phase * 0.7)) * 0.2;
      P.elbowR.rotation.x = -0.25;
    }
    P.armL.rotation.z = 0.08;
    P.armR.rotation.z = -0.08;
  }

  clear() {
    for (const e of this.map.values()) this.scene.remove(e.root);
    for (const d of this.dying) this.scene.remove(d.e.root);
    this.map.clear();
    this.dying = [];
  }
}

// ===================================================================== remote players
export class RemotePlayers {
  constructor(scene, fx) {
    this.scene = scene;
    this.fx = fx;
    this.map = new Map();
    this.reviveTex = TX.labelTexture('✚ REVIVE', '#ff4a4a');
  }

  ensure(id, info) {
    let r = this.map.get(id);
    if (r) return r;
    const color = info?.color || '#ffffff';
    const root = new THREE.Group();
    let model, rig = null, parts;
    if (rigLoaded()) {
      rig = new RigCharacter('soldier', { height: 1.82 });
      root.add(rig.root);
      model = rig.body;
      // the gun pivots at shoulder height with the player's look pitch
      const pivot = new THREE.Group();
      pivot.position.set(0, 1.4, 0.08);
      rig.body.add(pivot);
      const gunHolder = new THREE.Group();
      gunHolder.position.set(0.13, -0.04, 0.38);
      gunHolder.rotation.y = Math.PI;
      pivot.add(gunHolder);
      // coloured armband so teammates are easy to tell apart
      const band = new THREE.Mesh(new THREE.TorusGeometry(1, 0.35, 6, 14), new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.4 }));
      const arm = rig.bones.LeftArm;
      band.scale.setScalar(0.07 / (arm.getWorldScale(new THREE.Vector3()).x || 1));
      band.rotation.x = Math.PI / 2;
      band.position.set(0, arm.children[0] ? arm.children[0].position.length() * 0.35 : 10, 0);
      arm.add(band);
      parts = { gunHolder, pivot };
    } else {
      model = CH.createSurvivor(color);
      root.add(model);
      parts = model.userData.parts;
    }
    root.add(blobShadow(0.9));
    const tag = MD.createNameTag(info?.name || `Player ${id}`, color);
    root.add(tag);
    const rev = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.reviveTex, transparent: true, depthTest: false }));
    rev.scale.set(1.8, 0.45, 1);
    rev.position.y = 1.4;
    rev.visible = false;
    root.add(rev);
    this.scene.add(root);
    r = { id, root, model, rig, parts, tag, rev, buf: [], flags: 0, wid: '', pap: 0, gun: null, phase: 0, speed: 0, name: info?.name || '', color, hp: 100, bleed: 0, reviveT: 0, lastStep: 0 };
    this.map.set(id, r);
    return r;
  }

  setInfo(id, info) {
    const r = this.map.get(id);
    if (!r || (r.name === info.name && r.color === info.color)) return;
    r.name = info.name;
    r.color = info.color;
    r.root.remove(r.tag);
    r.tag = MD.createNameTag(info.name, info.color);
    r.root.add(r.tag);
  }

  onSnapshot(ts, rows, meId, infos) {
    const seen = new Set();
    for (const row of rows) {
      const [id, x, y, z, yaw, pitch, flags, wid, pap, hp, bleed, reviveT] = row;
      if (id === meId) continue;
      seen.add(id);
      const r = this.ensure(id, infos.get(id));
      pushSample(r.buf, { ts, x, y, z, yaw, pitch });
      r.flags = flags;
      r.hp = hp;
      r.bleed = bleed;
      r.reviveT = reviveT;
      if (r.wid !== wid || r.pap !== pap) {
        r.wid = wid; r.pap = pap;
        if (r.gun) r.parts.gunHolder.remove(r.gun);
        r.gun = null;
        if (wid) {
          const gm = MD.createGun(wid, !!pap);
          r.gun = gm.group;
          r.gunFore = ['m1911', 'python', 'ray_gun'].includes(wid) ? 0.02 : Math.min(-0.15, gm.muzzle.z * 0.45);
          r.parts.gunHolder.add(r.gun);
        }
      }
    }
    for (const id of [...this.map.keys()]) if (!seen.has(id)) this.remove(id);
  }

  remove(id) {
    const r = this.map.get(id);
    if (!r) return;
    this.scene.remove(r.root);
    this.map.delete(id);
  }

  get(id) { return this.map.get(id); }

  muzzlePos(id) {
    const r = this.map.get(id);
    if (!r) return null;
    const y = r.root.rotation.y;
    const p = r.root.position;
    const crouch = r.flags & 4 ? -0.4 : 0;
    return new THREE.Vector3(p.x + Math.sin(y) * 0.9 + Math.cos(y) * 0.12, p.y + 1.42 + crouch, p.z + Math.cos(y) * 0.9 - Math.sin(y) * 0.12);
  }

  update(dt, renderTs) {
    for (const r of this.map.values()) {
      const s = sampleBuffer(r.buf, renderTs);
      if (!s) continue;
      const prevX = r.root.position.x, prevZ = r.root.position.z;
      r.root.position.set(s.x, s.y, s.z);
      // player yaw: camera looks down -Z at yaw 0, model faces +Z
      r.root.rotation.y = s.yaw + Math.PI;
      const sp = Math.hypot(s.x - prevX, s.z - prevZ) / Math.max(dt, 1e-3);
      r.speed += (Math.min(sp, 10) - r.speed) * Math.min(1, dt * 8);
      const P = r.parts;
      const downed = r.flags & 1, dead = r.flags & 2, crouch = r.flags & 4;
      r.root.visible = !dead;
      r.rev.visible = !!downed;
      r.tag.visible = !downed;
      if (r.rig) {
        const rig = r.rig;
        if (downed) {
          rig.body.rotation.x = -Math.PI / 2 + 0.2;
          rig.body.position.set(0, 0.25, 0.4);
          rig.animate(dt, 0);
          if (r.gun) r.gun.visible = false;
          r.rev.material.opacity = 0.6 + Math.sin(performance.now() / 150) * 0.4;
          continue;
        }
        if (r.gun) r.gun.visible = true;
        rig.body.rotation.x = crouch ? 0.25 : 0;
        rig.body.position.set(0, crouch ? -0.35 : 0, 0);
        rig.animate(dt, r.speed);
        P.pivot.rotation.x = -s.pitch;
        // hands on the gun: grip and handguard
        if (r.gun) {
          r.gun.updateWorldMatrix(true, false);
          const grip = new THREE.Vector3(0.015, -0.07, 0.06).applyMatrix4(r.gun.matrixWorld);
          const fore = new THREE.Vector3(-0.03, -0.05, r.gunFore || -0.25).applyMatrix4(r.gun.matrixWorld);
          rig.reachWorld(fore, grip);
        }
        if (r.speed > 2 && performance.now() - r.lastStep > 2400 / Math.max(r.speed, 1) * 0.6) {
          r.lastStep = performance.now();
          audio.footstep(0.08);
        }
        continue;
      }
      if (downed) {
        r.model.rotation.x = -1.3;
        r.model.position.y = 0.3;
        P.legL.rotation.x = 0; P.legR.rotation.x = 0;
        P.kneeL.rotation.x = 0; P.kneeR.rotation.x = 0;
        P.arms.rotation.x = 0.4;
        r.rev.material.opacity = 0.6 + Math.sin(performance.now() / 150) * 0.4;
        continue;
      }
      r.model.rotation.x = 0;
      r.model.position.y = 0;
      r.phase += dt * r.speed * 1.6;
      const amp = Math.min(1, r.speed / 5) * 0.7;
      P.legL.rotation.x = Math.sin(r.phase) * amp;
      P.legR.rotation.x = -Math.sin(r.phase) * amp;
      P.kneeL.rotation.x = Math.max(0, -Math.cos(r.phase)) * amp * 1.4 + (crouch ? 1.4 : 0);
      P.kneeR.rotation.x = Math.max(0, Math.cos(r.phase)) * amp * 1.4 + (crouch ? 1.0 : 0);
      P.hips.position.y = crouch ? 0.6 : 0.94;
      P.legL.rotation.x += crouch ? -0.9 : 0;
      P.legR.rotation.x += crouch ? 0.6 : 0;
      P.arms.rotation.x = -s.pitch * 0.9;
      P.head.rotation.x = -s.pitch * 0.5;
      P.torso.rotation.x = crouch ? 0.2 : 0;
      if (r.speed > 2 && performance.now() - r.lastStep > 2400 / Math.max(r.speed, 1) * 0.6) {
        r.lastStep = performance.now();
        audio.footstep(0.08);
      }
    }
  }

  clear() {
    for (const r of this.map.values()) this.scene.remove(r.root);
    this.map.clear();
  }
}

// ===================================================================== power-ups
export class Powerups {
  constructor(scene) {
    this.scene = scene;
    this.map = new Map();
    this.tex = {};
  }

  add(id, kind, x, z) {
    if (this.map.has(id)) return;
    if (!this.tex[kind]) this.tex[kind] = TX.powerupTexture(kind);
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.tex[kind], transparent: true, depthWrite: false }));
    sp.scale.setScalar(1.1);
    sp.position.set(x, 1, z);
    this.scene.add(sp);
    const light = MD.glowSprite('#5fff4a', 2.2, 0.5);
    light.position.set(x, 1, z);
    this.scene.add(light);
    this.map.set(id, { sp, light, t: 0, kind });
    audio.powerupSpawn(x, z);
  }

  remove(id) {
    const u = this.map.get(id);
    if (!u) return null;
    this.scene.remove(u.sp, u.light);
    u.sp.material.dispose();
    this.map.delete(id);
    return u;
  }

  update(dt) {
    for (const u of this.map.values()) {
      u.t += dt;
      u.sp.position.y = 1 + Math.sin(u.t * 3) * 0.12;
      const blink = u.t > 20 ? (Math.sin(u.t * (u.t > 25 ? 30 : 14)) > 0) : true;
      u.sp.visible = blink;
      u.light.visible = blink;
      u.light.position.y = u.sp.position.y;
      u.sp.material.rotation = Math.sin(u.t * 2) * 0.15;
    }
  }

  clear() {
    for (const id of [...this.map.keys()]) this.remove(id);
  }
}
