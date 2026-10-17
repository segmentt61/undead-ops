// First-person weapons: viewmodel, firing, reloading, knife, grenades.
import * as THREE from 'three';
import { weaponStats } from '/shared/weapons.js';
import { raycastWorld, solidRanges } from '/shared/map.js';

// knife slash keyframes: [time 0..1, position (camera space), rotation (x, y, z)]
const KNIFE_KEYS = [
  [0.0, [0.3, -0.32, -0.34], [-0.2, 0.9, -0.4]],
  [0.16, [0.22, -0.04, -0.42], [0.45, 0.75, -1.1]],
  [0.34, [0.04, -0.1, -0.5], [0.0, 0.85, 0.15]],
  [0.55, [-0.14, -0.2, -0.46], [-0.3, 0.7, 0.55]],
  [1.0, [0.26, -0.46, -0.3], [-0.6, 0.4, 0.1]],
];
import { PERKS } from '/shared/config.js';
import * as MD from './models.js';
import * as CH from './characters.js';
import { FpArms, armsLoaded } from './arms.js';
import { SoldierArms, fpArmsReady } from './fparms.js';
import { audio } from './audio.js';

const HIP = new THREE.Vector3(0.13, -0.125, -0.42);
const PISTOLS = ['m1911', 'python', 'ray_gun'];
const r1 = (v) => Math.round(v * 10) / 10;
const r2 = (v) => Math.round(v * 100) / 100;
const r3 = (v) => Math.round(v * 1000) / 1000;

function makeSlot(id, pap) {
  const stats = weaponStats(id, pap);
  return { id, pap: !!pap, stats, mag: stats.mag, reserve: stats.reserve };
}

function cone(dir, deg) {
  if (deg <= 0) return dir.clone();
  const r = (deg * Math.PI / 180) * Math.sqrt(Math.random());
  const th = Math.random() * Math.PI * 2;
  const up = Math.abs(dir.y) < 0.99 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
  const u = new THREE.Vector3().crossVectors(dir, up).normalize();
  const v = new THREE.Vector3().crossVectors(dir, u).normalize();
  return dir.clone().multiplyScalar(Math.cos(r)).addScaledVector(u, Math.cos(th) * Math.sin(r)).addScaledVector(v, Math.sin(th) * Math.sin(r)).normalize();
}

function buildViewModel(id, pap) {
  const root = new THREE.Group();
  const { group, muzzle, top } = MD.createGun(id, pap);
  const vmScale = id === 'ray_gun' ? 0.75 : id === 'thundergun' ? 0.82 : 1;
  if (vmScale !== 1) { group.scale.setScalar(vmScale); muzzle.multiplyScalar(vmScale); }
  root.add(group);
  if (id !== 'knife' && !armsLoaded()) root.add(CH.createFpArms(Math.min(-0.16, muzzle.z * 0.55), PISTOLS.includes(id)));
  const flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: MD.flashTex(), color: id === 'ray_gun' ? (pap ? '#ff5050' : '#6dff5a') : '#ffd08a', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  flash.position.copy(muzzle);
  flash.scale.setScalar(0.25);
  flash.visible = false;
  root.add(flash);
  // side-on flash petals
  const petalMat = new THREE.MeshBasicMaterial({ map: MD.flashSideTex(), color: flash.material.color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const petals = new THREE.Group();
  for (let i = 0; i < 2; i++) {
    const pl = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 0.32), petalMat);
    pl.rotation.set(Math.PI / 2, i * Math.PI / 2, 0);
    pl.position.z = -0.14;
    petals.add(pl);
  }
  petals.position.copy(muzzle);
  flash.userData.petals = petals;
  petals.visible = false;
  root.add(petals);
  root.traverse((o) => { if (o.isMesh) o.frustumCulled = false; });
  return { root, muzzle, flash, top: (top ?? 0.08) * vmScale };
}

