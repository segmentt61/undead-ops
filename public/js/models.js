// Low-poly procedural models: zombies, hellhounds, players, guns and map props.
import * as THREE from 'three';
import * as TX from './textures.js';
import { gunModel } from './assets.js';

const boxGeoCache = new Map();
export function boxGeo(w, h, d) {
  const k = `${w}|${h}|${d}`;
  let g = boxGeoCache.get(k);
  if (!g) { g = new THREE.BoxGeometry(w, h, d); boxGeoCache.set(k, g); }
  return g;
}

const matCache = new Map();
export function mat(color, opts = {}) {
  const k = color + JSON.stringify(opts);
  let m = matCache.get(k);
  if (!m) {
    m = new THREE.MeshLambertMaterial({ color, ...opts });
    matCache.set(k, m);
  }
  return m;
}

function box(parent, w, h, d, material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(boxGeo(w, h, d), material);
  m.position.set(x, y, z);
  parent.add(m);
  return m;
}

function cyl(parent, rt, rb, h, material, x = 0, y = 0, z = 0, axis = 'z', seg = 10) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), material);
  m.position.set(x, y, z);
  if (axis === 'z') m.rotation.x = Math.PI / 2;
  if (axis === 'x') m.rotation.z = Math.PI / 2;
  parent.add(m);
  return m;
}

// ------------------------------------------------------------------ zombies
const SHIRTS = ['#5b4a3a', '#3d4a3a', '#4b5568', '#6b3a3a', '#5a5a5a', '#2f3b52', '#6e6248', '#3e2f45'];
const PANTS = ['#2a2620', '#25292f', '#3b3428', '#1e2228'];
const SKINS = ['#7f9a74', '#8ea583', '#76866a', '#9aa58d'];

export const ZOMBIE_HEAD_Y = 1.7;
export const ZOMBIE_HEAD_R = 0.2;
export const ZOMBIE_BODY_R = 0.3;
export const ZOMBIE_BODY_H = 1.52;

export function createZombie(seed) {
  const pick = (arr, k) => arr[Math.abs(Math.floor(seed * 7919 + k * 31)) % arr.length];
  const g = new THREE.Group();
  const skin = mat(pick(SKINS, 1));
  const shirt = mat(pick(SHIRTS, 2));
  const pants = mat(pick(PANTS, 3));
  const eyeMat = mat('#ffcc22', { emissive: '#ffb000', emissiveIntensity: 2.2 });
  const blood = mat('#5a0b0b');

  const hips = new THREE.Group();
  hips.position.y = 0.92;
  g.add(hips);

  const torso = new THREE.Group();
  hips.add(torso);
  box(torso, 0.5, 0.62, 0.28, shirt, 0, 0.32, 0);
  box(torso, 0.18, 0.2, 0.02, blood, 0.1, 0.38, 0.145);
  box(torso, 0.52, 0.1, 0.3, pants, 0, 0.0, 0);

  const head = new THREE.Group();
  head.position.set(0, 0.68, 0.02);
  torso.add(head);
  box(head, 0.3, 0.32, 0.3, skin, 0, 0.14, 0);
  box(head, 0.06, 0.04, 0.02, eyeMat, -0.07, 0.17, 0.155);
  box(head, 0.06, 0.04, 0.02, eyeMat, 0.07, 0.17, 0.155);
  box(head, 0.16, 0.05, 0.02, mat('#2a0b0b'), 0, 0.05, 0.155);
  box(head, 0.32, 0.06, 0.32, mat('#2a221c'), 0, 0.3, -0.01); // hair

  const mkArm = (side) => {
    const a = new THREE.Group();
    a.position.set(side * 0.33, 0.56, 0);
    torso.add(a);
    box(a, 0.14, 0.34, 0.14, shirt, 0, -0.15, 0);
    box(a, 0.12, 0.36, 0.12, skin, 0, -0.48, 0);
    return a;
  };
  const armL = mkArm(-1), armR = mkArm(1);

  const mkLeg = (side) => {
    const l = new THREE.Group();
    l.position.set(side * 0.13, 0, 0);
    hips.add(l);
    box(l, 0.2, 0.86, 0.22, pants, 0, -0.45, 0);
    box(l, 0.21, 0.08, 0.3, mat('#1a1612'), 0, -0.88, 0.04);
    return l;
  };
  const legL = mkLeg(-1), legR = mkLeg(1);

  g.userData.parts = { hips, torso, head, armL, armR, legL, legR };
  return g;
}

