// Detailed low-poly characters. Every body part is merged into a single vertex-coloured mesh,
// so a zombie costs ~14 draw calls no matter how much detail it has.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createNameTag } from './models.js';

export const bodyMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0.0 });
const eyeMats = {
  zombie: new THREE.MeshStandardMaterial({ color: '#000', emissive: '#ffb400', emissiveIntensity: 7 }),
  zombiePower: new THREE.MeshStandardMaterial({ color: '#000', emissive: '#ff7a1a', emissiveIntensity: 8 }),
  dog: new THREE.MeshStandardMaterial({ color: '#000', emissive: '#ff4a10', emissiveIntensity: 9 }),
};
const fireMat = new THREE.MeshStandardMaterial({ color: '#200', emissive: '#ff4a10', emissiveIntensity: 3, roughness: 1 });

const _c = new THREE.Color();
const geoCache = new Map();
function baseGeo(kind, w, h, d, r) {
  const k = `${kind}|${w}|${h}|${d}|${r}`;
  let g = geoCache.get(k);
  if (!g) {
    if (kind === 'r') g = new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2, h / 2, d / 2));
    else if (kind === 'c') g = new THREE.CylinderGeometry(w, h, d, 10);
    else g = new THREE.BoxGeometry(w, h, d);
    geoCache.set(k, g);
  }
  return g;
}

/** Merge a list of primitives into one coloured geometry. */
export function build(items) {
  const geos = [];
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  for (const it of items) {
    const g = baseGeo(it.k || 'b', it.s[0], it.s[1], it.s[2], it.r ?? 0.03).clone();
    for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name);
    e.set(...(it.rot || [0, 0, 0]));
    q.setFromEuler(e);
    m.compose(new THREE.Vector3(...(it.p || [0, 0, 0])), q, new THREE.Vector3(1, 1, 1));
    g.applyMatrix4(m);
    const n = g.attributes.position.count;
    const col = new Float32Array(n * 3);
    _c.set(it.c);
    if (it.v) _c.offsetHSL(0, 0, (Math.random() - 0.5) * it.v);
    for (let i = 0; i < n; i++) { col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geos.push(g);
  }
  const allIndexed = geos.every((g) => g.index);
  const merged = mergeGeometries(allIndexed ? geos : geos.map((g) => (g.index ? g.toNonIndexed() : g)));
  geos.forEach((g) => g.dispose());
  return merged;
}

function meshOf(items, castShadow = false) {
  const mesh = new THREE.Mesh(build(items), bodyMat);
  mesh.castShadow = castShadow;
  mesh.userData.ownGeometry = true;
  return mesh;
}

function joint(parent, x, y, z) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  parent.add(g);
  return g;
}

