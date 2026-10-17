// Loads external assets (scanned and CC-BY Sketchfab gun models, CC0 Quaternius fallbacks, recorded sounds) and prepares them for the game.
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
// rg / lg: where the right hand's grip and the support hand's handguard are, as [y, z] in the prepared
// gun's space (measured from side renders); cut: [ymin, ymax, zmin, zmax] boxes of loose debris to remove;
// level: pitch that levels a model that was exported tilted.
export const GUN_DEFS = {
  m1911:    { file: 'Pistol_1', glb: 'sf_m1911', dir: 'guns', auto: true, len: 0.216, grip: 0.24, rg: [-0.024, 0.013] },
  python:   { file: 'Revolver_2', len: 0.29, grip: 0.18, rg: [-0.037, 0.02] },
  olympia:  { file: 'Shotgun_SawedOff', glb: 'sf_olympia', dir: 'guns', auto: true, len: 1.05, grip: 0.3, rg: [-0.015, -0.013], lg: [0.004, -0.317] },
  stakeout: { file: 'Shotgun_2', glb: 'sf_stakeout', dir: 'guns', auto: true, len: 1.0, grip: 0.28, rg: [-0.016, -0.013], lg: [-0.009, -0.36] },
  spas:     { file: 'Shotgun_1', glb: 'sf_spas', dir: 'guns', auto: true, len: 1.0, grip: 0.28, rg: [-0.085, 0.02], lg: [-0.044, -0.34], cut: [[-0.15, -0.075, -0.075, -0.045]] },
  m14:      { file: 'AssaultRifle_2', glb: 'sf_m14', dir: 'guns', auto: true, len: 1.1, grip: 0.33, rg: [-0.04, 0.075], lg: [-0.03, -0.2] },
  mp40:     { file: 'SubmachineGun_1', glb: 'sf_mp40', dir: 'guns', auto: true, len: 0.83, grip: 0.33, rg: [-0.067, 0], lg: [-0.015, -0.243] },
  mpl:      { file: 'SubmachineGun_4', glb: 'sf_mpl', dir: 'guns', auto: true, len: 0.36, grip: 0.17, rg: [-0.061, 0.031], lg: [-0.02, -0.13] },
  ak74u:    { file: 'AssaultRifle_1', glb: 'sf_ak', dir: 'guns', auto: true, drop: ['platform_plank_Planks_0'], lowCut: 0.05, pitch: 0.236, len: 0.94, grip: 0.3, rg: [-0.089, 0], lg: [-0.026, -0.287], cut: [[-0.2, -0.14, -0.28, -0.25]] },
  m16:      { file: 'AssaultRifle2_1', glb: 'sf_m16', dir: 'guns', auto: true, len: 1.0, grip: 0.37, rg: [-0.133, 0.039], lg: [-0.048, -0.287] },
  galil:    { file: 'AssaultRifle_4', len: 0.98, grip: 0.36, rg: [-0.089, 0.046], lg: [-0.019, -0.287] },
  commando: { file: 'AssaultRifle2_4', glb: 'sf_commando', dir: 'guns', auto: true, drop: ['bullets_bullets_0', 'gps_gps_0', 'acog_optic001_0'], adsZ: 0.2, len: 0.84, grip: 0.33, rg: [-0.113, 0.024], lg: [-0.039, -0.287] },
  hk21:     { file: 'AssaultRifle_5', glb: 'sf_hk21', dir: 'guns', auto: true, level: -0.216, topRange: [0, 0.28], adsX: 0.1, len: 1.15, grip: 0.31, rg: [-0.089, 0.03], lg: [-0.036, -0.296], cut: [[-0.35, -0.045, -0.6, -0.48]] },
  dragunov: { file: 'SniperRifle_6', glb: 'bolt_rifle', dir: 'guns', len: 1.18, grip: 0.36, rg: [-0.033, 0.139], lg: [-0.019, -0.2], cut: [[-0.1, -0.074, -0.03, 0.05]] },
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

// Find which way a downloaded gun points: the long horizontal axis, and of its two ends the
// thinner one (the barrel; the stock and grip end is taller). Returns the yaw that turns it to -Z.
function autoYaw(obj) {
  obj.updateMatrixWorld(true);
  const pts = [];
  const v = new THREE.Vector3();
  obj.traverse((o) => {
    if (!o.isMesh) return;
    const pos = o.geometry.attributes.position;
    const step = Math.max(1, Math.floor(pos.count / 4000));
    for (let i = 0; i < pos.count; i += step) pts.push(v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld).clone());
  });
  const box = new THREE.Box3().setFromPoints(pts);
  const size = box.getSize(new THREE.Vector3());
  const axis = size.x >= size.z ? 'x' : 'z';
  const lo = box.min[axis], len = size[axis];
  const ext = (a, b) => { let mn = Infinity, mx = -Infinity; for (const p of pts) { const t = (p[axis] - lo) / len; if (t >= a && t <= b) { mn = Math.min(mn, p.y); mx = Math.max(mx, p.y); } } return mx - mn; };
  const barrelAtMax = ext(0.88, 1) < ext(0, 0.12);
  if (axis === 'x') return barrelAtMax ? Math.PI / 2 : -Math.PI / 2;
  return barrelAtMax ? Math.PI : 0;
}

