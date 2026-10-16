// Animated characters (CC0 "Animated Characters Survivors" by Kenney) used for both zombies
// and other players. Poses are layered on top of the idle/run animations with two-bone IK, and
// limbs can be shot off by collapsing their bones (the mesh vertices follow the bone scale).
import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { build } from './characters.js';

const SCALE = 0.0048; // FBX units -> metres (model is ~376 units tall)
let source = null;
const clips = {};
const skins = {};
const mats = {};

export const SKINS = {
  zombieA: { file: 'zombieA', shirt: '#7a5a42', skin: '#9aa8ac', pants: '#24303c', shoe: '#e8e8e8', hair: '#2a2420' },
  zombieC: { file: 'zombieC', shirt: '#1c2636', skin: '#a8b6ba', pants: '#b09070', shoe: '#e8e8e8', hair: '#3a2a20' },
  survivorMaleB: { file: 'survivorMaleB', shirt: '#cfe0f0', skin: '#e0a080', pants: '#26262a', shoe: '#222', hair: '#c88a50' },
  survivorFemaleA: { file: 'survivorFemaleA', shirt: '#d8e8f0', skin: '#a0502a', pants: '#c89060', shoe: '#eee', hair: '#2a1a10' },
};

export async function loadRig() {
  if (source) return;
  const L = new FBXLoader();
  const [model, run, idle] = await Promise.all(['characterMedium', 'run', 'idle'].map((n) => L.loadAsync(`/assets/chars/${n}.fbx`)));
  clips.run = run.animations.find((a) => /Run/.test(a.name)) || run.animations[0];
  clips.idle = idle.animations.find((a) => /Idle/.test(a.name)) || idle.animations[0];
  const tl = new THREE.TextureLoader();
  await Promise.all(Object.entries(SKINS).map(async ([key, def]) => {
    const t = await tl.loadAsync(`/assets/chars/${def.file}.png`);
    t.colorSpace = THREE.SRGBColorSpace;
    skins[key] = t;
    mats[key] = new THREE.MeshStandardMaterial({ map: t, roughness: 0.85 });
  }));
  source = model;
}
export function rigLoaded() { return !!source; }

const V = () => new THREE.Vector3();
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3();

function rotateBoneTo(bone, from, to) {
  const delta = new THREE.Quaternion().setFromUnitVectors(from, to);
  const wq = bone.getWorldQuaternion(new THREE.Quaternion());
  const pq = bone.parent.getWorldQuaternion(new THREE.Quaternion());
  bone.quaternion.copy(pq.invert().multiply(delta.multiply(wq)));
  bone.updateMatrixWorld(true);
}

/** Two-bone IK: bend upper/fore so the wrist reaches `target` (world), elbow towards `pole` (world dir). */
function solveArm(upper, fore, hand, target, pole) {
  upper.updateMatrixWorld(true);
  const S = upper.getWorldPosition(V()), E = fore.getWorldPosition(V()), W = hand.getWorldPosition(V());
  const a = S.distanceTo(E), b = E.distanceTo(W);
  const toT = target.clone().sub(S);
  const d = Math.min(Math.max(toT.length(), Math.abs(a - b) + 1e-3), a + b - 1e-3);
  const n = toT.normalize();
  const m = pole.clone().addScaledVector(n, -pole.dot(n)).normalize();
  const cosA = (a * a + d * d - b * b) / (2 * a * d);
  const E2 = S.clone().addScaledVector(n, a * cosA).addScaledVector(m, a * Math.sqrt(Math.max(0, 1 - cosA * cosA)));
  rotateBoneTo(upper, E.clone().sub(S).normalize(), E2.sub(S).normalize());
  const E3 = fore.getWorldPosition(V()), W3 = hand.getWorldPosition(V());
  rotateBoneTo(fore, W3.sub(E3).normalize(), target.clone().sub(E3).normalize());
}

