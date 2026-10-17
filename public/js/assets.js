// Loads external assets (CC0 gun models by Quaternius, recorded sounds) and prepares them for the game.
import * as THREE from 'three';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { objectUV, wearDetail, pbrSurface } from './pbr.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

// Physically based materials for the gun pack's material names.
const PALETTE = {
  Black:       { color: '#232528', metalness: 0.6, roughness: 0.45 },
  Black2:      { color: '#1b1c1f', metalness: 0.4, roughness: 0.55 },
  DarkMetal:   { color: '#3e4044', metalness: 0.85, roughness: 0.32 },
  Metal:       { color: '#62666c', metalness: 0.9, roughness: 0.28 },
  LightMetal:  { color: '#5e6268', metalness: 0.95, roughness: 0.36 },
  LightMetal2: { color: '#686c72', metalness: 1.0, roughness: 0.34 },
  Grey:        { color: '#4f5357', metalness: 0.15, roughness: 0.6 },
  Wood:        { color: '#9b6a43', metalness: 0.0, roughness: 0.55 },
  DarkWood:    { color: '#6a4229', metalness: 0.0, roughness: 0.5 },
  Green:       { color: '#5d6a4a', metalness: 0.05, roughness: 0.65 },
  Glass:       { color: '#16305a', metalness: 0.3, roughness: 0.05, emissive: '#0a1a40' },
  Main:        { color: '#3a3f47', metalness: 0.3, roughness: 0.5 },
  MainDark:    { color: '#25292f', metalness: 0.35, roughness: 0.5 },
  MainLight:   { color: '#535b66', metalness: 0.3, roughness: 0.45 },
};

const materials = {};
function material(name) {
  if (!materials[name]) {
    const p = PALETTE[name] || PALETTE.Black;
    materials[name] = new THREE.MeshStandardMaterial({ ...p, flatShading: false });
    materials[name].userData.gunPart = name;
  }
  return materials[name];
}

// Which model each weapon uses, its real-world length (m) and where the grip sits (fraction from the rear).
export const GUN_DEFS = {
  m1911:    { file: 'Pistol_1', glb: 'service_pistol', crop: 'p38', len: 0.215, grip: 0.3 },
  python:   { file: 'Revolver_2', len: 0.29, grip: 0.18 },
  olympia:  { file: 'Shotgun_SawedOff', len: 0.66, grip: 0.24 },
  stakeout: { file: 'Shotgun_2', len: 1.0, grip: 0.3 },
  spas:     { file: 'Shotgun_1', len: 0.98, grip: 0.3 },
  m14:      { file: 'AssaultRifle_2', len: 1.02, grip: 0.36 },
  mp40:     { file: 'SubmachineGun_1', len: 0.5, grip: 0.3 },
  mpl:      { file: 'SubmachineGun_4', len: 0.46, grip: 0.3 },
  ak74u:    { file: 'AssaultRifle_1', glb: 'ak', dir: 'guns', keep: ['AK'], len: 0.86, grip: 0.36 },
  m16:      { file: 'AssaultRifle2_1', len: 0.98, grip: 0.38 },
  galil:    { file: 'AssaultRifle_4', len: 0.98, grip: 0.36 },
  commando: { file: 'AssaultRifle2_4', len: 0.74, grip: 0.4 },
  hk21:     { file: 'AssaultRifle_5', len: 1.05, grip: 0.36 },
  dragunov: { file: 'SniperRifle_6', glb: 'bolt_rifle', dir: 'guns', len: 1.18, grip: 0.36 },
  knife:    { file: 'Bayonet', len: 0.3, grip: 0.2 },
};

const prepared = new Map(); // id -> { group, muzzle, top }
let bipod = null;

// Drop zero-area triangles: their normals come out as NaN, which turns into black blocks once bloom spreads them.
function cleanGeometry(geo) {
  const pos = geo.attributes.position;
  const keep = [];
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const groups = geo.groups.length ? geo.groups : [{ start: 0, count: pos.count, materialIndex: 0 }];
  const newGroups = [];
  for (const g of groups) {
    const start = keep.length;
    for (let i = g.start; i < g.start + g.count; i += 3) {
      a.fromBufferAttribute(pos, i); b.fromBufferAttribute(pos, i + 1); c.fromBufferAttribute(pos, i + 2);
      if (b.sub(a).cross(c.sub(a)).lengthSq() > 1e-14) keep.push(i, i + 1, i + 2);
    }
    newGroups.push({ start, count: keep.length - start, materialIndex: g.materialIndex });
  }
  const out = new THREE.BufferGeometry();
  for (const name of Object.keys(geo.attributes)) {
    const src = geo.attributes[name];
    const arr = new src.array.constructor(keep.length * src.itemSize);
    keep.forEach((idx, j) => { for (let k = 0; k < src.itemSize; k++) arr[j * src.itemSize + k] = src.array[idx * src.itemSize + k]; });
    out.setAttribute(name, new THREE.BufferAttribute(arr, src.itemSize));
  }
  if (geo.groups.length) for (const g of newGroups) out.addGroup(g.start, g.count, g.materialIndex);
  out.computeVertexNormals();
  // any normal that is still invalid gets a safe default
  const n = out.attributes.normal.array;
  for (let i = 0; i < n.length; i += 3) {
    const l = Math.hypot(n[i], n[i + 1], n[i + 2]);
    if (!(l > 0.5)) { n[i] = 0; n[i + 1] = 1; n[i + 2] = 0; }
  }
  return out;
}