const pick = (arr, r) => arr[Math.floor(r() * arr.length) % arr.length];
function seeded(seed) {
  let s = Math.floor(seed * 1e6) >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

// ------------------------------------------------------------------ zombies
const SKINS = ['#8a9a7c', '#93a088', '#7c8c6e', '#a2a690', '#8b8f78', '#9aa38a'];
const VARIANTS = [
  { name: 'civilian', shirts: ['#5b4a3a', '#4b5568', '#6b3a3a', '#5a5a5a', '#2f3b52', '#6e6248', '#3e2f45'], pants: ['#2a2620', '#25292f', '#3b3428'] },
  { name: 'soldier', shirts: ['#4a5038', '#525a3e', '#454b33'], pants: ['#3e4430', '#444a35'], helmet: true },
  { name: 'scientist', shirts: ['#c9c6bd', '#bdbab0'], pants: ['#2c2e33', '#33302b'], coat: true },
  { name: 'worker', shirts: ['#2f4c6e', '#3b5470'], pants: ['#2f4c6e', '#3b5470'], overalls: true },
];

export function createZombie(seed) {
  const r = seeded(seed + 0.123);
  const variant = r() < 0.4 ? VARIANTS[0] : pick(VARIANTS, r);
  const skin = pick(SKINS, r);
  const shirt = pick(variant.shirts, r);
  const pants = pick(variant.pants, r);
  const blood = '#4a0808', bloodDark = '#2a0404', bone = '#d8d0b8', hair = pick(['#2a221c', '#1a1612', '#4a3a28', '#6a6a60'], r);
  const g = new THREE.Group();

  const hips = joint(g, 0, 0.94, 0);
  hips.add(meshOf([
    { k: 'r', s: [0.42, 0.2, 0.26], c: pants, p: [0, 0, 0], v: 0.05 },
    { s: [0.44, 0.06, 0.28], c: variant.overalls ? pants : '#1c1712', p: [0, 0.08, 0] },
  ]));

  const torso = joint(hips, 0, 0.08, 0);
  const torsoItems = [
    { k: 'r', s: [0.46, 0.56, 0.27], c: shirt, p: [0, 0.3, 0], r: 0.06, v: 0.06 },
    { k: 'r', s: [0.5, 0.16, 0.28], c: shirt, p: [0, 0.52, 0], r: 0.06, v: 0.06 },
    // torn wound with ribs
    { s: [0.16, 0.2, 0.02], c: bloodDark, p: [0.09, 0.3, 0.137] },
    { s: [0.12, 0.022, 0.02], c: bone, p: [0.09, 0.36, 0.145] },
    { s: [0.12, 0.022, 0.02], c: bone, p: [0.09, 0.31, 0.145] },
    { s: [0.12, 0.022, 0.02], c: bone, p: [0.09, 0.26, 0.145] },
    { s: [0.1, 0.14, 0.02], c: blood, p: [-0.12, 0.16, 0.137], rot: [0, 0, 0.3] },
    { k: 'c', s: [0.07, 0.08, 0.12], c: skin, p: [0, 0.64, 0] }, // neck
  ];
  if (variant.coat) torsoItems.push({ k: 'r', s: [0.5, 0.72, 0.3], c: shirt, p: [0, 0.22, -0.01], r: 0.05 }, { s: [0.06, 0.5, 0.02], c: '#8a877e', p: [0, 0.28, 0.152] });
  if (variant.overalls) torsoItems.push({ s: [0.06, 0.4, 0.02], c: '#2a3d58', p: [-0.12, 0.38, 0.14] }, { s: [0.06, 0.4, 0.02], c: '#2a3d58', p: [0.12, 0.38, 0.14] });
  if (variant.helmet) torsoItems.push({ s: [0.5, 0.06, 0.29], c: '#2a2a20', p: [0, 0.08, 0] }, { s: [0.1, 0.1, 0.05], c: '#3a3a28', p: [-0.14, 0.12, 0.15] }, { s: [0.1, 0.1, 0.05], c: '#3a3a28', p: [0.14, 0.12, 0.15] });
  torso.add(meshOf(torsoItems));

  const head = joint(torso, 0, 0.7, 0.03);
  const headItems = [
    { k: 'r', s: [0.27, 0.3, 0.28], c: skin, p: [0, 0.14, 0], r: 0.07, v: 0.05 },
    { s: [0.05, 0.07, 0.05], c: skin, p: [0, 0.13, 0.15] }, // nose
    { s: [0.09, 0.035, 0.02], c: '#1a1210', p: [-0.065, 0.19, 0.142] }, // brows / sockets
    { s: [0.09, 0.035, 0.02], c: '#1a1210', p: [0.065, 0.19, 0.142] },
    { s: [0.06, 0.04, 0.03], c: blood, p: [0.09, 0.06, 0.13] },
  ];
  if (variant.helmet) headItems.push({ k: 'r', s: [0.34, 0.14, 0.36], c: '#3b4030', p: [0, 0.3, 0], r: 0.06 }, { s: [0.4, 0.03, 0.42], c: '#33382a', p: [0, 0.24, 0] });
  else if (r() < 0.75) headItems.push({ k: 'r', s: [0.29, 0.08, 0.3], c: hair, p: [0, 0.3, -0.01], r: 0.04 }, { s: [0.29, 0.14, 0.06], c: hair, p: [0, 0.22, -0.12] });
  if (variant.coat) headItems.push({ s: [0.22, 0.04, 0.02], c: '#111', p: [0, 0.17, 0.145] });
  head.add(meshOf(headItems));
  const eyes = new THREE.Mesh(build([
    { s: [0.045, 0.035, 0.02], c: '#ffffff', p: [-0.065, 0.17, 0.145] },
    { s: [0.045, 0.035, 0.02], c: '#ffffff', p: [0.065, 0.17, 0.145] },
  ]), eyeMats.zombie);
  eyes.userData.ownGeometry = true;
  head.add(eyes);
  const jaw = joint(head, 0, 0.04, 0.03);
  jaw.add(meshOf([
    { k: 'r', s: [0.22, 0.07, 0.2], c: skin, p: [0, -0.02, 0.02], r: 0.03 },
    { s: [0.16, 0.025, 0.02], c: bone, p: [0, 0.0, 0.12] },
    { s: [0.14, 0.04, 0.02], c: bloodDark, p: [0, 0.03, 0.115] },
  ]));
  jaw.rotation.x = 0.25 + r() * 0.25;

  const torn = r() < 0.5;
  const mkArm = (side) => {
    const sh = joint(torso, side * 0.3, 0.52, 0);
    const sleeveShort = variant.name === 'worker' || torn;
    sh.add(meshOf([
      { k: 'r', s: [0.14, 0.3, 0.14], c: sleeveShort ? skin : shirt, p: [0, -0.14, 0], r: 0.05, v: 0.05 },
      { k: 'r', s: [0.16, 0.12, 0.16], c: shirt, p: [0, -0.02, 0], r: 0.05 },
    ]));
    const el = joint(sh, 0, -0.29, 0);
    el.add(meshOf([
      { k: 'r', s: [0.12, 0.28, 0.12], c: skin, p: [0, -0.13, 0], r: 0.045, v: 0.05 },
      { k: 'r', s: [0.11, 0.12, 0.06], c: skin, p: [0, -0.32, 0.01], r: 0.025 }, // hand
      { s: [0.1, 0.07, 0.03], c: skin, p: [0, -0.4, 0.03], rot: [0.4, 0, 0] }, // fingers
      { s: [0.06, 0.06, 0.02], c: blood, p: [side * 0.03, -0.18, 0.06] },
    ]));
    return { sh, el };
  };
  const L = mkArm(-1), R = mkArm(1);

  const mkLeg = (side) => {
    const hip = joint(hips, side * 0.12, -0.02, 0);
    hip.add(meshOf([{ k: 'r', s: [0.18, 0.46, 0.2], c: pants, p: [0, -0.22, 0], r: 0.05, v: 0.04 }]));
    const knee = joint(hip, 0, -0.45, 0);
    knee.add(meshOf([
      { k: 'r', s: [0.16, 0.42, 0.18], c: pants, p: [0, -0.2, 0], r: 0.05, v: 0.04 },
      { k: 'r', s: [0.17, 0.09, 0.28], c: variant.helmet ? '#1a1712' : '#22201c', p: [0, -0.43, 0.04], r: 0.03 },
    ]));
    return { hip, knee };
  };
  const LL = mkLeg(-1), RL = mkLeg(1);

  g.userData.parts = {
    hips, torso, head, jaw, eyes,
    armL: L.sh, armR: R.sh, elbowL: L.el, elbowR: R.el,
    legL: LL.hip, legR: RL.hip, kneeL: LL.knee, kneeR: RL.knee,
  };
  g.userData.variant = variant.name;
  return g;
}

export function setZombieEyes(model, powered) {
  const e = model.userData.parts?.eyes;
  if (e) e.material = powered ? eyeMats.zombiePower : eyeMats.zombie;
}

// ------------------------------------------------------------------ hellhounds
export function createDog() {
  const fur = '#2a2321', dark = '#141010', flesh = '#5a1a12';
  const g = new THREE.Group();
  const body = joint(g, 0, 0.62, 0);
  body.add(meshOf([
    { k: 'r', s: [0.4, 0.42, 0.62], c: fur, p: [0, 0.02, 0.18], r: 0.1, v: 0.04 },
    { k: 'r', s: [0.34, 0.36, 0.5], c: fur, p: [0, 0, -0.28], r: 0.1, v: 0.04 },
    { s: [0.06, 0.04, 0.5], c: dark, p: [0, 0.22, 0] },
    { s: [0.04, 0.12, 0.04], c: dark, p: [0, 0.27, 0.2], rot: [-0.4, 0, 0] },
    { s: [0.04, 0.1, 0.04], c: dark, p: [0, 0.25, 0.0], rot: [-0.4, 0, 0] },
    { s: [0.04, 0.09, 0.04], c: dark, p: [0, 0.23, -0.2], rot: [-0.4, 0, 0] },
    { s: [0.18, 0.1, 0.02], c: flesh, p: [0.21, 0.0, 0.1], rot: [0, Math.PI / 2, 0] },
  ]));
  const glow = new THREE.Mesh(build([{ s: [0.08, 0.04, 0.55], c: '#fff', p: [0, 0.2, 0] }]), fireMat);
  glow.userData.ownGeometry = true;
  body.add(glow);
  const head = joint(body, 0, 0.18, 0.5);
  head.add(meshOf([
    { k: 'r', s: [0.28, 0.26, 0.28], c: fur, p: [0, 0, 0], r: 0.07 },
    { k: 'r', s: [0.17, 0.12, 0.22], c: dark, p: [0, -0.05, 0.2], r: 0.04 },
    { s: [0.15, 0.03, 0.18], c: '#e8e0c8', p: [0, -0.1, 0.21] }, // teeth
    { s: [0.07, 0.13, 0.05], c: dark, p: [-0.09, 0.17, -0.06], rot: [-0.3, 0, -0.2] },
    { s: [0.07, 0.13, 0.05], c: dark, p: [0.09, 0.17, -0.06], rot: [-0.3, 0, 0.2] },
  ]));
  const eyes = new THREE.Mesh(build([
    { s: [0.06, 0.04, 0.02], c: '#fff', p: [-0.075, 0.04, 0.14] },
    { s: [0.06, 0.04, 0.02], c: '#fff', p: [0.075, 0.04, 0.14] },
  ]), eyeMats.dog);
  eyes.userData.ownGeometry = true;
  head.add(eyes);
  const legs = [];
  for (const [x, z] of [[-0.14, 0.32], [0.14, 0.32], [-0.13, -0.36], [0.13, -0.36]]) {
    const l = joint(body, x, -0.1, z);
    l.add(meshOf([
      { k: 'r', s: [0.12, 0.3, 0.14], c: fur, p: [0, -0.12, 0], r: 0.04 },
      { k: 'r', s: [0.09, 0.3, 0.1], c: dark, p: [0, -0.36, 0.02], r: 0.03 },
    ]));
    legs.push(l);
  }
  const tail = joint(body, 0, 0.12, -0.52);
  tail.add(meshOf([{ k: 'r', s: [0.06, 0.06, 0.4], c: fur, p: [0, 0, -0.18], r: 0.025 }]));
  tail.rotation.x = 0.5;
  g.userData.parts = { body, head, legs, tail };
  return g;
}

// ------------------------------------------------------------------ players (other survivors)
export function createSurvivor(color) {
  const fat = '#3d4433', skin = '#c8a07e', dark = '#1d1f1b', helmet = '#46503a';
  const g = new THREE.Group();
  const hips = joint(g, 0, 0.94, 0);
  hips.add(meshOf([{ k: 'r', s: [0.42, 0.2, 0.26], c: fat, p: [0, 0, 0] }, { s: [0.44, 0.06, 0.28], c: dark, p: [0, 0.08, 0] }], true));
  const torso = joint(hips, 0, 0.08, 0);
  torso.add(meshOf([
    { k: 'r', s: [0.46, 0.6, 0.27], c: fat, p: [0, 0.32, 0], r: 0.06 },
    { k: 'r', s: [0.5, 0.42, 0.32], c: color, p: [0, 0.36, 0], r: 0.05 },
    { s: [0.1, 0.12, 0.05], c: dark, p: [-0.13, 0.26, 0.17] },
    { s: [0.1, 0.12, 0.05], c: dark, p: [0.13, 0.26, 0.17] },
    { k: 'c', s: [0.07, 0.08, 0.1], c: skin, p: [0, 0.66, 0] },
  ], true));
  const head = joint(torso, 0, 0.7, 0);
  head.add(meshOf([
    { k: 'r', s: [0.26, 0.28, 0.27], c: skin, p: [0, 0.13, 0], r: 0.07 },
    { k: 'r', s: [0.34, 0.16, 0.36], c: helmet, p: [0, 0.3, 0], r: 0.07 },
    { s: [0.38, 0.03, 0.4], c: '#3c4532', p: [0, 0.23, 0] },
    { s: [0.2, 0.05, 0.02], c: '#151515', p: [0, 0.17, 0.138] },
  ], true));
  const arms = joint(torso, 0, 0.5, 0);
  arms.add(meshOf([
    { k: 'r', s: [0.13, 0.13, 0.42], c: fat, p: [0.26, -0.05, 0.18], r: 0.04 },
    { k: 'r', s: [0.13, 0.13, 0.5], c: fat, p: [-0.18, -0.05, 0.25], r: 0.04 },
    { s: [0.09, 0.09, 0.1], c: dark, p: [0.2, -0.05, 0.42] },
    { s: [0.09, 0.09, 0.1], c: dark, p: [-0.05, -0.05, 0.52] },
  ], true));
  const gunHolder = joint(arms, 0.12, -0.04, 0.42);
  gunHolder.rotation.y = Math.PI;
  const mkLeg = (side) => {
    const hip = joint(hips, side * 0.12, -0.02, 0);
    hip.add(meshOf([{ k: 'r', s: [0.19, 0.46, 0.21], c: fat, p: [0, -0.22, 0], r: 0.05 }], true));
    const knee = joint(hip, 0, -0.45, 0);
    knee.add(meshOf([{ k: 'r', s: [0.17, 0.42, 0.19], c: fat, p: [0, -0.2, 0], r: 0.05 }, { k: 'r', s: [0.18, 0.1, 0.3], c: dark, p: [0, -0.42, 0.04], r: 0.03 }], true));
    return { hip, knee };
  };
  const LL = mkLeg(-1), RL = mkLeg(1);
  g.userData.parts = { hips, torso, head, arms, gunHolder, legL: LL.hip, legR: RL.hip, kneeL: LL.knee, kneeR: RL.knee };
  return g;
}

export { createNameTag };

// ------------------------------------------------------------------ first-person arms
// A forearm segment from the wrist running down/back along `dir`.
function forearm(wrist, dir, len, thick, sleeve, cuff, watch) {
  const d = new THREE.Vector3(...dir).normalize();
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), d);
  const rot = new THREE.Euler().setFromQuaternion(q).toArray().slice(0, 3);
  const w = new THREE.Vector3(...wrist);
  const at = (t) => w.clone().addScaledVector(d, t).toArray();
  const items = [
    { k: 'r', s: [thick, thick, len], c: sleeve, p: at(0.05 + len / 2), rot, r: 0.025 },
    { k: 'r', s: [thick * 1.15, thick * 1.15, 0.06], c: cuff, p: at(0.05), rot, r: 0.018 },
  ];
  if (watch) items.push({ s: [thick * 0.9, thick * 0.4, 0.035], c: '#0d0d0d', p: at(0.0).map((v, i) => v + (i === 1 ? thick * 0.45 : 0)), rot });
  return items;
}