export function createDog() {
  const g = new THREE.Group();
  const fur = mat('#2b2422');
  const dark = mat('#141010');
  const glow = mat('#ff5a1a', { emissive: '#ff4400', emissiveIntensity: 2.5 });
  const body = new THREE.Group();
  body.position.y = 0.62;
  g.add(body);
  box(body, 0.38, 0.4, 0.95, fur, 0, 0, 0);
  box(body, 0.3, 0.06, 0.7, glow, 0, 0.21, -0.05); // glowing spine
  const head = new THREE.Group();
  head.position.set(0, 0.16, 0.52);
  body.add(head);
  box(head, 0.3, 0.28, 0.32, fur, 0, 0, 0);
  box(head, 0.18, 0.14, 0.22, dark, 0, -0.05, 0.22);
  box(head, 0.06, 0.05, 0.02, glow, -0.08, 0.05, 0.165);
  box(head, 0.06, 0.05, 0.02, glow, 0.08, 0.05, 0.165);
  box(head, 0.07, 0.12, 0.05, dark, -0.1, 0.18, -0.06);
  box(head, 0.07, 0.12, 0.05, dark, 0.1, 0.18, -0.06);
  const legs = [];
  for (const [x, z] of [[-0.14, 0.36], [0.14, 0.36], [-0.14, -0.36], [0.14, -0.36]]) {
    const l = new THREE.Group();
    l.position.set(x, -0.1, z);
    body.add(l);
    box(l, 0.11, 0.55, 0.12, dark, 0, -0.26, 0);
    legs.push(l);
  }
  const tail = new THREE.Group();
  tail.position.set(0, 0.12, -0.48);
  body.add(tail);
  box(tail, 0.06, 0.06, 0.35, fur, 0, 0, -0.16);
  tail.rotation.x = 0.5;
  g.userData.parts = { body, head, legs, tail };
  return g;
}

// ------------------------------------------------------------------ players
export function createPlayerModel(color) {
  const g = new THREE.Group();
  const vest = mat(color);
  const fatigues = mat('#3d4433');
  const skin = mat('#c8a07e');
  const dark = mat('#1d1f1b');
  const hips = new THREE.Group();
  hips.position.y = 0.92;
  g.add(hips);
  const torso = new THREE.Group();
  hips.add(torso);
  box(torso, 0.5, 0.62, 0.3, fatigues, 0, 0.32, 0);
  box(torso, 0.52, 0.4, 0.32, vest, 0, 0.36, 0);
  const head = new THREE.Group();
  head.position.set(0, 0.68, 0);
  torso.add(head);
  box(head, 0.28, 0.3, 0.28, skin, 0, 0.13, 0);
  box(head, 0.34, 0.14, 0.36, mat('#46503a'), 0, 0.3, 0);
  box(head, 0.2, 0.05, 0.02, dark, 0, 0.17, 0.145);
  const arms = new THREE.Group();
  arms.position.set(0, 0.52, 0);
  torso.add(arms);
  box(arms, 0.13, 0.13, 0.42, fatigues, 0.26, -0.05, 0.18);
  box(arms, 0.13, 0.13, 0.5, fatigues, -0.18, -0.05, 0.25);
  const gunHolder = new THREE.Group();
  gunHolder.position.set(0.12, -0.04, 0.42);
  gunHolder.rotation.y = Math.PI;
  arms.add(gunHolder);
  const mkLeg = (side) => {
    const l = new THREE.Group();
    l.position.set(side * 0.13, 0, 0);
    hips.add(l);
    box(l, 0.2, 0.86, 0.22, fatigues, 0, -0.45, 0);
    box(l, 0.21, 0.1, 0.3, dark, 0, -0.87, 0.04);
    return l;
  };
  const legL = mkLeg(-1), legR = mkLeg(1);
  g.userData.parts = { hips, torso, head, arms, legL, legR, gunHolder };
  return g;
}