// Gives a prepared gun its own materials with worn-metal detail (or real wood grain) mapped in
// the gun's own space; `s` converts model units to metres.
function texturise(obj, s) {
  const wear = wearDetail();
  const wood = pbrSurface('woodOld');
  const cache = new Map();
  obj.traverse((o) => {
    if (!o.isMesh) return;
    const conv = (m) => {
      if (cache.has(m)) return cache.get(m);
      const part = m.userData.gunPart;
      if (part === 'Glass') { cache.set(m, m); return m; }
      const c = m.clone();
      c.userData.gunPart = part;
      if (part === 'Wood' || part === 'DarkWood') {
        c.map = wood.map; c.normalMap = wood.normalMap; c.roughness = 0.6;
        c.color.multiplyScalar(1.6);
        objectUV(c, s / 0.35);
      } else {
        c.normalMap = wear.normalMap; c.roughnessMap = wear.roughnessMap;
        c.normalScale = new THREE.Vector2(0.45, 0.45);
        c.roughness = Math.min(1, c.roughness * 1.25);
        objectUV(c, s / 0.09);
      }
      cache.set(m, c);
      return c;
    };
    o.material = Array.isArray(o.material) ? o.material.map(conv) : conv(o.material);
  });
}

// The scanned pistol file is a display set (two pistols, magazines, a round): keep only the
// wood-grip pistol by cutting triangles by position, then drop the loose cartridge.
function cropP38(obj) {
  obj.updateMatrixWorld(true);
  obj.traverse((o) => {
    if (!o.isMesh || !o.geometry.index) return;
    const geo = o.geometry, pos = geo.attributes.position, idx = geo.index, mw = o.matrixWorld;
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
    const keep = [];
    for (let i = 0; i < idx.count; i += 3) {
      a.fromBufferAttribute(pos, idx.getX(i)).applyMatrix4(mw);
      b.fromBufferAttribute(pos, idx.getX(i + 1)).applyMatrix4(mw);
      c.fromBufferAttribute(pos, idx.getX(i + 2)).applyMatrix4(mw);
      const cx = (a.x + b.x + c.x) / 3, cy = (a.y + b.y + c.y) / 3;
      const cartridge = cx > 0.038 && cx < 0.085 && cy < -0.012;
      if (cy < 0.095 && cx > -0.065 && !cartridge) keep.push(idx.getX(i), idx.getX(i + 1), idx.getX(i + 2));
    }
    // connected pieces; the cartridge is a small piece sitting lowest of all
    const parent = new Int32Array(pos.count).map((_, i) => i);
    const find = (x) => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
    for (let i = 0; i < keep.length; i += 3) { const r0 = find(keep[i]); parent[find(keep[i + 1])] = r0; parent[find(keep[i + 2])] = r0; }
    const boxes = new Map();
    for (const vi of keep) {
      const r = find(vi);
      a.fromBufferAttribute(pos, vi).applyMatrix4(mw);
      if (!boxes.has(r)) boxes.set(r, new THREE.Box3());
      boxes.get(r).expandByPoint(a);
    }
    const drop = new Set();
    for (const [r, bx] of boxes) { const sz = bx.getSize(b); if (Math.max(sz.x, sz.y, sz.z) < 0.04 && bx.min.y < -0.045) drop.add(r); }
    const out = [];
    for (let i = 0; i < keep.length; i += 3) if (!drop.has(find(keep[i]))) out.push(keep[i], keep[i + 1], keep[i + 2]);
    const cut = geo.clone();
    cut.setIndex(out);
    // only the kept triangles' vertices, so bounds (used to place the gun in the hands) are right
    const ng = cut.toNonIndexed();
    ng.computeBoundingBox(); ng.computeBoundingSphere();
    o.geometry = ng;
  });
}