export class Weapons {
  constructor(game) {
    this.g = game;
    this.viewScene = new THREE.Scene();
    this.viewCam = new THREE.PerspectiveCamera(60, 1, 0.01, 10);
    this.viewScene.add(new THREE.HemisphereLight('#c8d0ff', '#4a3a2a', 1.6));
    const dl = new THREE.DirectionalLight('#ffe0c0', 1.4);
    dl.position.set(1, 2, 1.5);
    this.viewScene.add(dl);
    this.vFlash = new THREE.PointLight('#ffb060', 0, 3, 1);
    this.vFlash.position.set(0.1, 0, -0.6);
    this.viewScene.add(this.vFlash);
    this.holder = new THREE.Group();
    this.viewScene.add(this.holder);
    this.arms = fpArmsReady() ? new SoldierArms() : armsLoaded() ? new FpArms() : null;
    if (this.arms) this.viewScene.add(this.arms.root);
    this.knifeVM = buildViewModel('knife', false);
    this.knifeVM.root.visible = false;
    this.viewScene.add(this.knifeVM.root);
    this.nadeVM = MD.createGrenade();
    this.nadeVM.visible = false;
    this.viewScene.add(this.nadeVM);
    this.bottle = new THREE.Mesh(MD.boxGeo(0.07, 0.2, 0.07), new THREE.MeshLambertMaterial({ color: '#fff', emissive: '#fff', emissiveIntensity: 0.3 }));
    this.bottle.visible = false;
    this.viewScene.add(this.bottle);

    this.slots = [null, null];
    this.cur = 0;
    this.temp = null;
    this.downed = false;
    this.state = 'idle';
    this.stateT = 0;
    this.stateDur = 0;
    this.swapTo = -1;
    this.swapped = false;
    this.knifeHit = false;
    this.nadeThrown = false;
    this.reloadPhase = 0;
    this.nextFire = 0;
    this.burstLeft = 0;
    this.trigger = false;
    this.triggerFresh = false;
    this.adsHeld = false;
    this.adsT = 0;
    this.kick = 0;
    this.bloom = 0;
    this.sprintT = 0;
    this.swayX = 0; this.swayY = 0;
    this.lookDX = 0; this.lookDY = 0;
    this.vm = null;
    this.vmKey = '';
    this.time = 0;
    this.nades = [];
    this.flashT = 0;
    this.drinkColor = '#fff';
    this.emptyClicked = false;
  }

  setAspect(a) { this.viewCam.aspect = a; this.viewCam.updateProjectionMatrix(); }

  // ----------------------------------------------------------- inventory
  setInventory(weapons, cur) {
    this.slots = weapons.map((w) => (w ? makeSlot(w.id, w.pap) : null));
    this.cur = cur || 0;
    if (!this.slots[this.cur]) this.cur = this.slots.findIndex(Boolean);
    if (this.cur < 0) this.cur = 0;
    this.temp = null;
    this.downed = false;
    this.state = 'idle';
    this.raise();
  }

  give(slot, id, pap) {
    this.slots[slot] = makeSlot(id, pap);
    this.cur = slot;
    if (!this.downed) this.raise();
  }

  removeSlot(slot) {
    this.slots[slot] = null;
    if (this.cur === slot) {
      const other = this.slots.findIndex(Boolean);
      if (other >= 0) this.cur = other;
      this.raise();
    }
  }

  refill(id) {
    for (const s of this.slots) if (s && s.id === id) { s.mag = s.stats.mag; s.reserve = s.stats.reserve; }
  }

  refillAll() {
    for (const s of this.slots) if (s) s.reserve = s.stats.reserve;
    if (this.temp) this.temp.reserve = this.temp.stats.reserve;
  }

  setDowned(on) {
    this.downed = on;
    this.adsHeld = false;
    if (on) {
      const idx = this.slots.findIndex((s) => s && (s.id === 'm1911' || s.id === 'python'));
      if (idx >= 0) { this.cur = idx; this.temp = null; }
      else { this.temp = makeSlot('m1911', false); this.temp.reserve = 32; }
    } else {
      this.temp = null;
    }
    this.state = 'idle';
    this.raise();
  }

  active() {
    if (this.downed && this.temp) return this.temp;
    return this.slots[this.cur];
  }

  raise() {
    this.state = 'raise';
    this.stateT = this.stateDur = 0.35;
    this.refreshModel();
  }

  refreshModel() {
    const s = this.active();
    const key = s ? `${s.id}|${s.pap}` : '';
    if (key === this.vmKey) return;
    if (this.vm) this.holder.remove(this.vm.root);
    this.vm = null;
    this.vmKey = key;
    if (s) {
      this.vm = buildViewModel(s.id, s.pap);
      this.holder.add(this.vm.root);
      if (this.arms) this.arms.setWeapon(PISTOLS.includes(s.id), Math.max(-0.26, Math.min(-0.12, this.vm.muzzle.z * 0.36)));
    }
  }

  // ----------------------------------------------------------- actions
  canAct() { return this.state === 'idle' || this.state === 'reload'; }