export function createNameTag(name, color) {
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: TX.labelTexture(name, color), depthTest: true, transparent: true }));
  sp.scale.set(2.2, 0.55, 1);
  sp.position.y = 2.25;
  return sp;
}

// ------------------------------------------------------------------ guns
const camoTex = TX.camoTexture();
export const papMaterial = new THREE.MeshStandardMaterial({ map: camoTex, emissive: '#5a1aa0', emissiveMap: camoTex, emissiveIntensity: 0.55, metalness: 0.7, roughness: 0.25 });
papMaterial.userData.gunPart = 'Pap';
export function animatePap(dt) { camoTex.offset.x += dt * 0.15; camoTex.offset.y += dt * 0.07; }

const M = {
  metal: () => mat('#33363b'),
  steel: () => mat('#6b7078'),
  black: () => mat('#1d1e21'),
  wood: () => mat('#6a4222'),
  woodLight: () => mat('#8a5a2e'),
};

/** Builds a gun pointing down -Z with its origin roughly at the grip. Returns { group, muzzle } */
const pmat = (color, metalness = 0.6, roughness = 0.35, extra = {}) => new THREE.MeshStandardMaterial({ color, metalness, roughness, ...extra });

export function createGun(id, pap = false) {
  const asset = gunModel(id, pap ? papMaterial : null);
  if (asset) return asset;
  const g = new THREE.Group();
  let muzzle = new THREE.Vector3(0, 0.05, -0.4);
  const metal = M.metal(), steel = M.steel(), black = M.black(), wood = M.wood();

  switch (id) {
    case 'm1911':
      box(g, 0.035, 0.045, 0.21, steel, 0, 0.05, -0.07);
      box(g, 0.032, 0.035, 0.2, metal, 0, 0.015, -0.065);
      box(g, 0.032, 0.11, 0.05, wood, 0, -0.04, 0.01).rotation.x = 0.25;
      muzzle.set(0, 0.05, -0.18);
      break;
    case 'python':
      box(g, 0.03, 0.04, 0.26, steel, 0, 0.055, -0.12);
      cyl(g, 0.03, 0.03, 0.06, steel, 0, 0.04, -0.03, 'z', 8);
      box(g, 0.032, 0.11, 0.05, wood, 0, -0.04, 0.02).rotation.x = 0.3;
      muzzle.set(0, 0.055, -0.26);
      break;
    case 'mp40':
    case 'mpl':
    case 'ak74u': {
      const body = id === 'ak74u' ? metal : black;
      box(g, 0.05, 0.07, 0.34, body, 0, 0.04, -0.12);
      cyl(g, 0.012, 0.012, 0.16, steel, 0, 0.05, -0.36);
      if (id === 'ak74u') {
        box(g, 0.055, 0.05, 0.14, wood, 0, 0.03, -0.22);
        const mg = box(g, 0.035, 0.18, 0.06, metal, 0, -0.06, -0.12);
        mg.rotation.x = -0.35;
      } else {
        box(g, 0.03, 0.22, 0.05, black, 0, -0.1, id === 'mp40' ? -0.18 : -0.1);
      }
      box(g, 0.03, 0.1, 0.04, black, 0, -0.04, 0.02).rotation.x = 0.25;
      box(g, 0.012, 0.03, 0.22, steel, 0.02, 0.05, 0.15);
      box(g, 0.012, 0.03, 0.22, steel, -0.02, 0.05, 0.15);
      muzzle.set(0, 0.05, -0.45);
      break;
    }
    case 'm14':
    case 'galil':
    case 'commando':
    case 'm16': {
      const isWood = id === 'm14';
      const body = isWood ? wood : black;
      box(g, 0.055, 0.08, 0.5, body, 0, 0.03, -0.12);
      box(g, 0.05, 0.12, 0.26, body, 0, -0.01, 0.24);
      box(g, 0.04, 0.05, 0.3, isWood ? metal : black, 0, 0.08, -0.08);
      cyl(g, 0.013, 0.013, 0.3, steel, 0, 0.06, -0.5);
      const mg = box(g, 0.035, 0.18, 0.07, metal, 0, -0.08, -0.1);
      mg.rotation.x = id === 'galil' ? -0.3 : -0.12;
      box(g, 0.03, 0.1, 0.04, black, 0, -0.06, 0.04).rotation.x = 0.25;
      if (id === 'm16') box(g, 0.02, 0.05, 0.14, black, 0, 0.13, -0.04);
      if (id === 'commando') box(g, 0.03, 0.03, 0.08, steel, 0, 0.12, -0.12);
      muzzle.set(0, 0.06, -0.66);
      break;
    }
    case 'hk21':
      box(g, 0.07, 0.11, 0.6, black, 0, 0.03, -0.15);
      box(g, 0.06, 0.13, 0.26, black, 0, -0.01, 0.26);
      cyl(g, 0.022, 0.022, 0.32, metal, 0, 0.05, -0.6);
      box(g, 0.12, 0.12, 0.12, mat('#3b4a2e'), 0.04, -0.1, -0.1);
      box(g, 0.03, 0.1, 0.04, black, 0, -0.06, 0.06).rotation.x = 0.25;
      box(g, 0.01, 0.2, 0.01, steel, 0.03, -0.08, -0.55).rotation.z = 0.3;
      box(g, 0.01, 0.2, 0.01, steel, -0.03, -0.08, -0.55).rotation.z = -0.3;
      muzzle.set(0, 0.05, -0.78);
      break;
    case 'olympia':
      cyl(g, 0.02, 0.02, 0.62, steel, 0.021, 0.05, -0.32);
      cyl(g, 0.02, 0.02, 0.62, steel, -0.021, 0.05, -0.32);
      box(g, 0.06, 0.05, 0.3, wood, 0, 0.0, -0.2);
      box(g, 0.055, 0.12, 0.34, wood, 0, -0.03, 0.18).rotation.x = 0.12;
      muzzle.set(0, 0.05, -0.64);
      break;
    case 'stakeout':
    case 'spas':
      cyl(g, 0.02, 0.02, 0.56, id === 'spas' ? black : steel, 0, 0.06, -0.3);
      cyl(g, 0.017, 0.017, 0.46, metal, 0, 0.02, -0.28);
      box(g, 0.05, 0.05, 0.12, id === 'spas' ? metal : wood, 0, 0.02, -0.34);
      box(g, 0.055, 0.08, 0.22, black, 0, 0.04, -0.02);
      if (id === 'spas') box(g, 0.014, 0.04, 0.3, steel, 0, 0.0, 0.18);
      else box(g, 0.05, 0.11, 0.3, wood, 0, -0.02, 0.2).rotation.x = 0.12;
      box(g, 0.03, 0.1, 0.04, black, 0, -0.06, 0.04).rotation.x = 0.25;
      muzzle.set(0, 0.06, -0.6);
      break;
    case 'dragunov':
      box(g, 0.05, 0.07, 0.6, wood, 0, 0.02, -0.15);
      cyl(g, 0.012, 0.012, 0.4, metal, 0, 0.05, -0.62);
      cyl(g, 0.025, 0.025, 0.24, black, 0, 0.13, -0.1);
      box(g, 0.05, 0.13, 0.3, wood, 0, -0.03, 0.27);
      box(g, 0.03, 0.16, 0.06, metal, 0, -0.08, -0.12);
      muzzle.set(0, 0.05, -0.84);
      break;
    case 'ray_gun': {
      const red = pap ? papMaterial : pmat('#b3241a', 0.55, 0.3);
      const green = pmat('#3cff5a', 0.1, 0.2, { emissive: '#2aff4a', emissiveIntensity: pap ? 0.6 : 2.2 });
      const steel = pmat('#b9bec6', 1, 0.18);
      box(g, 0.05, 0.08, 0.2, red, 0, 0.05, -0.06);
      cyl(g, 0.055, 0.04, 0.1, steel, 0, 0.06, -0.2, 'z', 12);
      for (let i = 0; i < 3; i++) cyl(g, 0.065, 0.065, 0.012, red, 0, 0.06, -0.15 - i * 0.04, 'z', 12);
      cyl(g, 0.02, 0.02, 0.18, green, 0, 0.12, -0.08);
      box(g, 0.035, 0.11, 0.05, mat('#2a2a2a'), 0, -0.04, 0.02).rotation.x = 0.25;
      muzzle.set(0, 0.06, -0.27);
      break;
    }
    case 'thundergun': {
      const shell = pmat('#3a3d44', 0.85, 0.3);
      const gold = pmat('#d4a83c', 1, 0.25);
      const metal = pmat('#62666c', 0.9, 0.3);
      const black = pmat('#1d1e21', 0.5, 0.45);
      box(g, 0.12, 0.13, 0.42, shell, 0, 0.05, -0.08);
      cyl(g, 0.11, 0.09, 0.2, metal, 0, 0.05, -0.38, 'z', 14);
      for (let i = 0; i < 3; i++) cyl(g, 0.12, 0.12, 0.02, gold, 0, 0.05, -0.32 - i * 0.06, 'z', 14);
      cyl(g, 0.07, 0.07, 0.03, pmat('#7fd4ff', 0.1, 0.2, { emissive: '#3aaaff', emissiveIntensity: 2.5 }), 0, 0.05, -0.48, 'z', 14);
      box(g, 0.04, 0.12, 0.05, black, 0, -0.06, 0.04).rotation.x = 0.25;
      box(g, 0.08, 0.1, 0.2, shell, 0, 0.03, 0.22);
      muzzle.set(0, 0.05, -0.5);
      break;
    }
    case 'knife': {
      // combat knife: bevelled clip-point blade, steel guard, rubber grip with grooves
      const sh = new THREE.Shape();
      sh.moveTo(0, -0.013); sh.lineTo(0.15, -0.015); sh.quadraticCurveTo(0.192, -0.013, 0.208, 0.004);
      sh.lineTo(0.172, 0.011); sh.lineTo(0.125, 0.014); sh.lineTo(0.06, 0.018); sh.lineTo(0, 0.018); sh.lineTo(0, -0.013);
      const bg = new THREE.ExtrudeGeometry(sh, { depth: 0.0025, bevelEnabled: true, bevelThickness: 0.0016, bevelSize: 0.0014, bevelSegments: 2, curveSegments: 6 });
      bg.translate(0, 0, -0.00125);
      bg.rotateY(Math.PI / 2);
      const blade = new THREE.Mesh(bg, new THREE.MeshStandardMaterial({ color: '#b9c0c8', metalness: 0.92, roughness: 0.26 }));
      blade.position.set(0, 0, -0.024);
      g.add(blade);
      // fuller groove and a smear of blood near the tip
      box(g, 0.0062, 0.004, 0.09, mat('#7e868e'), 0, 0.006, -0.09);
      box(g, 0.0064, 0.012, 0.045, mat('#4a0606'), 0, -0.004, -0.19);
      box(g, 0.012, 0.064, 0.01, M.steel(), 0, 0.002, -0.02);
      box(g, 0.024, 0.032, 0.105, mat('#1d1a17'), 0, 0.0, 0.035);
      for (let i = 0; i < 5; i++) box(g, 0.026, 0.004, 0.006, mat('#0e0c0a'), 0, 0.016, -0.005 + i * 0.018);
      box(g, 0.027, 0.036, 0.012, M.steel(), 0, 0.0, 0.092);
      muzzle.set(0, 0, -0.23);
      break;
    }
    default:
      box(g, 0.05, 0.08, 0.4, metal, 0, 0.03, -0.1);
      box(g, 0.03, 0.1, 0.04, black, 0, -0.06, 0.04);
  }

  if (pap && id !== 'ray_gun' && id !== 'knife') {
    g.traverse((o) => { if (o.isMesh && !(o.material.emissiveIntensity > 1)) o.material = papMaterial; });
  }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return { group: g, muzzle, top: id === 'ray_gun' ? 0.13 : id === 'thundergun' ? 0.12 : 0.08 };
}

