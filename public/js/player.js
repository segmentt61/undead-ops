// Local first-person movement + collision against the map grid.
import * as THREE from 'three';
import * as C from '/shared/config.js';
import { solidRanges } from '/shared/map.js';
import { audio } from './audio.js';

const STAND_H = 1.8, CROUCH_H = 1.2;

export class LocalPlayer {
  constructor(world) {
    this.world = world;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.yaw = 0;
    this.pitch = 0;
    this.onGround = true;
    this.crouch = false;
    this.sprinting = false;
    this.downed = false;
    this.eye = C.EYE_HEIGHT;
    this.bobT = 0;
    this.bobAmt = 0;
    this.recoil = 0;      // camera kick (radians), recovers over time
    this.shake = 0;
    this.stepAcc = 0;
    this.landKick = 0;
  }

  spawn(x, z, yaw = 0) {
    this.pos.set(x, 0, z);
    this.vel.set(0, 0, 0);
    this.yaw = yaw;
    this.pitch = 0;
    this.recoil = 0;
  }

  look(dx, dy, sens) {
    this.yaw -= dx * 0.0022 * sens;
    this.pitch -= dy * 0.0022 * sens;
    this.pitch = Math.max(-1.5, Math.min(1.5, this.pitch));
  }

  addRecoil(amount) {
    this.recoil += amount * 0.012;
    this.yaw += (Math.random() - 0.5) * amount * 0.004;
  }

  blocks(cx, cy, feet, height) {
    for (const [b, t] of solidRanges(cx, cy, this.world.openDoors)) {
      if (t > feet + 0.05 && b < feet + height) return true;
    }
    return false;
  }

  collide(height) {
    const r = C.PLAYER_RADIUS;
    for (let iter = 0; iter < 3; iter++) {
      // the mystery box moves around the map, so it is a loose box collider instead of a grid cell
      const bx = this.world.boxCollider && this.world.boxCollider();
      if (bx && this.pos.y < 1.0) {
        const px = Math.max(bx.x0, Math.min(this.pos.x, bx.x1));
        const pz = Math.max(bx.z0, Math.min(this.pos.z, bx.z1));
        const dx = this.pos.x - px, dz = this.pos.z - pz, d = Math.hypot(dx, dz);
        if (d < r && d > 1e-5) { this.pos.x += (dx / d) * (r - d); this.pos.z += (dz / d) * (r - d); }
      }
      const cx = Math.floor(this.pos.x), cy = Math.floor(this.pos.z);
      for (let y = cy - 1; y <= cy + 1; y++)
        for (let x = cx - 1; x <= cx + 1; x++) {
          if (!this.blocks(x, y, this.pos.y, height)) continue;
          const px = Math.max(x, Math.min(this.pos.x, x + 1));
          const pz = Math.max(y, Math.min(this.pos.z, y + 1));
          const dx = this.pos.x - px, dz = this.pos.z - pz;
          const d = Math.hypot(dx, dz);
          if (d >= r) continue;
          if (d < 1e-5) {
            const l = this.pos.x - x, rr = x + 1 - this.pos.x, t = this.pos.z - y, b = y + 1 - this.pos.z;
            const m = Math.min(l, rr, t, b);
            if (m === l) this.pos.x = x - r; else if (m === rr) this.pos.x = x + 1 + r; else if (m === t) this.pos.z = y - r; else this.pos.z = y + 1 + r;
          } else {
            const push = r - d;
            this.pos.x += (dx / d) * push;
            this.pos.z += (dz / d) * push;
            // kill velocity into the wall
            const nx = dx / d, nz = dz / d;
            const vn = this.vel.x * nx + this.vel.z * nz;
            if (vn < 0) { this.vel.x -= vn * nx; this.vel.z -= vn * nz; }
          }
        }
    }
  }

  groundHeight() {
    const r = C.PLAYER_RADIUS * 0.75;
    let g = 0;
    for (const [ox, oz] of [[-r, -r], [r, -r], [-r, r], [r, r], [0, 0]]) {
      const cx = Math.floor(this.pos.x + ox), cy = Math.floor(this.pos.z + oz);
      for (const [, t] of solidRanges(cx, cy, this.world.openDoors)) {
        if (t < 50 && t <= this.pos.y + 0.06) g = Math.max(g, t);
      }
    }
    return g;
  }