  swap(slot) {
    if (this.downed || this.state === 'drink' || this.state === 'nade' || this.state === 'knife') return;
    if (slot === undefined) slot = 1 - this.cur;
    if (slot === this.cur || !this.slots[slot]) return;
    this.state = 'swap';
    this.stateT = this.stateDur = 0.55;
    this.swapTo = slot;
    this.swapped = false;
  }

  reload() {
    const s = this.active();
    if (!s || this.state !== 'idle' || s.mag >= s.stats.mag || s.reserve <= 0) return;
    const speed = this.g.me.perks.includes('speed') ? 0.5 : 1;
    this.state = 'reload';
    this.stateT = this.stateDur = s.stats.reload * speed;
    this.reloadPhase = 0;
    this.reloadSampled = audio.reloadStart(s.stats.cls, this.stateDur);
  }

  knife() {
    if (this.downed || !this.canAct()) return;
    this.state = 'knife';
    this.stateT = this.stateDur = 0.5;
    this.knifeHit = false;
    audio.knife();
  }

  throwNade() {
    if (this.downed || !this.canAct() || this.g.me.grenades <= 0) return;
    this.state = 'nade';
    this.stateT = this.stateDur = 0.65;
    this.nadeThrown = false;
  }

  drink(perk) {
    this.state = 'drink';
    this.stateT = this.stateDur = 1.9;
    this.drinkColor = PERKS[perk]?.color || '#fff';
    this.bottle.material.color.set(this.drinkColor);
    this.bottle.material.emissive.set(this.drinkColor);
    audio.perkDrink();
  }

  // ----------------------------------------------------------- firing
  fovMult() {
    const s = this.active();
    const z = s && s.stats.cls === 'sniper' ? 0.32 : 0.78;
    const e = this.adsEase();
    return 1 - e * (1 - z);
  }

  adsEase() { const t = this.adsT; return t * t * (3 - 2 * t); }

  spreadDeg() {
    const s = this.active();
    if (!s) return 0;
    const p = this.g.player;
    const hs = Math.hypot(p.vel.x, p.vel.z);
    const e = this.adsEase();
    let sp = s.stats.spread[0] + (s.stats.spread[1] - s.stats.spread[0]) * e;
    if (s.stats.pellets > 1) sp = s.stats.spread[0] * (1 - e * 0.3);
    sp *= 1 + Math.min(1, hs / 5) * 0.9 * (1 - e * 0.7);
    if (p.crouch) sp *= 0.8;
    if (!p.onGround) sp *= 1.8;
    return sp + this.bloom * (1 - e * 0.6);
  }

  tryFire() {
    const s = this.active();
    if (!s || this.state !== 'idle') return;
    if (this.g.player.sprinting) return;
    const st = s.stats;
    if (this.time < this.nextFire) return;
    const fresh = this.triggerFresh;
    if (st.mode === 'semi' && !fresh) return;
    if (st.mode === 'burst' && !fresh && this.burstLeft <= 0) return;
    if (s.mag <= 0) {
      if (fresh) {
        if (s.reserve > 0) this.reload();
        else { audio.click(); this.g.hud.reloadHint('NO AMMO'); }
      }
      this.triggerFresh = false;
      return;
    }
    if (st.mode === 'burst' && fresh) this.burstLeft = st.burst;
    this.triggerFresh = false;
    const dtap = this.g.me.perks.includes('dtap') ? 0.75 : 1;
    this.nextFire = this.time + (60 / st.rpm) * dtap;
    s.mag--;
    if (st.mode === 'burst') {
      this.burstLeft--;
      if (this.burstLeft <= 0) this.nextFire += 0.18;
    }
    this.shoot(s);
    if (s.mag <= 0 && s.reserve > 0) this.g.fx.after(0.25, () => { if (this.state === 'idle' && this.active() === s) this.reload(); });
  }

  muzzleWorld() {
    const cam = this.g.camera;
    const e = this.adsEase();
    const off = new THREE.Vector3(0.16 * (1 - e), -0.13 * (1 - e) - 0.04 * e, -0.75).applyQuaternion(cam.quaternion);
    return cam.position.clone().add(off);
  }