// limb part ids shared with the server: 5 armL, 6 armR, 7 legL, 8 legR
export const LIMB_BITS = { 5: 1, 6: 2, 7: 4, 8: 8 };
const LIMB_BONES = { 5: ['LeftArm', 'LeftForeArm'], 6: ['RightArm', 'RightForeArm'], 7: ['LeftUpLeg', 'LeftLeg'], 8: ['RightUpLeg', 'RightLeg'] };

const stumpGeo = new THREE.SphereGeometry(1, 8, 6);
const stumpMat = new THREE.MeshStandardMaterial({ color: '#4a0606', roughness: 0.3, emissive: '#200000' });
const boneMat = new THREE.MeshStandardMaterial({ color: '#e0d6c0', roughness: 0.6 });

export class RigCharacter {
  constructor(skinKey, { height = 1.8 } = {}) {
    this.skin = SKINS[skinKey] ? skinKey : 'zombieA';
    this.root = new THREE.Group();          // positioned/rotated by the entity
    this.body = new THREE.Group();          // used for falls, crawling, rising
    this.root.add(this.body);
    this.model = SkeletonUtils.clone(source);
    this.model.scale.setScalar(SCALE * (height / 1.8));
    this.body.add(this.model);
    this.bones = {};
    this.model.traverse((o) => {
      if (o.isBone) this.bones[o.name] = o;
      if (o.isMesh) { o.material = mats[this.skin]; o.frustumCulled = false; o.castShadow = false; }
    });
    this.mixer = new THREE.AnimationMixer(this.model);
    this.actions = { run: this.mixer.clipAction(clips.run), idle: this.mixer.clipAction(clips.idle) };
    this.actions.idle.play();
    this.actions.run.play();
    this.actions.run.setEffectiveWeight(0);
    this.actions.run.time = Math.random() * clips.run.duration;
    this.actions.idle.time = Math.random() * clips.idle.duration;
    this.runW = 0;
    this.hidden = new Set();   // bones collapsed by dismemberment
    this.frozen = false;
    this.armPose = null;
  }

  /** speed in m/s drives the run blend and playback rate */
  animate(dt, speed, rate = 1) {
    if (this.frozen) return;
    const target = Math.min(1, speed / 1.2);
    this.runW += (target - this.runW) * Math.min(1, dt * 8);
    this.actions.run.setEffectiveWeight(this.runW);
    this.actions.idle.setEffectiveWeight(1 - this.runW);
    this.actions.run.timeScale = Math.max(0.35, Math.min(1.6, speed / 5)) * rate;
    this.mixer.update(dt);
    this.model.updateMatrixWorld(true);
  }

  /** Pose both hands towards targets given in character space (metres, +Z forward). */
  reach(left, right, poleOut = 0.6) {
    const B = this.bones;
    this.root.updateMatrixWorld(true);
    const toWorld = (p) => this.body.localToWorld(new THREE.Vector3(...p));
    const down = this.body.localToWorld(new THREE.Vector3(0, 0, 0)).clone();
    if (left && !this.hidden.has('LeftArm')) {
      const pole = this.body.localToWorld(new THREE.Vector3(poleOut, -1, 0)).sub(down).normalize();
      solveArm(B.LeftArm, B.LeftForeArm, B.LeftHand, toWorld(left), pole);
    }
    if (right && !this.hidden.has('RightArm')) {
      const pole = this.body.localToWorld(new THREE.Vector3(-poleOut, -1, 0)).sub(down).normalize();
      solveArm(B.RightArm, B.RightForeArm, B.RightHand, toWorld(right), pole);
    }
  }

  /** Like reach() but with world-space hand targets. */
  reachWorld(left, right) {
    const B = this.bones;
    this.root.updateMatrixWorld(true);
    const o = this.body.localToWorld(new THREE.Vector3());
    if (left && !this.hidden.has('LeftArm')) solveArm(B.LeftArm, B.LeftForeArm, B.LeftHand, left, this.body.localToWorld(new THREE.Vector3(0.6, -1, 0)).sub(o).normalize());
    if (right && !this.hidden.has('RightArm')) solveArm(B.RightArm, B.RightForeArm, B.RightHand, right, this.body.localToWorld(new THREE.Vector3(-0.6, -1, 0)).sub(o).normalize());
  }