let _flashTex = null, _flashSide = null;
export function flashTex() {
  if (!_flashTex) {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const x = c.getContext('2d');
    x.translate(64, 64);
    for (let i = 0; i < 7; i++) {
      x.rotate((Math.PI * 2) / 7 + (i % 2) * 0.2);
      const g = x.createLinearGradient(0, 0, 0, -62);
      g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = g;
      x.beginPath(); x.moveTo(-7, 0); x.lineTo(0, -(40 + (i % 3) * 10)); x.lineTo(7, 0); x.fill();
    }
    const r = x.createRadialGradient(0, 0, 0, 0, 0, 34);
    r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = r; x.beginPath(); x.arc(0, 0, 34, 0, 7); x.fill();
    _flashTex = new THREE.CanvasTexture(c);
  }
  return _flashTex;
}
export function flashSideTex() {
  if (!_flashSide) {
    const c = document.createElement('canvas'); c.width = 64; c.height = 128;
    const x = c.getContext('2d');
    const g = x.createRadialGradient(32, 110, 2, 32, 80, 70);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.4, 'rgba(255,220,160,0.7)'); g.addColorStop(1, 'rgba(255,160,60,0)');
    x.fillStyle = g;
    x.beginPath(); x.moveTo(32, 128); x.quadraticCurveTo(0, 60, 32, 0); x.quadraticCurveTo(64, 60, 32, 128); x.fill();
    _flashSide = new THREE.CanvasTexture(c);
  }
  return _flashSide;
}

