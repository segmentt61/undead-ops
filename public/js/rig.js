// Realistic characters: Microsoft Rocketbox avatars (MIT licence) for zombies and players.
// The avatars come without game animations, so walking, running and idling are generated here
// procedurally on the Biped skeleton; arms are posed with two-bone IK (zombie reach, holding a gun).
// Limbs can be shot off by collapsing their bones (the mesh vertices follow the bone scale).
import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { build } from './characters.js';

// avatar -> how it is used; colours are for the flying gore chunks
export const SKINS = {
  medic: { file: 'Medical_Male_02', zombie: true, shirt: '#5a7a9a', skin: '#a8a89a', pants: '#5a7a9a', shoe: '#2a2a2a', hair: '#2a2420' },
  cop: { file: 'Police_Male_02', zombie: true, shirt: '#1e2838', skin: '#a8a090', pants: '#1e2838', shoe: '#111', hair: '#2a2018' },
  builder: { file: 'Construction_Male_01', zombie: true, shirt: '#c87a2a', skin: '#a8a090', pants: '#3a4a6a', shoe: '#3a2a1a', hair: '#3a2a20' },
  suit: { file: 'Business_Male_02', zombie: true, shirt: '#2a2a30', skin: '#a8a498', pants: '#2a2a30', shoe: '#111', hair: '#1a1410' },
  civil: { file: 'Male_Adult_05', zombie: true, shirt: '#6a5a4a', skin: '#a8a090', pants: '#3a3a44', shoe: '#2a2018', hair: '#2a2018' },
  woman: { file: 'Female_Adult_03', zombie: true, shirt: '#7a3a3a', skin: '#b0a898', pants: '#2a2a3a', shoe: '#2a1a1a', hair: '#3a2418' },
  soldier: { file: 'Military_Male_01', zombie: false, shirt: '#6a6a52', skin: '#c08a6a', pants: '#6a6a52', shoe: '#2a2418', hair: '#2a2018' },
};
const ZOMBIES = Object.keys(SKINS).filter((k) => SKINS[k].zombie);
export const zombieSkin = (id) => ZOMBIES[Math.abs(id * 7 + 3) % ZOMBIES.length];

let manifest = null;
let lowRes = false;
export function setRigLowRes(on) { lowRes = on; }
const sources = {};   // avatar key -> parsed FBX scene
let loaded = false;
let loading = null;
export function rigLoaded() { return loaded; }

const V = () => new THREE.Vector3();
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3();

// ------------------------------------------------------------------ textures
const tl = new THREE.TextureLoader();
function loadTex(url, srgb) {
  return tl.loadAsync(url).then((t) => {
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  });
}

// Zombify a skin/clothes texture: drain colour, rot the skin tone, add grime, bruises and blood.
function zombify(img, isHead) {
  const S = Math.min(1024, img.width);
  const c = document.createElement('canvas'); c.width = c.height = S;
  const x = c.getContext('2d');
  x.drawImage(img, 0, 0, S, S);
  const d = x.getImageData(0, 0, S, S), p = d.data;
  for (let i = 0; i < p.length; i += 4) {
    const r = p[i], g = p[i + 1], b = p[i + 2];
    const l = r * 0.3 + g * 0.59 + b * 0.11;
    // skin-ish pixels (warm, mid brightness) turn grey-green; everything gets drained and darker
    const skinish = r > g && g > b && r - b > 25 && l > 60 ? 1 : 0;
    const k = isHead ? 0.85 : 0.35 + skinish * 0.5;
    let nr = r + (l - r) * k, ng = g + (l - g) * k, nb = b + (l - b) * k;
    if (skinish || isHead) { nr *= 0.8; ng *= 0.9; nb *= 0.74; }
    const dark = isHead ? 0.74 : 0.76;
    p[i] = nr * dark; p[i + 1] = ng * dark; p[i + 2] = nb * dark;
  }
  x.putImageData(d, 0, 0);
  let seed = img.width + (isHead ? 17 : 5);
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const blob = (cx, cy, r, color) => {
    const g = x.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, color); g.addColorStop(1, color.replace(/[\d.]+\)$/, '0)'));
    x.fillStyle = g; x.fillRect(cx - r, cy - r, r * 2, r * 2);
  };
  const k = S / 1024;
  for (let i = 0; i < 70; i++) blob(rnd() * S, rnd() * S, (20 + rnd() * 80) * k, `rgba(28,22,12,${0.15 + rnd() * 0.25})`);
  for (let i = 0; i < (isHead ? 30 : 20); i++) blob(rnd() * S, rnd() * S, (8 + rnd() * 34) * k, `rgba(58,36,62,${0.15 + rnd() * 0.2})`);
  for (let i = 0; i < (isHead ? 26 : 30); i++) blob(rnd() * S, rnd() * S, (10 + rnd() * 60) * k, `rgba(86,6,6,${0.45 + rnd() * 0.45})`);
  for (let i = 0; i < 360; i++) { x.fillStyle = `rgba(${70 + rnd() * 40},4,4,${0.4 + rnd() * 0.5})`; x.beginPath(); x.arc(rnd() * S, rnd() * S, (1 + rnd() * 4) * k, 0, 7); x.fill(); }
  for (let i = 0; i < 26; i++) { x.fillStyle = 'rgba(76,4,4,0.55)'; x.fillRect(rnd() * S, rnd() * S, (2 + rnd() * 5) * k, (30 + rnd() * 120) * k); }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