  /** input: { f, r, jump, sprint, crouch }, ads: 0..1, moveMult: weapon speed */
  update(dt, input, ads, moveMult) {
    const wantCrouch = input.crouch && !this.downed;
    this.crouch = wantCrouch;
    const moving = input.f !== 0 || input.r !== 0;
    this.sprinting = !this.downed && input.sprint && input.f > 0 && !wantCrouch && ads < 0.3;
    let speed = this.downed ? C.DOWNED_SPEED : wantCrouch ? C.CROUCH_SPEED : this.sprinting ? C.SPRINT_SPEED : C.PLAYER_SPEED;
    speed *= moveMult * (1 - ads * 0.4);

    // wish direction in world space
    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    let wx = -sin * input.f + cos * input.r;
    let wz = -cos * input.f - sin * input.r;
    const wl = Math.hypot(wx, wz);
    if (wl > 0) { wx /= wl; wz /= wl; }

    const accel = this.onGround ? 14 : 3.5;
    const k = Math.min(1, accel * dt);
    this.vel.x += (wx * speed - this.vel.x) * k;
    this.vel.z += (wz * speed - this.vel.z) * k;

    if (input.jump && this.onGround && !this.downed && !wantCrouch) {
      this.vel.y = C.JUMP_VELOCITY;
      this.onGround = false;
    }
    this.vel.y -= C.GRAVITY * dt;

    const height = this.downed ? 0.6 : wantCrouch ? CROUCH_H : STAND_H;
    // horizontal move in two sub-steps for stability
    for (let i = 0; i < 2; i++) {
      this.pos.x += this.vel.x * dt / 2;
      this.pos.z += this.vel.z * dt / 2;
      this.collide(height);
    }
    // vertical
    const wasGround = this.onGround;
    const fallSpeed = this.vel.y;
    this.pos.y += this.vel.y * dt;
    const g = this.groundHeight();
    if (this.pos.y <= g) {
      this.pos.y = g;
      if (!wasGround && fallSpeed < -4) { this.landKick = Math.min(0.12, -fallSpeed * 0.012); audio.footstep(0.35); }
      this.vel.y = 0;
      this.onGround = true;
    } else {
      this.onGround = this.pos.y - g < 0.02;
    }
    if (this.pos.y > 3.4) { this.pos.y = 3.4; this.vel.y = Math.min(0, this.vel.y); }

    const targetEye = this.downed ? C.DOWNED_EYE : wantCrouch ? C.CROUCH_EYE : C.EYE_HEIGHT;
    this.eye += (targetEye - this.eye) * Math.min(1, dt * 10);

    // head bob + footsteps
    const hs = Math.hypot(this.vel.x, this.vel.z);
    const bobTarget = this.onGround && moving ? Math.min(1, hs / C.PLAYER_SPEED) : 0;
    this.bobAmt += (bobTarget - this.bobAmt) * Math.min(1, dt * 8);
    this.bobT += dt * hs * 1.25;
    if (this.onGround && hs > 1) {
      this.stepAcc += hs * dt;
      const stride = this.sprinting ? 2.4 : 1.9;
      if (this.stepAcc > stride) { this.stepAcc = 0; audio.footstep(this.sprinting ? 0.3 : 0.2); }
    }
    this.recoil *= Math.exp(-dt * 9);
    this.shake *= Math.exp(-dt * 6);
    this.landKick *= Math.exp(-dt * 10);
  }

  applyCamera(cam) {
    const bobY = Math.sin(this.bobT * 2) * 0.045 * this.bobAmt;
    const bobX = Math.cos(this.bobT) * 0.03 * this.bobAmt;
    const sx = (Math.random() - 0.5) * this.shake, sy = (Math.random() - 0.5) * this.shake;
    cam.position.set(
      this.pos.x + Math.cos(this.yaw) * bobX,
      this.pos.y + this.eye + bobY - this.landKick,
      this.pos.z - Math.sin(this.yaw) * bobX,
    );
    cam.rotation.order = 'YXZ';
    cam.rotation.y = this.yaw + sx;
    cam.rotation.x = this.pitch + this.recoil + sy;
    cam.rotation.z = this.downed ? 0.25 : 0;
  }
}