export function createGrenade() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.IcosahedronGeometry(0.06, 0), mat('#3c4a2a'));
  body.scale.y = 1.25;
  g.add(body);
  box(g, 0.03, 0.04, 0.03, M.steel(), 0, 0.08, 0);
  return g;
}

// ------------------------------------------------------------------ props
// Cheap fake light: an additive glow sprite instead of a real PointLight (lights are expensive).
export function glowSprite(color, size, opacity = 1) {
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: TX.glowTexture(), color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false }));
  sp.scale.setScalar(size);
  return sp;
}

export function createPerkMachine(key, perk) {
  const g = new THREE.Group();
  const col = new THREE.Color(perk.color);
  const bodyMat = new THREE.MeshStandardMaterial({ color: col.clone().multiplyScalar(0.75), metalness: 0.35, roughness: 0.32 });
  const trim = new THREE.MeshStandardMaterial({ color: '#d8d0bf', metalness: 0.8, roughness: 0.25 });
  box(g, 0.95, 2.1, 0.72, bodyMat, 0, 1.05, 0);
  box(g, 1.0, 0.12, 0.76, trim, 0, 2.16, 0);
  box(g, 1.0, 0.12, 0.76, trim, 0, 0.06, 0);
  const glow = new THREE.MeshStandardMaterial({ color: '#222', emissive: perk.color, emissiveIntensity: 0.05 });
  const strip = box(g, 0.8, 0.06, 0.02, glow, 0, 1.92, 0.37);
  const signMat = new THREE.MeshBasicMaterial({ map: TX.signTexture(perk.name, perk.color, `${perk.cost}`), color: '#444' });
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.86, 0.32), signMat);
  sign.position.set(0, 1.66, 0.365);
  g.add(sign);
  box(g, 0.4, 0.5, 0.05, mat('#111'), 0, 0.85, 0.37);
  // bottles in the window
  for (let i = 0; i < 3; i++) box(g, 0.07, 0.2, 0.07, new THREE.MeshLambertMaterial({ color: col, emissive: col, emissiveIntensity: 0.3 }), -0.12 + i * 0.12, 0.8, 0.36);
  const light = glowSprite(perk.glow, 1.7, 0);
  light.position.set(0, 1.7, 0.45);
  g.add(light);
  g.userData.setPower = (on) => {
    glow.emissiveIntensity = on ? 6 : 0.05;
    signMat.color.set(on ? '#ffffff' : '#444444');
    light.material.opacity = on ? 0.22 : 0;
  };
  return g;
}