  shoot(s) {
    const g = this.g;
    const st = s.stats;
    const cam = g.camera;
    const origin = cam.position.clone();
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    const spread = this.spreadDeg();
    const muzzle = this.muzzleWorld();
    const openDoors = g.world.openDoors;
    let hits = [];
    let end = null;
    let anyHead = false;

    if (st.kind === 'thunder') {
      const range = st.range, half = (st.cone / 2) * Math.PI / 180;
      for (const e of g.zombies.map.values()) {
        const c = e.root.position.clone().setY(e.root.position.y + 1);
        const v = c.clone().sub(origin);
        const dist = v.length();
        if (dist > range) continue;
        if (v.normalize().angleTo(fwd) > half && dist > 1.5) continue;
        const wall = raycastWorld(origin.x, origin.y, origin.z, v.x, v.y, v.z, dist, openDoors);
        if (wall.dist < dist - 0.3) continue;
        hits.push([e.id, 0, r1(dist)]);
      }
      for (let i = 0; i < 60; i++) {
        const d = cone(fwd, st.cone / 2);
        g.fx.particle(muzzle, d.multiplyScalar(14 + Math.random() * 10), { color: Math.random() < 0.5 ? '#cfefff' : '#ffffff', life: 0.5, size: 0.08, gravity: 0, drag: 2.5 });
      }
      g.fx.flash(muzzle, '#9fd8ff', 20, 0.25);
      g.player.shake = 0.06;
      g.player.vel.addScaledVector(fwd, -4);
      end = origin.clone().addScaledVector(fwd, range);
    } else if (st.kind === 'ray' || st.kind === 'launcher') {
      const d = cone(fwd, spread);
      const wall = raycastWorld(origin.x, origin.y, origin.z, d.x, d.y, d.z, 120, openDoors);
      const zh = g.zombies.raycast(origin, d, wall.dist);
      const dist = zh.length ? zh[0].dist : wall.dist;
      const P = origin.clone().addScaledVector(d, Math.max(0.3, dist - 0.05));
      const direct = zh[0];
      if (direct) hits.push([direct.id, 3, 0]);
      for (const { e, dist: dd } of g.zombies.within(P, st.splash.r)) {
        if (direct && e.id === direct.id) continue;
        hits.push([e.id, 4, r1(dd)]);
      }
      end = P;
      const color = st.kind === 'launcher' ? '#ff9a3a' : s.pap ? '#ff3a3a' : '#5dff4a';
      const fx = g.fx;
      fx.bolt(muzzle, P, color, st.kind === 'launcher' ? 45 : 70, (p) => {
        fx.explosion(p, color, st.kind === 'launcher' ? 1 : 0.6);
        if (st.kind === 'launcher') audio.explosion(p.x, p.z, 0.8); else audio.rayImpact(p.x, p.z, s.pap);
      }, st.kind === 'launcher' ? 0.4 : 0.6);
    } else {
      for (let i = 0; i < st.pellets; i++) {
        const d = cone(fwd, spread);
        const wall = raycastWorld(origin.x, origin.y, origin.z, d.x, d.y, d.z, 150, openDoors);
        const zh = g.zombies.raycast(origin, d, wall.dist).slice(0, st.pen);
        for (const h of zh) {
          hits.push([h.id, h.part, r1(h.dist)]);
          if (h.part === 1) anyHead = true;
          if (h.e && h.e.rig) h.e.rig.flinch(d, h.part, st.damage || 30);
          if (g.gore !== 'off') {
            g.fx.blood(h.point, d, (h.part === 1 ? 7 : 4) * (g.gore === 'extreme' ? 2 : 1));
            // exit wound: blood sprays onto the wall or floor behind the zombie
            const back = raycastWorld(h.point.x, h.point.y, h.point.z, d.x, d.y - 0.15, d.z, 3.5, openDoors);
            if (back.normal && back.dist < 3.5 && Math.random() < (g.gore === 'extreme' ? 0.85 : 0.4)) {
              const wp = h.point.clone().add(new THREE.Vector3(d.x, d.y - 0.15, d.z).multiplyScalar(back.dist));
              g.fx.bloodSplat(wp, new THREE.Vector3(...back.normal), h.part === 1 ? 1.3 : 0.9);
            }
          }
        }
        const stopped = zh.length >= st.pen;
        const p = stopped ? zh[zh.length - 1].point : origin.clone().addScaledVector(d, wall.dist);
        if (!stopped && wall.normal && wall.dist < 150) {
          const n = new THREE.Vector3(...wall.normal);
          if (st.pellets === 1 || i % 2 === 0) g.fx.sparks(p, n);
          g.fx.decal(p, n);
        }
        if (i === 0) end = p;
        if (st.pellets === 1 || i % 3 === 0) g.fx.tracer(muzzle, p, s.pap ? '#e0a0ff' : '#ffe6a0', 1, st.pellets > 1 ? 0.05 : 0.07);
      }
      g.fx.muzzle(muzzle, '#ffb060', st.cls === 'shotgun' || st.cls === 'sniper');
    }

    if (st.kind === 'hitscan') {
      const cam = g.camera;
      const right = new THREE.Vector3(1, 0, 0).applyQuaternion(cam.quaternion);
      const up = new THREE.Vector3(0, 1, 0).applyQuaternion(cam.quaternion);
      const e = this.adsEase();
      const pos = cam.position.clone().addScaledVector(right, 0.1 * (1 - e) + 0.03).addScaledVector(up, -0.06).addScaledVector(fwd, 0.35);
      const vel = right.clone().multiplyScalar(2.2 + Math.random()).addScaledVector(up, 1.6 + Math.random()).addScaledVector(g.player.vel, 1).addScaledVector(fwd, -0.3);
      const delay = st.cls === 'shotgun' && st.sound === 'shotgun_pump' ? 0.35 : 0;
      if (st.sound !== 'shotgun_double') {
        if (delay) g.fx.after(delay, () => g.fx.casing(g.camera.position.clone().addScaledVector(right, 0.1).addScaledVector(up, -0.08), vel, true));
        else g.fx.casing(pos, vel, st.cls === 'shotgun');
      }
    }
    if (hits.length) {
      const first = g.zombies.map.get(hits[0][0]);
      if (first && Math.random() < 0.3) audio.zombieHit(first.root.position.x, first.root.position.z);
      g.hud.hitmarker(false);
      audio.hit(anyHead, false);
    }
    g.net.send({
      t: 'fire', w: s.id, pap: s.pap, k: st.kind === 'hitscan' ? 'shot' : st.kind, h: hits,
      o: [r2(muzzle.x), r2(muzzle.y), r2(muzzle.z)], d: [r3(fwd.x), r3(fwd.y), r3(fwd.z)],
      e: end ? [r2(end.x), r2(end.y), r2(end.z)] : null,
    });
    audio.shot(st.sound, undefined, undefined, true, s.pap);
    if (g.rumble) g.rumble(Math.min(1, st.recoil * 0.12), Math.min(1, st.recoil * 0.2), st.cls === 'shotgun' || st.kind === 'thunder' ? 160 : 60);
    g.player.addRecoil(st.recoil * (1 - this.adsEase() * 0.45));
    this.kick = Math.min(1.5, this.kick + st.recoil * 0.25);
    this.bloom = Math.min(6, this.bloom + st.recoil * 0.3);
    if (this.vm) {
      this.vm.flash.visible = true;
      this.vm.flash.material.rotation = Math.random() * 6;
      this.vm.flash.scale.setScalar(0.18 + Math.random() * 0.15);
      const pet = this.vm.flash.userData.petals;
      if (pet && st.kind === 'hitscan') { pet.visible = true; pet.rotation.z = Math.random() * 6; pet.scale.setScalar(0.8 + Math.random() * 0.5); }
      this.flashT = 0.045;
      this.vFlash.intensity = 6;
    }
  }