async function buildMaterials(key) {
  const def = SKINS[key], m = manifest[def.file];
  const base = `/assets/rb/${def.file}/`;
  const out = {};
  await Promise.all(Object.entries(m.mats).map(async ([name, files]) => {
    const opacity = /opacity/.test(name);
    const cUrl = base + (opacity || lowRes ? 'lo/' : '') + files.c;
    const [color, normal] = await Promise.all([
      loadTex(cUrl, true),
      files.n ? loadTex(`${base}lo/${files.n}`, false) : Promise.resolve(null),
    ]);
    let map = color;
    if (def.zombie && !opacity) { map = zombify(color.image, /head/.test(name)); color.dispose(); }
    const skin = /head/.test(name);
    out[name] = new THREE.MeshStandardMaterial({
      map, normalMap: normal, roughness: skin ? 0.62 : 0.82, metalness: /pistol|knife|tools|helmet|equipment/.test(name) ? 0.25 : 0,
      alphaTest: opacity ? 0.45 : 0, side: opacity ? THREE.DoubleSide : THREE.FrontSide,
    });
  }));
  return out;
}

export function loadRig() {
  if (loading) return loading;
  loading = (async () => {
    manifest = await (await fetch('/assets/rb/manifest.json')).json();
    // no TGA handler is registered, so the FBX's own texture references become cheap placeholders
    const L = new FBXLoader();
    await Promise.all(Object.keys(SKINS).map(async (key) => {
      const def = SKINS[key];
      const [model, m] = await Promise.all([L.loadAsync(`/assets/rb/${def.file}/${def.file}.fbx`), buildMaterials(key)]);
      model.traverse((o) => {
        if (!o.isMesh) return;
        const list = Array.isArray(o.material) ? o.material : [o.material];
        const repl = list.map((old) => m[old.name] || m[Object.keys(m).find((k) => old.name.startsWith(k))] || new THREE.MeshStandardMaterial({ color: '#555' }));
        for (const old of list) old.dispose();
        o.material = Array.isArray(o.material) ? repl : repl[0];
        o.castShadow = false;
        o.receiveShadow = false;
      });
      sources[key] = model;
    }));
    loaded = true;
  })();
  return loading;
}