export function createPapMachine() {
  const g = new THREE.Group();
  const body = mat('#2a2633');
  const trim = mat('#8e8a7d');
  box(g, 1.7, 1.1, 0.9, body, 0, 0.55, 0);
  box(g, 1.75, 0.1, 0.95, trim, 0, 1.12, 0);
  const rollerMat = new THREE.MeshLambertMaterial({ color: '#3a1060', emissive: '#a040ff', emissiveIntensity: 0.1 });
  const r1 = cyl(g, 0.16, 0.16, 1.4, rollerMat, 0, 1.3, -0.15, 'x', 12);
  const r2 = cyl(g, 0.16, 0.16, 1.4, rollerMat, 0, 1.3, 0.2, 'x', 12);
  box(g, 0.5, 0.9, 0.5, body, 0, 1.6, -0.25);
  const signMat = new THREE.MeshBasicMaterial({ map: TX.signTexture('PACK-A-PUNCH', '#c070ff', '5000'), color: '#444' });
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.4), signMat);
  sign.position.set(0, 0.7, 0.455);
  g.add(sign);
  const light = glowSprite(0xb050ff, 3.2, 0);
  light.position.set(0, 1.3, 0.6);
  g.add(light);
  let on = false;
  g.userData.setPower = (p) => {
    on = p;
    rollerMat.emissiveIntensity = p ? 1.6 : 0.1;
    signMat.color.set(p ? '#fff' : '#444');
    light.material.opacity = p ? 0.4 : 0;
  };
  g.userData.update = (dt, busy) => {
    if (!on) return;
    const sp = busy ? 14 : 1.5;
    r1.rotation.x += dt * sp;
    r2.rotation.x -= dt * sp;
  };
  return g;
}

