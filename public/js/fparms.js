// First-person arms cut from the realistic soldier avatar (Rocketbox, MIT): camo sleeves and
// real hands. The head and legs are collapsed, the shoulders sit just below the camera, the arms
// reach the gun with two-bone IK, the hands are turned to the grip and the fingers curl around it.
import * as THREE from 'three';
import { RigCharacter, rigLoaded, solveArm } from './rig.js';

const V = () => new THREE.Vector3();
const basis = (z, y) => {
  const Z = new THREE.Vector3(...z).normalize();
  const Y = new THREE.Vector3(...y);
  Y.addScaledVector(Z, -Y.dot(Z)).normalize();
  const X = new THREE.Vector3().crossVectors(Y, Z);
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(X, Y, Z));
};

// Hand frames in gun space (gun points down -Z, up is +Y): Z = where the fingers point (wrist to
// knuckles), Y = the thumb side. pos = wrist position. curl = finger bend per joint (radians).
const POSES = {
  pistol: {
    // handshake grip: wrist behind the grip, knuckles in front of it, thumb up, palm against the grip
    right: { pos: [0.01, -0.055, 0.055], rot: basis([0, -0.3, -1], [0, 1, 0.1]), curl: [1.25, 1.45, 0.9], thumb: [0.3, 0.4] },
    left: { pos: [-0.03, -0.08, 0.05], rot: basis([0.3, -0.35, -1], [0.1, 1, 0]), curl: [1.1, 1.3, 0.8], thumb: [0.2, 0.3] },
  },
  rifle: {
    right: { pos: [0.012, -0.06, 0.065], rot: basis([0, -0.3, -1], [0, 1, 0.1]), curl: [1.25, 1.45, 0.9], thumb: [0.4, 0.5] },
    // support hand under the handguard, fingers wrapping up its right side
    left: { pos: [-0.04, -0.06, -0.2], rot: basis([0.85, 0.15, -0.5], [0.2, 0.3, -1]), curl: [1.0, 1.2, 0.7], thumb: [0.2, 0.3] },
  },
};
const FIST = [1.4, 1.6, 1.2];

export const fpArmsReady = () => rigLoaded();

export class SoldierArms {
  constructor() {
    this.rig = new RigCharacter('soldier', { height: 1.8 });
    this.root = new THREE.Group();
    this.root.add(this.rig.root);
    const B = this.rig.bones;
    // only the arms should ever be seen
    for (const n of ['Head', 'LeftUpLeg', 'RightUpLeg']) B[n].scale.setScalar(0.0001); // (the clavicles hang off the neck, so keep it)
    this.rig.root.rotation.y = Math.PI; // the avatar faces +Z, the view model camera looks down -Z
    this.rig.root.position.set(0, -1.68, 0.1);
    this.rig.model.traverse((o) => { if (o.isMesh) { o.frustumCulled = false; o.castShadow = false; } });
    // the usual first-person cheat: slightly longer arms so the support hand reaches a rifle's handguard
    for (const side of ['Left', 'Right']) {
      B[`${side}Arm`].scale.setScalar(1.22);
      B[`${side}Hand`].scale.setScalar(1 / 1.22);
    }
    // ...and shoulders brought forward, as in most shooters, so a rifle's handguard is in reach
    this.rig.root.updateMatrixWorld(true);
    for (const side of ['Left', 'Right']) {
      const up = B[`${side}Arm`];
      const p = up.getWorldPosition(V()).add(new THREE.Vector3(side === 'Left' ? 0.03 : 0, 0.02, -0.22));
      up.position.copy(up.parent.worldToLocal(p));
    }
    this.pose = POSES.rifle;
    this.targets = { R: { pos: V(), quat: new THREE.Quaternion() }, L: { pos: V(), quat: new THREE.Quaternion() } };
    this.curl = { R: POSES.rifle.right.curl, L: POSES.rifle.left.curl };
    // rest-pose hand frames (in each hand bone's local space)
    this.rig.root.updateMatrixWorld(true);
    this.handRest = {};
    for (const s of ['R', 'L']) {
      const side = s === 'R' ? 'Right' : 'Left', pre = s === 'R' ? 'Bip01_R_' : 'Bip01_L_';
      const hand = B[`${side}Hand`];
      const inv = new THREE.Matrix4().copy(hand.matrixWorld).invert();
      const h = hand.getWorldPosition(V());
      const f = B[`${pre}Finger2`].getWorldPosition(V()), t = B[`${pre}Finger0`].getWorldPosition(V());
      const zW = f.sub(h).normalize(), yW = t.sub(h).normalize();
      // into hand-local directions
      const toLocal = (w) => w.clone().transformDirection(inv);
      const z = toLocal(zW), y = toLocal(yW);
      y.addScaledVector(z, -y.dot(z)).normalize();
      const x = new THREE.Vector3().crossVectors(y, z);
      this.handRest[s] = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
      this.handRest[s + 'pre'] = pre;
    }
    this.root.updateMatrixWorld(true);
  }