  /** Re-apply collapsed bones after the animation wrote over them. */
  applyHidden() {
    for (const name of this.hidden) this.bones[name].scale.setScalar(0.0001);
    if (this.hidden.size) this.model.updateMatrixWorld(true);
  }

  /** Collapse a limb (returns the world position of the cut and the bone name). */
  cut(boneName) {
    const bone = this.bones[boneName];
    if (!bone || this.hidden.has(boneName)) return null;
    this.model.updateMatrixWorld(true);
    const at = bone.getWorldPosition(V());
    this.hidden.add(boneName);
    // bloody stump on the parent bone at the joint
    const parent = bone.parent;
    const ws = parent.getWorldScale(V()).x || 1;
    const stump = new THREE.Mesh(stumpGeo, stumpMat);
    stump.position.copy(bone.position);
    stump.scale.setScalar(0.06 / ws);
    parent.add(stump);
    const nub = new THREE.Mesh(stumpGeo, boneMat);
    nub.position.copy(bone.position).multiplyScalar(1.08);
    nub.scale.setScalar(0.025 / ws);
    parent.add(nub);
    this.applyHidden();
    return { at, bone: boneName, parent };
  }

  boneWorld(name, out = V()) { return this.bones[name].getWorldPosition(out); }

  dispose() { this.mixer.stopAllAction(); }
}

// ------------------------------------------------------------------ hit testing
function rayCapsule(o, d, a, b, r) {
  // closest approach between ray and segment, then sphere test at that point
  const u = d, v = _a.copy(b).sub(a), w = _b.copy(o).sub(a);
  const uu = 1, uv = u.dot(v), vv = v.dot(v), uw = u.dot(w), vw = v.dot(w);
  const den = uu * vv - uv * uv;
  let s = den > 1e-8 ? (uv * vw - vv * uw) / den : 0;
  let t = den > 1e-8 ? (uu * vw - uv * uw) / den : 0;
  t = Math.max(0, Math.min(1, t));
  s = Math.max(0, u.dot(_c.copy(a).addScaledVector(v, t).sub(o)));
  const p = _c.copy(o).addScaledVector(u, s);
  const q = V().copy(a).addScaledVector(v, t);
  return p.distanceTo(q) <= r ? Math.max(0, s - r * 0.5) : -1;
}

function raySphere(o, d, c, r) {
  const ox = o.x - c.x, oy = o.y - c.y, oz = o.z - c.z;
  const b = ox * d.x + oy * d.y + oz * d.z;
  const cc = ox * ox + oy * oy + oz * oz - r * r;
  const disc = b * b - cc;
  if (disc < 0) return -1;
  const t = -b - Math.sqrt(disc);
  return t >= 0 ? t : (cc < 0 ? 0 : -1);
}

const SEGMENTS = [
  [5, 'LeftArm', 'LeftForeArm', 0.08], [5, 'LeftForeArm', 'LeftHand', 0.07],
  [6, 'RightArm', 'RightForeArm', 0.08], [6, 'RightForeArm', 'RightHand', 0.07],
  [7, 'LeftUpLeg', 'LeftLeg', 0.1], [7, 'LeftLeg', 'LeftFoot', 0.08],
  [8, 'RightUpLeg', 'RightLeg', 0.1], [8, 'RightLeg', 'RightFoot', 0.08],
];