export function createPowerSwitch() {
  const g = new THREE.Group();
  box(g, 0.7, 1.0, 0.18, mat('#4a4f45'), 0, 1.3, 0);
  box(g, 0.6, 0.16, 0.04, mat('#bdbd30'), 0, 1.72, 0.1);
  const lever = new THREE.Group();
  lever.position.set(0, 1.25, 0.12);
  g.add(lever);
  box(lever, 0.06, 0.4, 0.06, mat('#888'), 0, 0.2, 0);
  box(lever, 0.2, 0.08, 0.08, mat('#c22'), 0, 0.42, 0);
  lever.rotation.x = 0.9;
  const lamp = new THREE.MeshLambertMaterial({ color: '#400', emissive: '#f00', emissiveIntensity: 1 });
  box(g, 0.1, 0.1, 0.05, lamp, 0.22, 1.0, 0.1);
  g.userData.setPower = (on) => {
    lever.rotation.x = on ? -0.9 : 0.9;
    lamp.emissive.set(on ? '#0f0' : '#f00');
  };
  return g;
}

export function createTeddy() {
  const g = new THREE.Group();
  const fur = mat('#8b5a2b');
  box(g, 0.28, 0.32, 0.2, fur, 0, 0.2, 0);
  box(g, 0.24, 0.22, 0.2, fur, 0, 0.5, 0);
  box(g, 0.08, 0.08, 0.06, fur, -0.1, 0.64, 0);
  box(g, 0.08, 0.08, 0.06, fur, 0.1, 0.64, 0);
  box(g, 0.1, 0.07, 0.04, mat('#d8b48a'), 0, 0.46, 0.11);
  box(g, 0.08, 0.2, 0.08, fur, -0.19, 0.25, 0);
  box(g, 0.08, 0.2, 0.08, fur, 0.19, 0.25, 0);
  return g;
}

