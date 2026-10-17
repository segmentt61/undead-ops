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
    this.tacSprint = false;  // tactical sprint (double-tap sprint)
    this.tacWant = false;
    this.stamina = 1;
    this.staminaWait = 0;
    this.sprintHeld = false;
    this.tapClock = 9;
    this.roll = 0;           // camera tilt when strafing / sprinting
    this.idleT = 0;          // idle camera sway (Lissajous curve)
    this.adsK = 0;
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
      for (const c of this.world.colliders || []) {
        const dx = this.pos.x - c.x, dz = this.pos.z - c.z, d = Math.hypot(dx, dz), min = c.r + r;
        if (d < min && d > 1e-5 && this.pos.y < 1.6) {
          this.pos.x = c.x + (dx / d) * min; this.pos.z = c.z + (dz / d) * min;
          const nx = dx / d, nz = dz / d, vn = this.vel.x * nx + this.vel.z * nz;
          if (vn < 0) { this.vel.x -= vn * nx; this.vel.z -= vn * nz; }
        }
      }
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
    this.adsK = ads;
    this.sprinting = !this.downed && input.sprint && input.f > 0 && !wantCrouch && ads < 0.3;
    // tactical sprint: tap sprint twice quickly (or press the pad's sprint again while sprinting)
    // (timed from letting go of sprint, so a quick re-press while running counts)
    this.tapClock += dt;
    if (input.sprint && !this.sprintHeld && this.tapClock < 0.35 && this.stamina > 0.25 && input.f > 0) this.tacWant = true;
    if (!input.sprint && this.sprintHeld) this.tapClock = 0;
    this.sprintHeld = !!input.sprint;
    if (input.tac && !this.tacHeld && this.stamina > 0.25) this.tacWant = true;
    this.tacHeld = !!input.tac;
    if (!this.sprinting && !(this.tapClock < 0.35 && input.f > 0)) this.tacWant = false;
    this.tacSprint = this.sprinting && this.tacWant && this.onGround;
    if (this.tacSprint) {
      this.stamina -= dt / C.TAC_SPRINT_TIME;
      this.staminaWait = 1.2;
      if (this.stamina <= 0) { this.stamina = 0; this.tacWant = false; }
    } else {
      this.staminaWait -= dt;
      if (this.staminaWait <= 0) this.stamina = Math.min(1, this.stamina + dt / 4);
    }
    let speed = this.downed ? C.DOWNED_SPEED : wantCrouch ? C.CROUCH_SPEED : this.tacSprint ? C.TAC_SPRINT_SPEED : this.sprinting ? C.SPRINT_SPEED : C.PLAYER_SPEED;
    speed *= moveMult * (1 - ads * 0.4);

    // wish direction in world space
    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    let wx = -sin * input.f + cos * input.r;
    let wz = -cos * input.f - sin * input.r;
    const wl = Math.hypot(wx, wz);
    if (wl > 0) { wx /= wl; wz /= wl; }

    // Quake / Call of Duty movement: ground friction, then accelerate along the wish direction
    // only up to the wish speed (so momentum carries through jumps and you can air-strafe a bit)
    if (this.onGround) {
      const hs0 = Math.hypot(this.vel.x, this.vel.z);
      if (hs0 > 0) {
        const drop = Math.max(hs0, C.STOP_SPEED) * C.MOVE_FRICTION * dt;
        const k = Math.max(0, hs0 - drop) / hs0;
        this.vel.x *= k; this.vel.z *= k;
      }
    }
    if (wl > 0) {
      const accel = !this.onGround ? C.AIR_ACCEL : C.MOVE_ACCEL * (this.tacSprint ? 0.6 : this.sprinting ? 0.75 : 1);
      const add = speed - (this.vel.x * wx + this.vel.z * wz);
      if (add > 0) {
        const a = Math.min(add, accel * dt * speed);
        this.vel.x += a * wx; this.vel.z += a * wz;
      }
    }

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
      // landing from a hop above sprint speed bleeds some of it (bunny hopping stays modest)
      if (!wasGround && Math.hypot(this.vel.x, this.vel.z) > C.SPRINT_SPEED) { this.vel.x *= 0.85; this.vel.z *= 0.85; }
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
    // camera tilt: lean into strafes, more while sprinting; a little rock during tactical sprint
    const tilt = this.downed ? 0 : -input.r * (this.tacSprint ? 0.045 : this.sprinting ? 0.03 : 0.014) * (1 - ads * 0.7)
      + (this.tacSprint ? Math.sin(this.bobT) * 0.012 : 0);
    this.roll += (tilt - this.roll) * Math.min(1, dt * 6);
    this.idleT += dt * (0.6 + hs * 0.12);
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
    // idle sway along a Lissajous curve, almost gone while aiming down sights
    const sw = 0.0022 * (1 - this.adsK * 0.85);
    cam.rotation.y = this.yaw + sx + Math.sin(this.idleT) * sw;
    cam.rotation.x = this.pitch + this.recoil + sy + Math.sin(this.idleT * 2) * sw * 0.5;
    cam.rotation.z = (this.downed ? 0.25 : 0) + this.roll;
  }
}
