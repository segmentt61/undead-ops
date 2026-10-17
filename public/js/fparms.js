// First-person arms cut from the realistic soldier avatar (Rocketbox, MIT): camo sleeves and
// real hands. The head and legs are collapsed, the shoulders sit just below the camera, the arms
// reach the gun with two-bone IK, the hands are turned to the grip and the fingers curl around it.
import * as THREE from 'three';
import { RigCharacter, rigLoaded, solveArm } from './rig.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

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

// ------------------------------------------------------------------ first-person hands
// "First Person hands rigged" by David Fischer (CC-BY 4.0, Sketchfab): a rig built for first-person
// view, with proper fingers. The plain skin is shaded into black tactical gloves, bare wrists and
// rolled-up camo sleeves, using each vertex's bone weights to tell hand, forearm and upper arm apart.

let handsSrc = null;
export async function loadFpHands() {
  const gl = new GLTFLoader();
  gl.setMeshoptDecoder(MeshoptDecoder);
  const g = await gl.loadAsync('/assets/arms/fp_hands.glb');
  handsSrc = g.scene;
}
export const fpHandsReady = () => !!handsSrc;

const HANDS_SCALE = 0.0185; // model is in cm with first-person proportions; this gives ~19 cm hands
const SHOULDERS = new THREE.Vector3(0, -0.2, -0.13); // shoulder midpoint in view space