// Remove loose pieces lying on a display stand: connected parts that never rise above `h` (model units).
function cutLow(obj, h) {
  obj.updateMatrixWorld(true);
  obj.traverse((o) => {
    if (!o.isMesh || !o.geometry.index) return;
    const geo = o.geometry, pos = geo.attributes.position, idx = geo.index, mw = o.matrixWorld;
    const parent = new Int32Array(pos.count).map((_, i) => i);
    const find = (x) => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
    for (let i = 0; i < idx.count; i += 3) { const r0 = find(idx.getX(i)); parent[find(idx.getX(i + 1))] = r0; parent[find(idx.getX(i + 2))] = r0; }
    const top = new Map(), v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) { const r = find(i); v.fromBufferAttribute(pos, i).applyMatrix4(mw); top.set(r, Math.max(top.get(r) ?? -Infinity, v.y)); }
    const out = [];
    for (let i = 0; i < idx.count; i += 3) if (top.get(find(idx.getX(i))) > h) out.push(idx.getX(i), idx.getX(i + 1), idx.getX(i + 2));
    const cut = geo.clone();
    cut.setIndex(out);
    const ng = cut.toNonIndexed();
    ng.computeBoundingBox(); ng.computeBoundingSphere();
    o.geometry = ng;
  });
}

// Height of the sight line: the top of the gun, or only of part of it when something tall (a top
// magazine) sits over the receiver. `topRange` is a fraction of the length from the rear.
function gunTop(obj, def, box) {
  if (!def.topRange) return box.max.y;
  const [a, b] = def.topRange, len = box.max.z - box.min.z;
  let top = -Infinity;
  const v = new THREE.Vector3();
  obj.traverse((o) => {
    if (!o.isMesh) return;
    const pos = o.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
      const t = (box.max.z - v.z) / len;
      if (t >= a && t <= b) top = Math.max(top, v.y);
    }
  });
  return top > -Infinity ? top : box.max.y;
}

// Some downloads are skinned (rigged for an animation). Bake the pose into a plain mesh so the
// gun scales and moves like any other object.
function unskin(obj) {
  obj.updateMatrixWorld(true);
  const list = [];
  obj.traverse((o) => { if (o.isSkinnedMesh) list.push(o); });
  for (const o of list) {
    o.skeleton.update();
    const geo = o.geometry.clone();
    // compressed (quantised) attributes cannot hold the posed values: give them float storage
    const src = geo.attributes.position, srcN = geo.attributes.normal;
    const pos = new THREE.Float32BufferAttribute(new Float32Array(src.count * 3), 3);
    const nrm = srcN ? new THREE.Float32BufferAttribute(new Float32Array(srcN.count * 3), 3) : null;
    const si = geo.attributes.skinIndex, sw = geo.attributes.skinWeight;
    const v = new THREE.Vector3(), m = new THREE.Matrix4(), bm = new THREE.Matrix4(), nm = new THREE.Matrix3();
    const bones = o.skeleton.boneMatrices;
    for (let i = 0; i < pos.count; i++) {
      o.getVertexPosition(i, v);
      pos.setXYZ(i, v.x, v.y, v.z);
      if (!nrm) continue;
      // the vertex's blended bone matrix, for the normal
      const e = m.elements.fill(0);
      for (let k = 0; k < 4; k++) {
        const w = sw.getComponent(i, k);
        if (!w) continue;
        bm.fromArray(bones, si.getComponent(i, k) * 16);
        for (let j = 0; j < 16; j++) e[j] += bm.elements[j] * w;
      }
      m.premultiply(o.bindMatrixInverse).multiply(o.bindMatrix);
      nm.getNormalMatrix(m);
      v.fromBufferAttribute(srcN, i).applyMatrix3(nm).normalize();
      nrm.setXYZ(i, v.x, v.y, v.z);
    }
    geo.setAttribute('position', pos);
    if (nrm) geo.setAttribute('normal', nrm);
    geo.deleteAttribute('skinIndex');
    geo.deleteAttribute('skinWeight');
    geo.computeBoundingBox(); geo.computeBoundingSphere();
    const mesh = new THREE.Mesh(geo, o.material);
    mesh.name = o.name;
    mesh.position.copy(o.position); mesh.quaternion.copy(o.quaternion); mesh.scale.copy(o.scale);
    o.parent.add(mesh);
    o.parent.remove(o);
  }
}

