// Realistic first-person arms (CC0 rigged arms by "para", OpenGameArt).
// Hands are placed on each gun's grip / handguard every frame and the elbows are solved with
// analytic two-bone IK, so the arms follow recoil, sway and reload animations.
import * as THREE from 'three';
import { wearDetail } from './pbr.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

let source = null;
let skinTex = null;

export async function loadArms() {
  if (source) return;
  const [fbx, tex] = await Promise.all([
    new FBXLoader().loadAsync('/assets/arms/arms.fbx'),
    new THREE.TextureLoader().loadAsync('/assets/arms/skin.jpg'),
  ]);
  tex.colorSpace = THREE.SRGBColorSpace;
  skinTex = tex;
  source = fbx;
}

const V = () => new THREE.Vector3();
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _m = new THREE.Matrix4();

// Finger poses: [joint1, joint2, joint3] curl in radians
const GRIP = { index: [0.55, 0.9, 0.5], middle: [1.25, 1.35, 0.9], ring: [1.3, 1.35, 0.9], pinky: [1.35, 1.3, 0.9], thumb: [0.2, 0.5, 0.3] };
const HOLD = { index: [1.0, 1.1, 0.7], middle: [1.1, 1.2, 0.8], ring: [1.15, 1.2, 0.8], pinky: [1.2, 1.2, 0.8], thumb: [0.4, 0.4, 0.3] };
const FIST = { index: [1.5, 1.5, 1.0], middle: [1.5, 1.5, 1.0], ring: [1.5, 1.5, 1.0], pinky: [1.5, 1.5, 1.0], thumb: [0.6, 0.6, 0.4] };

function basis(fingers, palm) {
  const y = new THREE.Vector3(...fingers).normalize();
  const z = new THREE.Vector3(...palm);
  z.addScaledVector(y, -z.dot(y)).normalize();
  const x = new THREE.Vector3().crossVectors(y, z);
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
}

// Hand placement in gun space (gun points down -Z, origin at the grip, top of gun ~ +0.06)
export const HAND_POSES = {
  pistol: {
    right: { pos: [0.012, -0.07, 0.085], rot: basis([0, 0.35, -1], [-1, 0, 0]), fingers: GRIP },
    left: { pos: [-0.035, -0.1, 0.09], rot: basis([0.35, 0.55, -1], [0.8, 0.2, 0]), fingers: HOLD },
  },
  rifle: {
    right: { pos: [0.012, -0.075, 0.09], rot: basis([0, 0.3, -1], [-1, 0, 0]), fingers: GRIP },
    left: { pos: [-0.045, -0.06, 0], rot: basis([1, 0.15, -0.35], [0, 1, 0]), fingers: HOLD },
  },
};

function curlFingers(bones, side, pose) {
  for (const f of ['index', 'middle', 'ring', 'pinky']) {
    const c = pose[f];
    for (let j = 0; j < 3; j++) {
      const b = bones[`f_${f}0${j + 1}${side}`];
      if (b) b.rotation.x = b.userData.rest.x + c[j];
    }
  }
  for (let j = 0; j < 3; j++) {
    const b = bones[`thumb0${j + 1}${side}`];
    if (b) b.rotation.x = b.userData.rest.x + pose.thumb[j];
  }
}

export class FpArms {
  constructor() {
    this.root = SkeletonUtils.clone(source);
    this.bones = {};
    this.root.traverse((o) => {
      if (o.isBone) { this.bones[o.name] = o; o.userData.rest = o.rotation.clone(); o.userData.restQ = o.quaternion.clone(); }
      if (o.isMesh) {
        // tactical gloves: the skin texture's shading under a dark fabric tint, with fabric wear
        o.material = new THREE.MeshStandardMaterial({ map: skinTex, color: '#4a4a44', roughness: 0.88, metalness: 0, normalMap: wearDetail().normalMap, normalScale: new THREE.Vector2(0.6, 0.6) });
        o.frustumCulled = false;
      }
    });
    // shoulders sit below the camera and a little forward; hands scaled back to life size
    this.root.scale.setScalar(1.15);
    this.root.position.set(0, -0.33, -0.22);
    this.bones.handR.scale.setScalar(0.85);
    this.bones.handL.scale.setScalar(0.85);
    this.addSleeves();
    this.pose = HAND_POSES.rifle;
    this.leftOn = true;
    this.targets = { R: { pos: V(), quat: new THREE.Quaternion() }, L: { pos: V(), quat: new THREE.Quaternion() } };
  }