let handsMat = null;
function makeHandsMaterial() {
  if (handsMat) return handsMat;
  const m = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.7, metalness: 0 });
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = 'attribute vec2 zone;\nvarying vec2 vZone;\nvarying vec3 vObj;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      vZone = zone; vObj = position;`);
    sh.fragmentShader = `varying vec2 vZone;\nvarying vec3 vObj;
      float hh(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
      float vn(vec3 p) { vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(mix(hh(i), hh(i + vec3(1,0,0)), f.x), mix(hh(i + vec3(0,1,0)), hh(i + vec3(1,1,0)), f.x), f.y),
                   mix(mix(hh(i + vec3(0,0,1)), hh(i + vec3(1,0,1)), f.x), mix(hh(i + vec3(0,1,1)), hh(i + vec3(1,1,1)), f.x), f.y), f.z); }
    ` + sh.fragmentShader
      .replace('#include <color_fragment>', `#include <color_fragment>
        float glove = smoothstep(0.42, 0.6, vZone.x);
        float sleeve = smoothstep(0.5, 0.6, vZone.y) * (1.0 - glove);
        // skin: warm, slightly uneven
        vec3 skin = vec3(0.56, 0.38, 0.28) * (0.9 + 0.2 * vn(vObj * 36.0));
        // woodland camo from layered noise, plus fine weave
        float c1 = vn(vObj * 9.0), c2 = vn(vObj * 14.0 + 7.0);
        vec3 camo = mix(vec3(0.13, 0.145, 0.095), vec3(0.22, 0.2, 0.14), step(0.5, c1));
        camo = mix(camo, vec3(0.07, 0.07, 0.055), step(0.62, c2));
        camo *= 0.88 + 0.24 * vn(vObj * 240.0);
        // gloves: dark synthetic with knuckle wear
        vec3 gl = vec3(0.045, 0.047, 0.05) * (0.85 + 0.3 * vn(vObj * 160.0));
        diffuseColor.rgb = mix(mix(skin, camo, sleeve), gl, glove);`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = mix(mix(0.52, 0.95, sleeve), 0.62, glove);`);
  };
  m.customProgramCacheKey = () => 'fphands';
  handsMat = m;
  return m;
}

// per-vertex (glove, sleeve) weights from the skin
function addZones(mesh) {
  const geo = mesh.geometry;
  if (geo.attributes.zone) return;
  const bones = mesh.skeleton.bones;
  const kind = bones.map((b) => {
    let o = b;
    while (o) {
      if (/^hand[RL]_/.test(o.name)) return 'hand';
      o = o.parent;
    }
    if (/^forearm[RL]_\d/.test(b.name) || /^forearm[RL]_end/.test(b.name)) return 'fore';
    if (/^(upper_arm|deltoid|clavicle)/.test(b.name) || /^_rootJoint/.test(b.name)) return 'up';
    return 'wrist';
  });
  const si = geo.attributes.skinIndex, sw = geo.attributes.skinWeight;
  const z = new Float32Array(si.count * 2);
  for (let i = 0; i < si.count; i++) {
    let g = 0, s = 0;
    for (let k = 0; k < 4; k++) {
      const w = sw.getComponent(i, k), t = kind[si.getComponent(i, k)];
      if (t === 'hand') g += w; else if (t === 'up') s += w; else if (t === 'fore') s += w * 0.95;
    }
    z[i * 2] = g; z[i * 2 + 1] = s;
  }
  geo.setAttribute('zone', new THREE.BufferAttribute(z, 2));
}

export class FpHands {
  constructor() {
    this.model = SkeletonUtils.clone(handsSrc);
    this.root = new THREE.Group();
    this.root.add(this.model);
    const S = HANDS_SCALE;
    this.model.scale.setScalar(S);
    this.model.rotation.y = Math.PI; // fingers point down -Z, like the view camera
    this.B = {};
    this.model.traverse((o) => {
      if (o.isBone) this.B[o.name.replace(/_\d+$/, '')] = o;
      if (o.isSkinnedMesh) {
        o.frustumCulled = false;
        o.castShadow = false;
        if (o.material.name === 'basicRigSkin') o.visible = false; // fingernails, under the gloves
        else { addZones(o); o.material = makeHandsMaterial(); }
      }
    });
    // the rig's hands are a little large next to its arms
    for (const s of ['R', 'L']) this.B[`forearm${s}001`].scale.setScalar(0.85);
    // put the shoulders where they belong in view space
    this.model.updateMatrixWorld(true);
    const mid = this.B.upper_armR.getWorldPosition(V()).add(this.B.upper_armL.getWorldPosition(V())).multiplyScalar(0.5);
    this.model.position.add(SHOULDERS.clone().sub(mid));
    this.model.updateMatrixWorld(true);
    this.rest = [];
    this.model.traverse((o) => { if (o.isBone) this.rest.push([o, o.quaternion.clone(), o.position.clone()]); });

    this.pose = POSES.rifle;
    this.targets = { R: { pos: V(), quat: new THREE.Quaternion() }, L: { pos: V(), quat: new THREE.Quaternion() } };
    this.curl = { R: POSES.rifle.right.curl, L: POSES.rifle.left.curl };
    // rest-pose hand frames, in the wrist bone's local space (Z to the middle knuckle, Y to the thumb)
    this.handRest = {};
    for (const s of ['R', 'L']) {
      const wrist = this.B[`forearm${s}001`];
      const inv = new THREE.Matrix4().copy(wrist.matrixWorld).invert();
      const h = wrist.getWorldPosition(V());
      const zW = this.B[`f_middle01${s}`].getWorldPosition(V()).sub(h).normalize();
      const yW = this.B[`thumb01${s}`].getWorldPosition(V()).sub(h).normalize();
      const z = zW.transformDirection(inv), y = yW.transformDirection(inv);
      y.addScaledVector(z, -y.dot(z)).normalize();
      const x = new THREE.Vector3().crossVectors(y, z);
      this.handRest[s] = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
    }
  }

  setWeapon(pistolLike, leftZ) {
    SoldierArms.prototype.setWeapon.call(this, pistolLike, leftZ);
    // support hand: palm under the handguard, fingers wrapping up its right side
    if (!pistolLike) {
      this.pose.left = { ...this.pose.left, pos: [-0.065, -0.078, leftZ] };
      this.curl.L = [1.35, 1.4, 0.9];
    }
  }
  fist(side) { this.curl[side] = FIST; }
  aimAtGun(gunRoot) { SoldierArms.prototype.aimAtGun.call(this, gunRoot); }
  setHand(side, pos, quat) { SoldierArms.prototype.setHand.call(this, side, pos, quat); }

  solve() {
    const B = this.B;
    for (const [b, q, p] of this.rest) { b.quaternion.copy(q); b.position.copy(p); }
    this.root.updateMatrixWorld(true);
    for (const s of ['R', 'L']) {
      const t = this.targets[s];
      const pole = new THREE.Vector3(s === 'R' ? 0.8 : -0.8, -1, 0.25).normalize();
      solveArm(B[`upper_arm${s}`], B[`forearm${s}`], B[`forearm${s}_end`], t.pos, pole);
      // the wrist is its own control bone: place and turn it directly
      const wrist = B[`forearm${s}001`];
      wrist.parent.updateMatrixWorld(true);
      wrist.position.copy(wrist.parent.worldToLocal(t.pos.clone()));
      const parentQ = wrist.parent.getWorldQuaternion(new THREE.Quaternion());
      const want = t.quat.clone().multiply(this.handRest[s].clone().invert());
      wrist.quaternion.copy(parentQ.invert().multiply(want));
      wrist.updateMatrixWorld(true);
      this.curlFingers(s, t.quat);
    }
  }

  curlFingers(s, handQ) {
    const B = this.B;
    const Z = new THREE.Vector3(0, 0, 1).applyQuaternion(handQ);
    const Y = new THREE.Vector3(0, 1, 0).applyQuaternion(handQ);
    const X = new THREE.Vector3().crossVectors(Y, Z);
    const palm = s === 'R' ? X.clone() : X.clone().negate();
    const curl = this.curl[s];
    const aimTo = (b, c, dir) => {
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
    ['index', 'middle', 'ring', 'pinky'].forEach((f, n) => {
      const chain = [B[`f_${f}01${s}`], B[`f_${f}02${s}`], B[`f_${f}03${s}`], B[`f_${f}03${s}_end`]];
      let a = 0;
      for (let j = 0; j < 3; j++) {
        a += curl[j] * (n === 3 ? 1.1 : 1) * (n === 0 && this.trigger && s === 'R' ? 0.75 : 1);
        aimTo(chain[j], chain[j + 1], Z.clone().multiplyScalar(Math.cos(a)).addScaledVector(palm, Math.sin(a)));
      }
    });
    // thumb: forward along the gun, wrapping slightly in
    const th = Z.clone().multiplyScalar(0.75).addScaledVector(Y, 0.4).addScaledVector(palm, 0.35);
    aimTo(B[`thumb01${s}`], B[`thumb02${s}`], th);
    aimTo(B[`thumb02${s}`], B[`thumb03${s}`], th.clone().addScaledVector(palm, 0.3));
    aimTo(B[`thumb03${s}`], B[`thumb03${s}_end`], th.clone().addScaledVector(palm, 0.5));
  }
}