function prepare(obj, def) {
  if (def.crop === 'p38') cropP38(obj);
  if (def.keep) {
    // drop the display extras that ship with the model (loose rounds, ammo boxes…)
    const drop = [];
    obj.traverse((o) => { if (o.isMesh && !def.keep.includes(o.name)) drop.push(o); });
    for (const o of drop) o.parent.remove(o);
  }
  obj.traverse((o) => {
    if (!o.isMesh) return;
    if (def.glb) {
      // scanned models are clean and keep their own PBR textures (the AK's varnish is toned down a bit)
      o.castShadow = true;
      if (def.glb === 'ak' && !o.material.userData.toned) { o.material = o.material.clone(); o.material.color.multiplyScalar(0.62); o.material.userData.toned = true; }
      return;
    }
    o.geometry = cleanGeometry(o.geometry);
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    const repl = mats.map((m) => material(m.name));
    o.material = Array.isArray(o.material) ? repl : repl[0];
    o.castShadow = true;
  });
  // Models point down +X. Rotate so the barrel points down -Z.
  const holder = new THREE.Group();
  obj.rotation.y = def.flip ? -Math.PI / 2 : Math.PI / 2;
  holder.add(obj);
  holder.updateMatrixWorld(true);
  let box = new THREE.Box3().setFromObject(holder);
  const size = box.getSize(new THREE.Vector3());
  const s = def.len / size.z;
  obj.scale.setScalar(s);
  if (!def.glb) texturise(obj, s);
  holder.updateMatrixWorld(true);
  box = new THREE.Box3().setFromObject(holder);
  // origin: grip point along the gun, top of the gun slightly above origin
  const rearZ = box.max.z, frontZ = box.min.z;
  const ox = (box.min.x + box.max.x) / 2;
  const oz = rearZ - def.grip * def.len;
  const oy = box.max.y - 0.06;
  obj.position.set(-ox, -oy, -oz);
  holder.updateMatrixWorld(true);
  box = new THREE.Box3().setFromObject(holder);
  // muzzle: centre of the vertices at the very front of the gun
  const front = box.min.z;
  const pts = new THREE.Vector3();
  let n = 0;
  const v = new THREE.Vector3();
  obj.traverse((o) => {
    if (!o.isMesh) return;
    const pos = o.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
      if (v.z < front + def.len * 0.02) { pts.add(v); n++; }
    }
  });
  const muzzle = n ? pts.divideScalar(n) : new THREE.Vector3(0, 0.03, front);
  muzzle.z = front - 0.01;
  return { group: holder, muzzle, top: box.max.y };
}

export async function loadGunModels(onProgress) {
  const loader = new OBJLoader();
  const ids = Object.keys(GUN_DEFS);
  let done = 0;
  const cacheByFile = new Map();
  await Promise.all(ids.map(async (id) => {
    const def = GUN_DEFS[id];
    try {
      const key = def.glb || def.file;
      let src = cacheByFile.get(key);
      if (!src) {
        if (def.glb) {
          const gl = new GLTFLoader();
          gl.setMeshoptDecoder(MeshoptDecoder);
          src = gl.loadAsync(`/assets/${def.dir || 'props'}/${def.glb}.glb`).then((g) => g.scene);
        } else src = loader.loadAsync(`/assets/guns/${def.file}.obj`);
        cacheByFile.set(key, src);
      }
      const obj = (await src).clone(true);
      prepared.set(id, prepare(obj, def));
    } catch (e) {
      console.warn('gun model failed', id, e);
    }
    done++;
    if (onProgress) onProgress(done / ids.length);
  }));
  try {
    const b = await loader.loadAsync('/assets/guns/Bipod.obj');
    bipod = prepare(b, { len: 0.12, grip: 0.5 }).group;
  } catch { /* optional */ }
}

/** Returns a fresh clone of a prepared gun model, or null if not loaded. */
export function gunModel(id, papMat) {
  const p = prepared.get(id);
  if (!p) return null;
  const group = p.group.clone(true);
  if (GUN_DEFS[id].bipod && bipod) {
    const b = bipod.clone(true);
    b.scale.setScalar(2.2);
    b.position.set(0, -0.06, p.muzzle.z + 0.28);
    b.rotation.x = -0.4;
    group.add(b);
  }
  if (papMat) {
    group.traverse((o) => {
      if (!o.isMesh) return;
      const swap = (m) => (m.userData.gunPart === 'Glass' ? m : papMat);
      o.material = Array.isArray(o.material) ? o.material.map(swap) : swap(o.material);
    });
  }
  return { group, muzzle: p.muzzle.clone(), top: p.top };
}

// ------------------------------------------------------------------ sounds
const SOUND_FILES = {};
export function registerSounds(map) { Object.assign(SOUND_FILES, map); }

export async function loadSounds(ctx, onProgress) {
  const out = {};
  const entries = Object.entries(SOUND_FILES);
  let done = 0;
  await Promise.all(entries.map(async ([key, urls]) => {
    const list = Array.isArray(urls) ? urls : [urls];
    out[key] = [];
    for (const url of list) {
      try {
        const buf = await (await fetch(url)).arrayBuffer();
        out[key].push(await ctx.decodeAudioData(buf));
      } catch (e) { console.warn('sound failed', url, e); }
    }
    done++;
    if (onProgress) onProgress(done / entries.length);
  }));
  return out;
}