// Remove triangles whose centre falls inside any [ymin, ymax, zmin, zmax] box (gun space).
function cutBoxes(obj, boxes) {
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  obj.traverse((o) => {
    if (!o.isMesh) return;
    const geo = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    const pos = geo.attributes.position, mw = o.matrixWorld;
    const keep = [];
    for (let i = 0; i < pos.count; i += 3) {
      a.fromBufferAttribute(pos, i).applyMatrix4(mw);
      b.fromBufferAttribute(pos, i + 1).applyMatrix4(mw);
      c.fromBufferAttribute(pos, i + 2).applyMatrix4(mw);
      const y = (a.y + b.y + c.y) / 3, z = (a.z + b.z + c.z) / 3;
      if (!boxes.some(([y0, y1, z0, z1]) => y > y0 && y < y1 && z > z0 && z < z1)) keep.push(i);
    }
    if (keep.length * 3 === pos.count) return;
    const out = new THREE.BufferGeometry();
    for (const [name, attr] of Object.entries(geo.attributes)) {
      const n = attr.itemSize, arr = new Float32Array(keep.length * 3 * n);
      let j = 0;
      for (const i of keep) for (let v = 0; v < 3; v++) for (let k = 0; k < n; k++) arr[j++] = attr.getComponent(i + v, k);
      out.setAttribute(name, new THREE.BufferAttribute(arr, n));
    }
    out.computeBoundingBox(); out.computeBoundingSphere();
    o.geometry = out;
  });
}

function prepare(obj, def) {
  if (def.crop === 'p38') cropP38(obj);
  if (def.keep || def.drop) {
    // drop the display extras that ship with the model (loose rounds, ammo boxes, stands…)
    const drop = [];
    obj.traverse((o) => { if (o.isMesh && (def.keep ? !def.keep.includes(o.name) : def.drop.includes(o.name))) drop.push(o); });
    for (const o of drop) o.parent.remove(o);
  }
  if (def.lowCut) cutLow(obj, def.lowCut);
  if (def.pitch) {
    // a model propped up at an angle: level it before working out where the barrel points
    const tilt = new THREE.Group();
    tilt.rotation.x = def.pitch;
    for (const c of [...obj.children]) tilt.add(c);
    obj.add(tilt);
  }
  obj.traverse((o) => {
    if (!o.isMesh) return;
    if (def.glb) {
      // scanned models are clean and keep their own PBR textures (the AK's varnish is toned down a bit)
      o.castShadow = true;
      // cut-out (alpha-tested) rather than blended, so parts sort correctly and nothing glows through
      if (o.material.transparent) { o.material = o.material.clone(); o.material.transparent = false; o.material.alphaTest = 0.5; o.material.depthWrite = true; }
      return;
    }
    o.geometry = cleanGeometry(o.geometry);
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    const repl = mats.map((m) => material(m.name));
    o.material = Array.isArray(o.material) ? repl : repl[0];
    o.castShadow = true;
  });
  // Models point down +X. Rotate so the barrel points down -Z (downloaded models: detect the barrel).
  const holder = new THREE.Group();
  obj.rotation.y = def.auto ? autoYaw(obj) + (def.flip ? Math.PI : 0) : def.flip ? -Math.PI / 2 : Math.PI / 2;
  if (def.level) obj.rotation.x = def.level; // (Euler XYZ: applied after the yaw, so it pitches the gun about its own side axis)
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
  const oy = gunTop(obj, def, box) - 0.06;
  obj.position.set(-ox, -oy, -oz);
  holder.updateMatrixWorld(true);
  if (def.cut) cutBoxes(obj, def.cut);
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
  // centre the gun on its bore (not its bounding box, which side parts can skew) so the sights
  // line up when aiming and both hands meet the gun where they should
  if (def.glb && Math.abs(muzzle.x) > 0.002) { obj.position.x -= muzzle.x; muzzle.x = 0; holder.updateMatrixWorld(true); }
  return { group: holder, muzzle, top: gunTop(obj, def, box) };
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
          src = gl.loadAsync(`/assets/${def.dir || 'props'}/${def.glb}.glb`).then((g) => { unskin(g.scene); return g.scene; });
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