// ------------------------------------------------------------------ IK helpers
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
// game bone names -> Biped bones
const ALIAS = {
  Hips: 'Bip01_Pelvis', Spine: 'Bip01_Spine', Spine1: 'Bip01_Spine1', Spine2: 'Bip01_Spine2', Neck: 'Bip01_Neck', Head: 'Bip01_Head',
  LeftArm: 'Bip01_L_UpperArm', LeftForeArm: 'Bip01_L_Forearm', LeftHand: 'Bip01_L_Hand',
  RightArm: 'Bip01_R_UpperArm', RightForeArm: 'Bip01_R_Forearm', RightHand: 'Bip01_R_Hand',
  LeftUpLeg: 'Bip01_L_Thigh', LeftLeg: 'Bip01_L_Calf', LeftFoot: 'Bip01_L_Foot', LeftToe: 'Bip01_L_Toe0',
  RightUpLeg: 'Bip01_R_Thigh', RightLeg: 'Bip01_R_Calf', RightFoot: 'Bip01_R_Foot', RightToe: 'Bip01_R_Toe0',
};
const POSED = ['Spine1', 'Neck', 'LeftArm', 'LeftForeArm', 'RightArm', 'RightForeArm',
  'LeftUpLeg', 'LeftLeg', 'LeftFoot', 'RightUpLeg', 'RightLeg', 'RightFoot'];

const stumpGeo = new THREE.SphereGeometry(1, 8, 6);
const stumpMat = new THREE.MeshStandardMaterial({ color: '#4a0606', roughness: 0.3, emissive: '#200000' });
const boneMat = new THREE.MeshStandardMaterial({ color: '#e0d6c0', roughness: 0.6 });
const eyeGeo = new THREE.SphereGeometry(1, 8, 6);
const eyeMat = new THREE.MeshStandardMaterial({ color: '#000', emissive: '#ffb400', emissiveIntensity: 5 });

const _bodyQ = new THREE.Quaternion();
const _d = new THREE.Vector3(), _from = new THREE.Vector3(), _to = new THREE.Vector3();

export class RigCharacter {
  constructor(skinKey, { height = 1.8 } = {}) {
    this.skin = SKINS[skinKey] ? skinKey : ZOMBIES[0];
    const def = SKINS[this.skin];
    this.root = new THREE.Group();          // positioned/rotated by the entity
    this.body = new THREE.Group();          // used for falls, crawling, rising
    this.root.add(this.body);
    this.model = SkeletonUtils.clone(sources[this.skin]);
    this.model.scale.setScalar(0.01 * (height / 1.83));
    this.body.add(this.model);
    const raw = {};
    this.model.traverse((o) => {
      if (o.isBone) raw[o.name] = o;
      if (o.isMesh) o.frustumCulled = false;
    });
    this.bones = { ...raw };
    for (const [k, v] of Object.entries(ALIAS)) if (raw[v]) this.bones[k] = raw[v];
    this.rest = new Map();
    for (const k of POSED) if (this.bones[k]) this.rest.set(k, this.bones[k].quaternion.clone());
    this.phase = Math.random() * Math.PI * 2;
    this.speedSm = 0;
    this.hidden = new Set();   // bones collapsed by dismemberment
    this.frozen = false;
    this.armPose = null;
    this.idleT = Math.random() * 10;
    this.zombie = def.zombie;
    // glowing eyes on the dead
    if (def.zombie && raw.Bip01_LEye && raw.Bip01_REye) {
      this.model.updateMatrixWorld(true);
      for (const eb of [raw.Bip01_LEye, raw.Bip01_REye]) {
        const e = new THREE.Mesh(eyeGeo, eyeMat);
        // just in front of the eyeball (the avatar faces +Z when built)
        e.position.copy(eb.worldToLocal(eb.getWorldPosition(V()).add(new THREE.Vector3(0, 0, 0.007))));
        e.scale.setScalar(0.0055 / (eb.getWorldScale(V()).x || 1));
        eb.add(e);
      }
    }
  }

  /** Point a bone (from its joint towards `child`) along a direction given in body space. */
  aim(name, childName, dir) {
    const b = this.bones[name], c = this.bones[childName];
    if (!b || !c || this.hidden.has(name)) return;
    b.updateMatrixWorld(true);
    _from.copy(c.getWorldPosition(_a)).sub(b.getWorldPosition(_b));
    if (_from.lengthSq() < 1e-10) return;
    _from.normalize();
    _to.copy(dir).normalize().applyQuaternion(_bodyQ);
    rotateBoneTo(b, _from, _to);
  }