  addSleeves() {
    const cloth = new THREE.MeshStandardMaterial({ color: '#4a5038', roughness: 0.95, normalMap: wearDetail().normalMap, normalScale: new THREE.Vector2(1, 1) });
    const cuffMat = new THREE.MeshStandardMaterial({ color: '#30372a', roughness: 0.95 });
    for (const side of ['R', 'L']) {
      const upper = this.bones[`upper_arm${side}`], fore = this.bones[`forearm${side}`];
      // bone space: +Y runs down the bone, 1 unit ~ 0.115 m
      const up = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.52, 2.7, 14, 1, true), cloth);
      up.position.y = 1.3;
      upper.add(up);
      const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.44, 1.05, 14, 1, true), cloth);
      sleeve.position.y = 0.5;
      fore.add(sleeve);
      const cuff = new THREE.Mesh(new THREE.TorusGeometry(0.44, 0.09, 6, 16), cuffMat);
      cuff.rotation.x = Math.PI / 2;
      cuff.position.y = 1.02;
      fore.add(cuff);
      for (const m of [up, sleeve, cuff]) { m.frustumCulled = false; m.material.side = THREE.DoubleSide; }
    }
  }

  setWeapon(pistolLike, leftZ) {
    const base = pistolLike ? HAND_POSES.pistol : HAND_POSES.rifle;
    this.pose = {
      right: base.right,
      left: pistolLike ? base.left : { ...base.left, pos: [base.left.pos[0], base.left.pos[1], leftZ] },
    };
    curlFingers(this.bones, 'R', this.pose.right.fingers);
    curlFingers(this.bones, 'L', this.pose.left.fingers);
  }

  fist(side) { curlFingers(this.bones, side, FIST); }

  /** Compute hand targets from the gun's world matrix (viewmodel space). */
  aimAtGun(gunRoot) {
    gunRoot.updateWorldMatrix(true, false);
    const gq = gunRoot.getWorldQuaternion(_q);
    for (const [side, p] of [['R', this.pose.right], ['L', this.pose.left]]) {
      const t = this.targets[side];
      t.pos.set(...p.pos).applyMatrix4(gunRoot.matrixWorld);
      t.quat.copy(gq).multiply(p.rot);
    }
  }

  /** Override one hand target (camera space), e.g. for knife or grenade. */
  setHand(side, pos, quat) {
    this.targets[side].pos.copy(pos);
    if (quat) this.targets[side].quat.copy(quat);
  }

  solve() {
    this.root.updateMatrixWorld(true);
    for (const side of ['R', 'L']) {
      const t = this.targets[side];
      const upper = this.bones[`upper_arm${side}`], fore = this.bones[`forearm${side}`], end = this.bones[`forearm${side}_end`];
      const ctrl = this.bones[`hand${side}control`], hand = this.bones[`hand${side}`];
      upper.quaternion.copy(upper.userData.restQ);
      fore.quaternion.copy(fore.userData.restQ);
      upper.updateMatrixWorld(true);
      const S = upper.getWorldPosition(V()), E = fore.getWorldPosition(V()), W = end.getWorldPosition(V());
      const a = S.distanceTo(E), b = E.distanceTo(W);
      const toT = t.pos.clone().sub(S);
      const d = Math.min(Math.max(toT.length(), Math.abs(a - b) + 1e-3), a + b - 1e-3);
      const n = toT.normalize();
      // elbow points down and outwards
      const pole = new THREE.Vector3(side === 'R' ? 0.6 : -0.6, -1, 0.2);
      const m = pole.addScaledVector(n, -pole.dot(n)).normalize();
      const cosA = (a * a + d * d - b * b) / (2 * a * d);
      const sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
      const E2 = S.clone().addScaledVector(n, a * cosA).addScaledVector(m, a * sinA);
      this.rotateBoneTo(upper, E.clone().sub(S).normalize(), E2.clone().sub(S).normalize());
      fore.updateMatrixWorld(true);
      const E3 = fore.getWorldPosition(V()), W3 = end.getWorldPosition(V());
      this.rotateBoneTo(fore, W3.clone().sub(E3).normalize(), t.pos.clone().sub(E3).normalize());
      // hand: the control bone sits at the wrist, the hand bone carries the orientation
      const parent = ctrl.parent;
      parent.updateMatrixWorld(true);
      ctrl.position.copy(parent.worldToLocal(t.pos.clone()));
      ctrl.updateMatrixWorld(true);
      const cq = ctrl.getWorldQuaternion(_q2);
      hand.quaternion.copy(cq.invert().multiply(t.quat));
    }
    this.root.updateMatrixWorld(true);
  }

  rotateBoneTo(bone, from, to) {
    const delta = new THREE.Quaternion().setFromUnitVectors(from, to);
    const wq = bone.getWorldQuaternion(new THREE.Quaternion());
    const pq = bone.parent.getWorldQuaternion(new THREE.Quaternion());
    bone.quaternion.copy(pq.invert().multiply(delta.multiply(wq)));
    bone.updateMatrixWorld(true);
  }
}

export function armsLoaded() { return !!source; }