/** Returns { t, part } for the nearest hit on this character, or null. part: 0 body, 1 head, 5-8 limbs */
export function raycastRig(rig, origin, dir, maxDist) {
  const B = rig.bones;
  let best = Infinity, part = -1;
  if (!rig.hidden.has('Head')) {
    const h0 = B.Head.getWorldPosition(V()), h1 = B.Head_end ? B.Head_end.getWorldPosition(V()) : h0.clone().add(new THREE.Vector3(0, 0.3, 0));
    const c = h0.clone().lerp(h1, 0.45);
    const t = raySphere(origin, dir, c, Math.max(0.16, h0.distanceTo(h1) * 0.5));
    if (t >= 0 && t < best) { best = t; part = 1; }
  }
  const t = rayCapsule(origin, dir, B.Hips.getWorldPosition(V()), B.Neck.getWorldPosition(V()), 0.2);
  if (t >= 0 && t < best - 0.05) { best = t; part = 0; }
  for (const [p, a, b, r] of SEGMENTS) {
    if (rig.hidden.has(a) || rig.hidden.has(LIMB_BONES[p][0])) continue;
    const ts = rayCapsule(origin, dir, B[a].getWorldPosition(V()), B[b].getWorldPosition(V()), r);
    if (ts >= 0 && ts < best - 0.02) { best = ts; part = p; }
  }
  return part >= 0 && best <= maxDist ? { t: best, part } : null;
}

// ------------------------------------------------------------------ flying gore chunks
export function limbChunk(skinKey, kind) {
  const s = SKINS[skinKey] || SKINS.zombieA;
  const blood = '#5a0606', bone = '#e0d6c0';
  let items;
  if (kind === 'head') {
    items = [
      { k: 'r', s: [0.3, 0.3, 0.3], c: s.skin, p: [0, 0.06, 0], r: 0.1 },
      { k: 'r', s: [0.31, 0.1, 0.31], c: s.hair, p: [0, 0.2, -0.01], r: 0.05 },
      { s: [0.12, 0.08, 0.12], c: blood, p: [0, -0.1, 0] },
      { s: [0.04, 0.06, 0.04], c: bone, p: [0, -0.14, 0] },
    ];
  } else if (kind === 'forearm') {
    items = [
      { k: 'r', s: [0.1, 0.32, 0.1], c: s.skin, p: [0, -0.16, 0], r: 0.04 },
      { k: 'r', s: [0.1, 0.1, 0.06], c: s.skin, p: [0, -0.36, 0], r: 0.03 },
      { s: [0.08, 0.04, 0.08], c: blood, p: [0, 0.01, 0] },
    ];
  } else if (kind === 'arm') {
    items = [
      { k: 'r', s: [0.13, 0.3, 0.13], c: s.shirt, p: [0, -0.15, 0], r: 0.05 },
      { k: 'r', s: [0.1, 0.3, 0.1], c: s.skin, p: [0, -0.45, 0], r: 0.04 },
      { k: 'r', s: [0.1, 0.1, 0.06], c: s.skin, p: [0, -0.64, 0], r: 0.03 },
      { s: [0.1, 0.04, 0.1], c: blood, p: [0, 0.01, 0] },
    ];
  } else if (kind === 'shin') {
    items = [
      { k: 'r', s: [0.13, 0.4, 0.14], c: s.pants, p: [0, -0.2, 0], r: 0.05 },
      { k: 'r', s: [0.14, 0.09, 0.26], c: s.shoe, p: [0, -0.42, 0.05], r: 0.03 },
      { s: [0.1, 0.04, 0.1], c: blood, p: [0, 0.01, 0] },
    ];
  } else {
    items = [
      { k: 'r', s: [0.17, 0.42, 0.18], c: s.pants, p: [0, -0.21, 0], r: 0.06 },
      { k: 'r', s: [0.13, 0.4, 0.14], c: s.pants, p: [0, -0.62, 0], r: 0.05 },
      { k: 'r', s: [0.14, 0.09, 0.26], c: s.shoe, p: [0, -0.84, 0.05], r: 0.03 },
      { s: [0.12, 0.05, 0.12], c: blood, p: [0, 0.01, 0] },
      { s: [0.05, 0.06, 0.05], c: bone, p: [0, 0.04, 0] },
    ];
  }
  const geo = build(items);
  const mesh = new THREE.Mesh(geo, chunkMat);
  mesh.userData.ownGeometry = true;
  return mesh;
}
const chunkMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7 });

export const LIMB_BONE_NAMES = LIMB_BONES;