  /**
   * Procedural locomotion. `speed` is the effort (m/s-ish) and `rate` the cadence multiplier
   * (zombie walkers shuffle slowly with big effort, runners sprint).
   */
  animate(dt, speed, rate = 1) {
    if (this.frozen) return;
    const B = this.bones;
    this.speedSm += (speed - this.speedSm) * Math.min(1, dt * 6);
    const s = this.speedSm;
    for (const [k, q] of this.rest) B[k].quaternion.copy(q);
    const moving = s > 0.15;
    const freq = (0.4 + 0.33 * Math.min(s, 6)) * (0.55 + 0.45 * rate);
    if (moving) this.phase += dt * freq * Math.PI * 2;
    this.idleT += dt;
    const ph = this.phase;
    const A = moving ? Math.min(0.62, 0.16 + 0.075 * s) : 0;
    // pelvis bob (model units are centimetres)
    this.model.position.y = moving ? -Math.abs(Math.cos(ph)) * 0.022 * (0.4 + Math.min(1, s / 4)) : Math.sin(this.idleT * 1.6) * 0.004;
    this.model.updateMatrixWorld(true);
    this.body.getWorldQuaternion(_bodyQ);
    // torso: zombies hunch and lurch, runners lean into it
    const lean = (this.zombie ? 0.22 : 0.06) + Math.min(0.3, s * 0.04) + (moving ? 0.03 * Math.sin(ph * 2) : 0.015 * Math.sin(this.idleT * 1.6));
    const roll = moving ? Math.sin(ph) * 0.06 : 0;
    this.aim('Spine1', 'Neck', _d.set(roll, Math.cos(lean), Math.sin(lean)));
    const tilt = this.zombie ? 0.25 + Math.sin(this.idleT * 0.9) * 0.08 : 0.08;
    this.aim('Neck', 'Head', _d.set(this.zombie ? Math.sin(this.idleT * 0.7) * 0.25 : 0, Math.cos(tilt), Math.sin(tilt)));
    // legs
    for (const [side, sgn, off] of [['Left', 1, 0], ['Right', -1, Math.PI]]) {
      const p = ph + off;
      const a = A * Math.sin(p);
      const knee = moving ? 0.1 + (0.25 + A * 1.3) * Math.max(0, Math.cos(p)) : 0.04;
      const spread = 0.06 * sgn;
      this.aim(`${side}UpLeg`, `${side}Leg`, _d.set(spread, -Math.cos(a), Math.sin(a)));
      this.aim(`${side}Leg`, `${side}Foot`, _d.set(spread * 0.5, -Math.cos(a - knee), Math.sin(a - knee)));
      const toePitch = moving ? -0.25 + 0.5 * Math.max(0, -Math.sin(p)) : -0.2;
      this.aim(`${side}Foot`, `${side}Toe`, _d.set(0, Math.sin(toePitch), Math.cos(toePitch)));
    }
    // arms (reach()/reachWorld() override these when the entity poses them)
    for (const [side, sgn, off] of [['Left', 1, Math.PI], ['Right', -1, 0]]) {
      const sw = moving ? A * 0.9 * Math.sin(ph + off) : 0;
      const out = 0.16 * sgn;
      this.aim(`${side}Arm`, `${side}ForeArm`, _d.set(out, -Math.cos(sw), Math.sin(sw) + 0.05));
      const el = 0.25 + (moving ? 0.25 + Math.min(1.1, s * 0.18) : 0) + Math.max(0, sw) * 0.6;
      this.aim(`${side}ForeArm`, `${side}Hand`, _d.set(out * 0.4, -Math.cos(sw + el), Math.sin(sw + el)));
    }
  }

  /** Pose both hands towards targets given in character space (metres, +Z forward). */
  reach(left, right, poleOut = 0.6) {
    const B = this.bones;
    this.root.updateMatrixWorld(true);
    // the poses were authored for the small cartoon rig; scale them up to life size
    const toWorld = (p) => this.body.localToWorld(new THREE.Vector3(p[0] * 1.25, p[1] * 1.28, p[2] * 1.1));
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
    stump.scale.setScalar(0.055 / ws);
    parent.add(stump);
    const nub = new THREE.Mesh(stumpGeo, boneMat);
    nub.position.copy(bone.position).multiplyScalar(1.08);
    nub.scale.setScalar(0.022 / ws);
    parent.add(nub);
    this.applyHidden();
    return { at, bone: boneName, parent };
  }