  doKnife() {
    const g = this.g;
    const p = g.player;
    const fwdX = -Math.sin(p.yaw), fwdZ = -Math.cos(p.yaw);
    let best = null, bd = 2.3;
    for (const e of g.zombies.map.values()) {
      const dx = e.root.position.x - p.pos.x, dz = e.root.position.z - p.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > bd || d < 0.01) continue;
      if ((dx * fwdX + dz * fwdZ) / d < 0.45) continue;
      best = e; bd = d;
    }
    if (best) {
      if (bd > 1.1) { p.vel.x += fwdX * 7; p.vel.z += fwdZ * 7; }
      g.net.send({ t: 'fire', k: 'knife', h: [[best.id, 0, r1(bd)]] });
      g.fx.blood(best.root.position.clone().setY(1.3), new THREE.Vector3(fwdX, 0, fwdZ), 10);
      g.hud.hitmarker(false);
      audio.stab();
    }
  }

  // ----------------------------------------------------------- grenades
  spawnNade(o, v, own) {
    const mesh = MD.createGrenade();
    mesh.position.copy(o);
    this.g.scene.add(mesh);
    this.nades.push({ mesh, pos: o.clone(), vel: v.clone(), fuse: 2.2, own });
  }

  updateNades(dt) {
    const open = this.g.world.openDoors;
    const blocked = (x, y, z) => solidRanges(Math.floor(x), Math.floor(z), open).some(([b, t]) => y >= b && y <= t);
    for (let i = this.nades.length - 1; i >= 0; i--) {
      const n = this.nades[i];
      n.vel.y -= 16 * dt;
      const nx = n.pos.x + n.vel.x * dt, ny = n.pos.y + n.vel.y * dt, nz = n.pos.z + n.vel.z * dt;
      let bounced = false;
      if (blocked(nx, n.pos.y, n.pos.z)) { n.vel.x *= -0.4; bounced = true; } else n.pos.x = nx;
      if (blocked(n.pos.x, n.pos.y, nz)) { n.vel.z *= -0.4; bounced = true; } else n.pos.z = nz;
      if (ny < 0.07 || blocked(n.pos.x, ny, n.pos.z)) {
        if (Math.abs(n.vel.y) > 2) bounced = true;
        n.vel.y *= -0.35; n.vel.x *= 0.65; n.vel.z *= 0.65;
        if (ny < 0.07) n.pos.y = 0.07;
      } else n.pos.y = ny;
      if (n.pos.y > 3.9) { n.pos.y = 3.9; n.vel.y = -Math.abs(n.vel.y) * 0.3; }
      if (bounced) audio.nadeBounce(n.pos.x, n.pos.z);
      n.mesh.position.copy(n.pos);
      n.mesh.rotation.x += dt * n.vel.length() * 2;
      n.fuse -= dt;
      if (n.fuse <= 0) {
        this.g.scene.remove(n.mesh);
        this.nades.splice(i, 1);
        this.g.fx.explosion(n.pos, '#ff8a2a', 1.2);
        audio.explosion(n.pos.x, n.pos.z, 1);
        const dme = Math.hypot(n.pos.x - this.g.player.pos.x, n.pos.z - this.g.player.pos.z);
        if (dme < 8) this.g.player.shake = Math.max(this.g.player.shake, 0.05 * (1 - dme / 8));
        if (n.own) {
          const hits = [];
          for (const { e, dist } of this.g.zombies.within(n.pos, 6)) {
            const c = e.root.position.clone().setY(1);
            const v = c.clone().sub(n.pos);
            const len = v.length();
            v.normalize();
            const w = raycastWorld(n.pos.x, n.pos.y + 0.1, n.pos.z, v.x, v.y, v.z, len, open);
            if (w.dist < len - 0.4) continue;
            hits.push([e.id, 0, r1(dist)]);
          }
          this.g.net.send({ t: 'fire', k: 'nade', h: hits });
        }
      }
    }
  }

  // ----------------------------------------------------------- per frame
  update(dt) {
    this.time += dt;
    const g = this.g;
    const s = this.active();

    // state machine
    if (this.state !== 'idle') {
      this.stateT -= dt;
      const k = 1 - Math.max(0, this.stateT) / this.stateDur;
      if (this.state === 'reload' && s) {
        const shotgun = s.stats.cls === 'shotgun';
        if (this.reloadPhase === 0 && k > 0.2) { this.reloadPhase = 1; if (!this.reloadSampled) audio.reload(shotgun ? 'in' : 'out'); }
        if (this.reloadPhase === 1 && k > 0.5) { this.reloadPhase = 2; if (!this.reloadSampled) audio.reload('in'); }
        if (this.reloadPhase === 2 && k > 0.8) { this.reloadPhase = 3; if (shotgun) { if (!audio.pumpRack()) audio.reload('bolt'); } else if (!this.reloadSampled) audio.reload('bolt'); }
        if (this.stateT <= 0) {
          const need = s.stats.mag - s.mag;
          const take = Math.min(need, s.reserve);
          s.mag += take;
          s.reserve -= take;
          this.state = 'idle';
        }
      } else if (this.state === 'swap') {
        if (!this.swapped && k >= 0.5) { this.swapped = true; this.cur = this.swapTo; this.refreshModel(); }
        if (this.stateT <= 0) this.state = 'idle';
      } else if (this.state === 'knife') {
        if (!this.knifeHit && k > 0.25) { this.knifeHit = true; this.doKnife(); }
        if (this.stateT <= 0) this.state = 'idle';
      } else if (this.state === 'nade') {
        if (!this.nadeThrown && k > 0.4) {
          this.nadeThrown = true;
          const cam = g.camera;
          const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
          const o = cam.position.clone().addScaledVector(fwd, 0.4).add(new THREE.Vector3(0, -0.1, 0));
          const v = fwd.clone().multiplyScalar(14).add(new THREE.Vector3(0, 3, 0)).addScaledVector(g.player.vel, 0.5);
          this.spawnNade(o, v, true);
          g.me.grenades = Math.max(0, g.me.grenades - 1);
          g.net.send({ t: 'nade', o: [r2(o.x), r2(o.y), r2(o.z)], v: [r2(v.x), r2(v.y), r2(v.z)] });
          audio.knife();
        }
        if (this.stateT <= 0) this.state = 'idle';
      } else if (this.stateT <= 0) {
        this.state = 'idle';
      }
    }

    // ADS
    const canAds = this.adsHeld && s && (this.state === 'idle' || this.state === 'reload') && !g.player.sprinting;
    this.adsT = Math.max(0, Math.min(1, this.adsT + (canAds ? dt * 7 : -dt * 8)));

    // fire
    if (this.trigger || this.burstLeft > 0) this.tryFire();
    if (!this.trigger) this.triggerFresh = false;

    this.kick *= Math.exp(-dt * 14);
    this.bloom *= Math.exp(-dt * 5);
    this.flashT -= dt;
    if (this.flashT <= 0 && this.vm) {
      this.vm.flash.visible = false;
      if (this.vm.flash.userData.petals) this.vm.flash.userData.petals.visible = false;
      this.vFlash.intensity = 0;
    }

    this.updateNades(dt);
    this.updateViewModel(dt);
  }

  updateViewModel(dt) {
    const g = this.g;
    const p = g.player;
    const e = this.adsEase();
    const s = this.active();
    const sprint = p.sprinting && this.state === 'idle' ? 1 : 0;
    this.sprintT += (sprint - this.sprintT) * Math.min(1, dt * 9);

    this.swayX += (-this.lookDX * 0.0009 - this.swayX) * Math.min(1, dt * 10);
    this.swayY += (-this.lookDY * 0.0009 - this.swayY) * Math.min(1, dt * 10);
    this.lookDX = 0; this.lookDY = 0;
    const swayK = 1 - e * 0.8;

    const h = this.holder;
    const bob = p.bobAmt * (1 - e * 0.85);
    const sightY = this.vm ? this.vm.top - 0.012 : 0.07;
    const ads = new THREE.Vector3(0, -sightY, -0.44);
    const vfov = 60 - 16 * e;
    if (Math.abs(this.viewCam.fov - vfov) > 0.01) { this.viewCam.fov = vfov; this.viewCam.updateProjectionMatrix(); }
    h.position.lerpVectors(HIP, ads, e);
    h.position.x += Math.cos(p.bobT) * 0.012 * bob + this.swayX * 0.3 * swayK + this.sprintT * 0.02;
    h.position.y += -Math.abs(Math.sin(p.bobT)) * 0.014 * bob + this.swayY * 0.3 * swayK - this.sprintT * 0.04 - p.landKick * 0.4;
    h.position.z += this.kick * 0.05;
    h.rotation.set(this.kick * 0.09 + this.swayY * swayK - this.sprintT * 0.35, this.swayX * swayK + this.sprintT * 0.6, this.sprintT * 0.15 + (p.downed ? 0.15 : 0));
    // handguns sit canted in at the hip so you see the slide, not just its back
    if (PISTOLS.includes(this.active()?.id)) { h.rotation.y += 0.12 * (1 - e); h.position.z += 0.06 * (1 - e); }

    let lower = 0;
    const k = this.stateDur ? 1 - Math.max(0, this.stateT) / this.stateDur : 1;
    if (this.state === 'reload') {
      const dip = Math.sin(k * Math.PI);
      h.rotation.x -= 0.5 * dip;
      h.rotation.z += 0.6 * dip;
      h.position.y -= 0.08 * dip;
    } else if (this.state === 'swap') lower = 1 - Math.abs(k * 2 - 1);
    else if (this.state === 'raise') lower = 1 - k;
    else if (this.state === 'knife' || this.state === 'nade') lower = Math.sin(Math.min(1, k * 1.3) * Math.PI) * 0.8;
    else if (this.state === 'drink') lower = k < 0.15 ? k / 0.15 : k > 0.85 ? (1 - k) / 0.15 : 1;
    h.position.y -= lower * 0.35;
    h.rotation.x -= lower * 0.5;
    h.visible = !(s && s.stats.cls === 'sniper' && e > 0.92);
    g.hud.setScope(s && s.stats.cls === 'sniper' && e > 0.92);

    // knife viewmodel
    const kv = this.knifeVM.root;
    kv.visible = this.state === 'knife';
    if (kv.visible) {
      // BO-style slash: wind up at the right, cut down and across the screen, recover low
      const K = KNIFE_KEYS;
      let i = 0;
      while (i < K.length - 2 && k > K[i + 1][0]) i++;
      const [t0, p0, r0] = K[i], [t1, p1, r1] = K[i + 1];
      const u = Math.min(1, Math.max(0, (k - t0) / (t1 - t0)));
      const e2 = u * u * (3 - 2 * u);
      kv.position.set(p0[0] + (p1[0] - p0[0]) * e2, p0[1] + (p1[1] - p0[1]) * e2, p0[2] + (p1[2] - p0[2]) * e2);
      kv.rotation.set(r0[0] + (r1[0] - r0[0]) * e2, r0[1] + (r1[1] - r0[1]) * e2, r0[2] + (r1[2] - r0[2]) * e2);
    }
    this.nadeVM.visible = this.state === 'nade' && !this.nadeThrown;
    if (this.nadeVM.visible) this.nadeVM.position.set(0.25 - k * 0.2, -0.2 + k * 0.25, -0.5);
    this.bottle.visible = this.state === 'drink' && k > 0.15 && k < 0.88;
    if (this.bottle.visible) {
      const bk = (k - 0.15) / 0.73;
      this.bottle.position.set(0.05, -0.2 + Math.sin(bk * Math.PI) * 0.12, -0.32);
      this.bottle.rotation.set(Math.min(1, bk * 2) * 1.6, 0, 0.2);
    }
    this.updateArms(k);
  }

  updateArms(k) {
    const arms = this.arms;
    if (!arms) return;
    arms.root.visible = !!this.vm && this.holder.visible;
    if (!this.vm) return;
    this.holder.updateMatrixWorld(true);
    arms.aimAtGun(this.vm.root);
    // reload: the support hand goes down to the magazine and back
    if (this.state === 'reload') {
      const t = Math.sin(Math.min(1, Math.max(0, (k - 0.1) / 0.7)) * Math.PI);
      const mag = new THREE.Vector3(-0.02, -0.16, -0.06).applyMatrix4(this.vm.root.matrixWorld);
      arms.targets.L.pos.lerp(mag, t);
    }
    // knife / grenade / perk bottle are held in the right hand
    const held = this.state === 'knife' ? this.knifeVM.root : this.state === 'nade' && this.nadeVM.visible ? this.nadeVM : this.bottle.visible ? this.bottle : null;
    if (held) {
      held.updateMatrixWorld(true);
      const pos = new THREE.Vector3(0.015, -0.03, 0.07).applyMatrix4(held.matrixWorld);
      const q = held.getWorldQuaternion(new THREE.Quaternion()).multiply(arms.pose.right.rot);
      arms.setHand('R', pos, q);
    }
    arms.solve();
  }

  // Effects for other players' shots
  remoteFire(msg, muzzle) {
    const g = this.g;
    const st = weaponStats(msg.w, msg.pap);
    if (!st || !muzzle) return;
    audio.shot(st.sound, muzzle.x, muzzle.z, false, msg.pap);
    const end = msg.e ? new THREE.Vector3(...msg.e) : null;
    if (st.kind === 'ray' || st.kind === 'launcher') {
      if (!end) return;
      const color = st.kind === 'launcher' ? '#ff9a3a' : msg.pap ? '#ff3a3a' : '#5dff4a';
      g.fx.bolt(muzzle, end, color, st.kind === 'launcher' ? 45 : 70, (p) => {
        g.fx.explosion(p, color, st.kind === 'launcher' ? 1 : 0.6);
        if (st.kind === 'launcher') audio.explosion(p.x, p.z, 0.8); else audio.rayImpact(p.x, p.z, msg.pap);
      }, 0.5);
    } else if (st.kind === 'thunder') {
      const d = msg.d ? new THREE.Vector3(...msg.d) : new THREE.Vector3(0, 0, -1);
      for (let i = 0; i < 40; i++) g.fx.particle(muzzle, cone(d, st.cone / 2).multiplyScalar(14 + Math.random() * 8), { color: '#cfefff', life: 0.5, size: 0.08, gravity: 0, drag: 2.5 });
    } else {
      g.fx.muzzle(muzzle, '#ffb060', st.cls === 'shotgun');
      if (end) g.fx.tracer(muzzle, end, msg.pap ? '#e0a0ff' : '#ffe6a0');
    }
  }

  clearNades() {
    for (const n of this.nades) this.g.scene.remove(n.mesh);
    this.nades = [];
  }
}