  setWeapon(pistolLike, leftZ) {
    const base = pistolLike ? POSES.pistol : POSES.rifle;
    this.pose = {
      right: base.right,
      left: pistolLike ? base.left : { ...base.left, pos: [base.left.pos[0], base.left.pos[1], leftZ] },
    };
    this.curl = { R: base.right.curl, L: base.left.curl };
  }

  fist(side) { this.curl[side] = FIST; }

  aimAtGun(gunRoot) {
    gunRoot.updateWorldMatrix(true, false);
    const gq = gunRoot.getWorldQuaternion(new THREE.Quaternion());
    for (const [side, p] of [['R', this.pose.right], ['L', this.pose.left]]) {
      const t = this.targets[side];
      t.pos.set(...p.pos).applyMatrix4(gunRoot.matrixWorld);
      t.quat.copy(gq).multiply(p.rot);
    }
  }

  setHand(side, pos, quat) {
    this.targets[side].pos.copy(pos);
    if (quat) this.targets[side].quat.copy(quat);
  }

  solve() {
    const rig = this.rig, B = rig.bones;
    for (const [k, q] of rig.rest) B[k].quaternion.copy(q);
    this.root.updateMatrixWorld(true);
    for (const s of ['R', 'L']) {
      const side = s === 'R' ? 'Right' : 'Left';
      const t = this.targets[s];
      const upper = B[`${side}Arm`], fore = B[`${side}ForeArm`], hand = B[`${side}Hand`];
      // elbows drop down and out
      const pole = new THREE.Vector3(s === 'R' ? 0.8 : -0.8, -1, 0.3).normalize();
      solveArm(upper, fore, hand, t.pos, pole);
      // turn the hand: world = target frame, local = parent^-1 * world * rest^-1
      fore.updateMatrixWorld(true);
      const parentQ = fore.getWorldQuaternion(new THREE.Quaternion());
      const want = t.quat.clone().multiply(this.handRest[s].clone().invert());
      hand.quaternion.copy(parentQ.invert().multiply(want));
      hand.updateMatrixWorld(true);
      this.curlFingers(s, t.quat);
    }
  }

  /** Bend each finger joint towards the palm. */
  curlFingers(s, handQ) {
    const B = this.rig.bones, pre = this.handRest[s + 'pre'];
    const Z = new THREE.Vector3(0, 0, 1).applyQuaternion(handQ);
    const Y = new THREE.Vector3(0, 1, 0).applyQuaternion(handQ);
    const X = new THREE.Vector3().crossVectors(Y, Z);
    const palm = s === 'R' ? X.clone() : X.clone().negate();
    const curl = this.curl[s];
    const aimTo = (bone, child, dir) => {
      const b = B[bone], c = B[child];
      if (!b || !c) return;
      b.updateMatrixWorld(true);
      const from = c.getWorldPosition(V()).sub(b.getWorldPosition(V()));
      if (from.lengthSq() < 1e-12) return;
      const delta = new THREE.Quaternion().setFromUnitVectors(from.normalize(), dir.clone().normalize());
      const wq = b.getWorldQuaternion(new THREE.Quaternion());
      const pq = b.parent.getWorldQuaternion(new THREE.Quaternion());
      b.quaternion.copy(pq.invert().multiply(delta.multiply(wq)));
      b.updateMatrixWorld(true);
    };
    for (const f of [1, 2, 3, 4]) {
      let a = 0;
      const chain = [`${pre}Finger${f}`, `${pre}Finger${f}1`, `${pre}Finger${f}2`];
      for (let j = 0; j < 2; j++) {
        a += curl[j] * (f === 4 ? 1.1 : 1);
        aimTo(chain[j], chain[j + 1], Z.clone().multiplyScalar(Math.cos(a)).addScaledVector(palm, Math.sin(a)));
      }
    }
    // thumb: forward along the gun, slightly in
    const thumb = Z.clone().multiplyScalar(0.4).addScaledVector(Y, 0.7).addScaledVector(palm, 0.35);
    aimTo(`${pre}Finger0`, `${pre}Finger01`, thumb);
  }
}