  boneWorld(name, out = V()) { return this.bones[name].getWorldPosition(out); }

  dispose() {}
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
  [5, 'LeftArm', 'LeftForeArm', 0.07], [5, 'LeftForeArm', 'LeftHand', 0.06],
  [6, 'RightArm', 'RightForeArm', 0.07], [6, 'RightForeArm', 'RightHand', 0.06],
  [7, 'LeftUpLeg', 'LeftLeg', 0.1], [7, 'LeftLeg', 'LeftFoot', 0.08],
  [8, 'RightUpLeg', 'RightLeg', 0.1], [8, 'RightLeg', 'RightFoot', 0.08],
];

/** Returns { t, part } for the nearest hit on this character, or null. part: 0 body, 1 head, 5-8 limbs */
export function raycastRig(rig, origin, dir, maxDist) {
  const B = rig.bones;
  let best = Infinity, part = -1;
  if (!rig.hidden.has('Head')) {
    // the head centre sits ~9 cm past the head joint, along the neck
    const h0 = B.Head.getWorldPosition(V());
    const n = B.Neck.getWorldPosition(V());
    const c = h0.clone().add(h0.clone().sub(n).normalize().multiplyScalar(0.09));
    const t = raySphere(origin, dir, c, 0.13);
    if (t >= 0 && t < best) { best = t; part = 1; }
  }
  const t = rayCapsule(origin, dir, B.Hips.getWorldPosition(V()), B.Neck.getWorldPosition(V()), 0.19);
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
  const s = SKINS[skinKey] || SKINS.medic;
  const blood = '#5a0606', bone = '#e0d6c0';
  let items;
  if (kind === 'head') {
    items = [
      { k: 'r', s: [0.19, 0.24, 0.21], c: s.skin, p: [0, 0.08, 0], r: 0.08 },
      { k: 'r', s: [0.2, 0.08, 0.21], c: s.hair, p: [0, 0.19, -0.01], r: 0.04 },
      { s: [0.1, 0.06, 0.1], c: blood, p: [0, -0.06, 0] },
      { s: [0.04, 0.06, 0.04], c: bone, p: [0, -0.1, 0] },
    ];
  } else if (kind === 'forearm') {
    items = [
      { k: 'r', s: [0.08, 0.27, 0.08], c: s.skin, p: [0, -0.14, 0], r: 0.035 },
      { k: 'r', s: [0.09, 0.1, 0.04], c: s.skin, p: [0, -0.32, 0], r: 0.02 },
      { s: [0.07, 0.03, 0.07], c: blood, p: [0, 0.01, 0] },
    ];
  } else if (kind === 'arm') {
    items = [
      { k: 'r', s: [0.11, 0.3, 0.11], c: s.shirt, p: [0, -0.15, 0], r: 0.045 },
      { k: 'r', s: [0.08, 0.27, 0.08], c: s.skin, p: [0, -0.44, 0], r: 0.035 },
      { k: 'r', s: [0.09, 0.1, 0.04], c: s.skin, p: [0, -0.62, 0], r: 0.02 },
      { s: [0.09, 0.03, 0.09], c: blood, p: [0, 0.01, 0] },
    ];
  } else if (kind === 'shin') {
    items = [
      { k: 'r', s: [0.12, 0.44, 0.13], c: s.pants, p: [0, -0.22, 0], r: 0.05 },
      { k: 'r', s: [0.11, 0.08, 0.27], c: s.shoe, p: [0, -0.46, 0.06], r: 0.03 },
      { s: [0.09, 0.03, 0.09], c: blood, p: [0, 0.01, 0] },
    ];
  } else {
    items = [
      { k: 'r', s: [0.16, 0.44, 0.17], c: s.pants, p: [0, -0.22, 0], r: 0.06 },
      { k: 'r', s: [0.12, 0.44, 0.13], c: s.pants, p: [0, -0.66, 0], r: 0.05 },
      { k: 'r', s: [0.11, 0.08, 0.27], c: s.shoe, p: [0, -0.9, 0.06], r: 0.03 },
      { s: [0.11, 0.04, 0.11], c: blood, p: [0, 0.01, 0] },
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