function questionTexture() {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 128;
  const x = c.getContext('2d');
  x.fillStyle = '#4a3018';
  x.fillRect(0, 0, 128, 128);
  x.font = '96px "Black Ops One", Impact';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.shadowColor = '#7fe7ff';
  x.shadowBlur = 18;
  x.fillStyle = '#c9f6ff';
  x.fillText('?', 64, 70);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function createMysteryBox() {
  const g = new THREE.Group();
  const wood = new THREE.MeshLambertMaterial({ map: TX.crateTexture(), color: '#b08a5a' });
  const qMat = new THREE.MeshLambertMaterial({ map: questionTexture(), emissive: '#ffffff', emissiveMap: questionTexture(), emissiveIntensity: 0.9 });
  const base = box(g, 1.6, 0.55, 0.7, wood, 0, 0.42, 0);
  // legs
  for (const [x, z] of [[-0.7, -0.28], [0.7, -0.28], [-0.7, 0.28], [0.7, 0.28]]) box(g, 0.1, 0.15, 0.1, mat('#2a1d10'), x, 0.075, z);
  const q1 = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.42), qMat);
  q1.position.set(0, 0.42, 0.352);
  g.add(q1);
  const q2 = q1.clone();
  q2.position.z = -0.352;
  q2.rotation.y = Math.PI;
  g.add(q2);
  const lid = new THREE.Group();
  lid.position.set(0, 0.7, -0.35);
  g.add(lid);
  box(lid, 1.62, 0.1, 0.72, wood, 0, 0.05, 0.35);
  const beamMat = new THREE.MeshBasicMaterial({ color: '#7fe7ff', transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.5, 30, 12, 1, true), beamMat);
  beam.position.y = 15.5;
  g.add(beam);
  const light = glowSprite(0x7fe7ff, 2.4, 0.35);
  light.position.set(0, 1.1, 0);
  g.add(light);
  g.userData = { lid, beam, light, base };
  return g;
}

// Silhouettes for chalk wall-buys, drawn relative to centre (canvas units)
export const CHALK = {
  rifle: [[[-100, -6], [60, -6], [100, -4], [100, 2], [60, 4], [40, 4], [30, 30], [18, 30], [22, 6], [-20, 6], [-26, 24], [-40, 24], [-36, 6], [-70, 8], [-100, 22], [-100, -6]]],
  smg: [[[-70, -8], [50, -8], [80, -6], [80, 0], [50, 2], [36, 2], [36, 38], [24, 38], [24, 4], [-10, 4], [-16, 22], [-28, 22], [-24, 4], [-70, 4], [-70, -8]]],
  shotgun: [[[-100, -8], [80, -8], [100, -6], [100, 2], [40, 2], [40, 8], [-10, 8], [-20, 20], [-34, 20], [-30, 6], [-70, 8], [-100, 20], [-100, -8]]],
};