/** Sleeved arms + gloved hands posed around a gun. leftZ: where the support hand sits. */
export function createFpArms(leftZ, pistol) {
  const sleeve = '#2e3527', cuff = '#232820', glove = '#24211d', knuckle = '#171513';
  const g = new THREE.Group();
  g.add(meshOf([
    // right hand wrapped around the grip
    { k: 'r', s: [0.05, 0.085, 0.07], c: glove, p: [0.0, -0.05, 0.035], r: 0.02 },
    { k: 'r', s: [0.062, 0.022, 0.03], c: knuckle, p: [-0.006, -0.025, 0.0], r: 0.008 },
    { k: 'r', s: [0.062, 0.022, 0.03], c: knuckle, p: [-0.006, -0.05, -0.002], r: 0.008 },
    { k: 'r', s: [0.062, 0.022, 0.03], c: knuckle, p: [-0.006, -0.075, 0.0], r: 0.008 },
    { k: 'r', s: [0.02, 0.02, 0.06], c: glove, p: [-0.03, -0.005, -0.005], r: 0.008, rot: [0, 0.3, 0] },
    ...forearm([0.01, -0.09, 0.07], [0.22, -0.8, 0.55], 0.34, 0.072, sleeve, cuff, true),
  ]));
  if (pistol) {
    g.add(meshOf([
      { k: 'r', s: [0.05, 0.075, 0.07], c: glove, p: [-0.035, -0.07, 0.03], r: 0.02 },
      { k: 'r', s: [0.02, 0.06, 0.02], c: knuckle, p: [-0.012, -0.065, -0.005], r: 0.006 },
      ...forearm([-0.05, -0.11, 0.06], [-0.3, -0.8, 0.5], 0.34, 0.072, sleeve, cuff, false),
    ]));
  } else {
    const lz = leftZ;
    g.add(meshOf([
      { k: 'r', s: [0.075, 0.03, 0.085], c: glove, p: [0, -0.04, lz], r: 0.012 },
      { k: 'r', s: [0.022, 0.055, 0.075], c: knuckle, p: [0.032, -0.015, lz], r: 0.008 },
      { k: 'r', s: [0.022, 0.055, 0.075], c: glove, p: [-0.034, -0.017, lz], r: 0.008 },
      ...forearm([-0.02, -0.06, lz + 0.04], [-0.38, -0.72, 0.58], 0.4, 0.072, sleeve, cuff, false),
    ]));
  }
  g.traverse((o) => { if (o.isMesh) o.frustumCulled = false; });
  return g;
}

export function disposeModel(root) {
  root.traverse((o) => { if (o.isMesh && o.userData.ownGeometry) o.geometry.dispose(); });
}
