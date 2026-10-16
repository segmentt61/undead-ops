// Live 3D backdrop for the main menu: a real map, lit and fogged like the game, filmed by a slow
// cinematic camera while zombies shamble towards it. Shots cut between rooms every few seconds.
import * as THREE from 'three';
import { MAP, T, MAP_LIST, setMap, cellAt } from '/shared/map.js';
import { World } from './world.js';
import { RigCharacter, loadRig, rigLoaded, zombieSkin } from './rig.js';

const SHOT_TIME = 11;

export class MenuBackdrop {
  constructor(camera, quality, mapId) {
    this.camera = camera;
    this.mapId = mapId || MAP_LIST[Math.floor(Math.random() * MAP_LIST.length)].id;
    setMap(this.mapId);
    this.map = MAP;
    this.scene = new THREE.Scene();
    this.world = new World(this.scene, quality);
    this.world.setPower(true, false);
    this.viewScene = new THREE.Scene(); // the menu has no weapon view model
    this.shots = this.planShots();
    this.shot = -1;
    this.t = SHOT_TIME;
    this.zombies = [];
    this.fade = document.getElementById('menuFade');
    this.label = document.getElementById('menuMapLabel');
    if (this.label) this.label.textContent = `${this.map.name} · ${this.map.rooms[0].name}`;
    loadRig().then(() => this.spawnZombies()).catch(() => {});
  }

  /** For every room: stand near the middle and look down the longest clear line of floor. */
  planShots() {
    const shots = [];
    const free = (x, y) => cellAt(Math.floor(x), Math.floor(y), this.map) === T.FLOOR;
    for (const r of this.map.rooms) {
      const cx = (r.x0 + r.x1 + 1) / 2, cy = (r.y0 + r.y1 + 1) / 2;
      let best = null;
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2, dx = Math.sin(a), dz = Math.cos(a);
        // back up from the centre, then measure the clear view ahead
        let back = 0;
        while (back < 4 && free(cx - dx * (back + 0.6), cy - dz * (back + 0.6)) && free(cx - dx * (back + 0.6) + 0.4, cy - dz * (back + 0.6))) back += 0.5;
        const sx = cx - dx * back, sz = cy - dz * back;
        let ahead = 0;
        while (ahead < 30 && free(sx + dx * (ahead + 0.5), sz + dz * (ahead + 0.5))) ahead += 0.5;
        if (!free(sx, sz) || ahead < 4) continue;
        const score = ahead + back * 0.5;
        if (!best || score > best.score) best = { score, sx, sz, dx, dz, ahead, room: r };
      }
      if (best) shots.push(best);
    }
    return shots.length ? shots : [{ sx: this.map.playerSpawns[0][0], sz: this.map.playerSpawns[0][1], dx: 0, dz: -1, ahead: 6, room: this.map.rooms[0] }];
  }

  spawnZombies() {
    if (!rigLoaded() || this.disposed) return;
    for (let i = 0; i < 5; i++) {
      const rig = new RigCharacter(zombieSkin(i), { height: 1.7 + (i % 3) * 0.06 });
      this.scene.add(rig.root);
      this.zombies.push({ rig, x: 0, z: 0, speed: 0.55 + (i % 3) * 0.12, phase: i * 1.7, active: false });
    }
    this.placeZombies();
  }

  /** Put the zombies down the camera's line of sight, walking towards it. */
  placeZombies() {
    const s = this.shots[Math.max(0, this.shot)];
    if (!s) return;
    const free = (x, y) => cellAt(Math.floor(x), Math.floor(y), this.map) === T.FLOOR;
    this.zombies.forEach((z, i) => {
      const dist = Math.min(s.ahead - 0.5, 7 + i * 2.2 + Math.random() * 1.5);
      // keep them right of centre: the menu covers the left side of the screen
      const side = 0.3 + (i % 3) * 0.7 + Math.random() * 0.5;
      const x = s.sx + s.dx * dist - s.dz * side, zz = s.sz + s.dz * dist + s.dx * side;
      z.active = free(x, zz) && dist > 5;
      z.rig.root.visible = z.active;
      z.x = x; z.z = zz;
    });
  }

  nextShot() {
    this.shot = (this.shot + 1) % this.shots.length;
    this.t = 0;
    if (this.label) this.label.textContent = `${this.map.name} · ${this.shots[this.shot].room.name}`;
    this.placeZombies();
  }

  update(dt) {
    this.t += dt;
    if (this.t >= SHOT_TIME || this.shot < 0) this.nextShot();
    const s = this.shots[this.shot];
    const k = this.t / SHOT_TIME;
    // slow dolly forward with a gentle drift and breathing sway
    const travel = Math.min(2.2, s.ahead * 0.25) * k;
    const sway = Math.sin(this.t * 0.7) * 0.05;
    const px = s.sx + s.dx * travel + s.dz * sway, pz = s.sz + s.dz * travel - s.dx * sway;
    this.camera.position.set(px, 1.55 + Math.sin(this.t * 1.1) * 0.03, pz);
    const look = Math.sin(this.t * 0.25) * 0.18;
    const ldx = s.dx * Math.cos(look) + s.dz * Math.sin(look), ldz = s.dz * Math.cos(look) - s.dx * Math.sin(look);
    this.camera.lookAt(px + ldx * 10, 1.25, pz + ldz * 10);
    // fade through black around each cut
    if (this.fade) this.fade.style.opacity = String(Math.max(0, 1 - this.t / 0.9, (this.t - (SHOT_TIME - 0.7)) / 0.7));

    const free = (x, y) => cellAt(Math.floor(x), Math.floor(y), this.map) === T.FLOOR;
    for (const z of this.zombies) {
      if (!z.active) continue;
      const tx = px - z.x, tz = pz - z.z, d = Math.hypot(tx, tz);
      const nx = z.x + (tx / d) * z.speed * dt, nz = z.z + (tz / d) * z.speed * dt;
      if (d > 4.2 && free(nx, nz)) { z.x = nx; z.z = nz; }
      z.rig.root.position.set(z.x, 0, z.z);
      z.rig.root.rotation.y = Math.atan2(tx, tz);
      z.rig.animate(dt, z.speed * 2.2, 0.55);
      const sw = Math.sin(this.t * 2.2 + z.phase) * 0.06;
      z.rig.reach([0.19, 1.04 + sw, 0.58], [-0.19, 1.02 - sw, 0.56]);
    }
    this.world.update(dt, false, this.camera.position);
  }

  dispose() {
    this.disposed = true;
    if (this.fade) this.fade.style.opacity = '0';
    this.scene.traverse((o) => {
      if (o.geometry && !o.geometry.userData?.shared) o.geometry.dispose?.();
    });
  }
}
