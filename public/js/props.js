// Map props (furniture, machines, cars…). Each kind+size is one merged vertex-coloured geometry,
// drawn with a single InstancedMesh, so a map full of props costs only a few draw calls.
import * as THREE from 'three';
import { build } from './characters.js';

const propMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0.15 });
const glowMats = {
  orange: new THREE.MeshStandardMaterial({ color: '#000', emissive: '#ff6a10', emissiveIntensity: 5 }),
  white: new THREE.MeshStandardMaterial({ color: '#000', emissive: '#e8f4ff', emissiveIntensity: 3 }),
  green: new THREE.MeshStandardMaterial({ color: '#000', emissive: '#4aff7a', emissiveIntensity: 2.5 }),
  blue: new THREE.MeshStandardMaterial({ color: '#000', emissive: '#4aa8ff', emissiveIntensity: 2.5 }),
  red: new THREE.MeshStandardMaterial({ color: '#000', emissive: '#ff3030', emissiveIntensity: 3 }),
};

const r = (s, c, p, extra = {}) => ({ k: 'r', s, c, p, r: 0.03, ...extra });
const b = (s, c, p, extra = {}) => ({ s, c, p, ...extra });
const cyl = (rad, h, c, p) => ({ k: 'c', s: [rad, rad, h], c, p });

// Each builder gets the footprint (w, d in metres) and returns { items, glow?: [items, matKey] }
const KINDS = {
  sandbags: (w, d) => {
    const items = [];
    for (let row = 0; row < 3; row++)
      for (let i = 0; i < 3; i++) items.push(r([w / 3 + 0.08, 0.3, d * 0.7], i % 2 ? '#8a7d5c' : '#7d7052', [-w / 3 + i * w / 3 + (row % 2) * 0.12 - 0.06, 0.16 + row * 0.3, 0], { r: 0.12, v: 0.08 }));
    return { items };
  },
  barrel: () => ({ items: [cyl(0.36, 0.95, '#5a2f22', [0, 0.47, 0]), cyl(0.37, 0.05, '#3a1f16', [0, 0.25, 0]), cyl(0.37, 0.05, '#3a1f16', [0, 0.7, 0]), cyl(0.3, 0.02, '#2a1510', [0, 0.96, 0])] }),
  table: (w, d) => ({ items: [b([w * 0.95, 0.06, d * 0.9], '#6a4a2a', [0, 0.78, 0]), ...[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz]) => b([0.06, 0.76, 0.06], '#3a2a18', [sx * (w * 0.43), 0.38, sz * (d * 0.4)]))] }),
  labtable: (w, d) => ({
    items: [b([w * 0.95, 0.06, d * 0.85], '#d8dde2', [0, 0.85, 0]), b([w * 0.9, 0.8, d * 0.8], '#8a9098', [0, 0.42, 0]),
      cyl(0.05, 0.25, '#9fd8ff', [-w * 0.2, 1.0, 0]), cyl(0.04, 0.18, '#ff9fd8', [w * 0.1, 0.97, 0.1]), b([0.3, 0.2, 0.25], '#333', [w * 0.3, 0.98, -0.1])],
  }),
  counter: (w, d) => ({ items: [b([w, 0.95, d * 0.85], '#c8c0b0', [0, 0.47, 0]), b([w + 0.04, 0.06, d * 0.9], '#3a3a40', [0, 0.97, 0]), b([w * 0.98, 0.1, d * 0.6], '#2a2826', [0, 0.06, 0])] }),
  bed: (w, d) => ({ items: [b([w * 0.9, 0.08, d * 0.95], '#7a7f84', [0, 0.45, 0]), r([w * 0.85, 0.16, d * 0.9], '#d8d4c8', [0, 0.56, 0], { v: 0.04 }), r([w * 0.6, 0.1, 0.3], '#f0ece0', [0, 0.67, -d * 0.35]), b([w * 0.9, 0.6, 0.05], '#6a6f74', [0, 0.5, -d * 0.47]), ...[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz]) => b([0.05, 0.45, 0.05], '#5a5f64', [sx * w * 0.42, 0.22, sz * d * 0.45])), b([0.4, 0.02, 0.5], '#5a0a0a', [0.1, 0.65, 0.2])] }),
  bench: (w, d) => ({ items: [b([w * 0.95, 0.06, d * 0.5], '#6a4a2a', [0, 0.45, 0]), b([w * 0.95, 0.4, 0.06], '#6a4a2a', [0, 0.7, -d * 0.22]), b([0.08, 0.45, d * 0.45], '#333', [-w * 0.4, 0.22, 0]), b([0.08, 0.45, d * 0.45], '#333', [w * 0.4, 0.22, 0])] }),
  pillar: () => ({ items: [b([0.7, 4, 0.7], '#6a6862', [0, 2, 0]), b([0.85, 0.3, 0.85], '#55534e', [0, 0.15, 0]), b([0.85, 0.3, 0.85], '#55534e', [0, 3.85, 0]), b([0.72, 0.4, 0.72], '#b8a020', [0, 1.0, 0]), b([0.72, 0.15, 0.72], '#1a1a1a', [0, 1.2, 0])] }),
  shelf: (w, d) => {
    const items = [b([w * 0.9, 2.6, 0.05], '#5a5f66', [0, 1.3, -d * 0.0])];
    for (const y of [0.1, 0.7, 1.3, 1.9, 2.5]) items.push(b([w * 0.95, 0.05, d * 0.95], '#6a7078', [0, y, 0]));
    for (let i = 0; i < Math.round(d * 3); i++) for (const y of [0.35, 0.95, 1.55, 2.15]) items.push(r([w * 0.35, 0.4, 0.28], ['#8a6438', '#5a6a8a', '#8a3a3a', '#6a8a4a'][(i + Math.round(y * 3)) % 4], [((i * 7 + y * 10) % 3 - 1) * w * 0.2, y + 0.06, -d * 0.45 + 0.2 + i * 0.33], { r: 0.02 }));
    return { items };
  },
  machine: (w, d) => ({
    items: [r([w * 0.9, 2.2, d * 0.9], '#4a5560', [0, 1.1, 0], { r: 0.06 }), b([w * 0.95, 0.15, d * 0.95], '#2a2e33', [0, 0.07, 0]), cyl(0.4, w * 0.95, '#7a8088', [0, 1.6, 0]),
      b([0.5, 0.35, 0.05], '#1a1d20', [0, 1.2, d * 0.46]), b([0.08, 1.4, 0.08], '#b8a020', [w * 0.44, 0.9, d * 0.44]), cyl(0.12, 1.2, '#5a6068', [-w * 0.3, 2.6, -d * 0.2])],
    glow: [[b([0.4, 0.06, 0.02], '#fff', [0, 1.3, d * 0.48]), b([0.06, 0.06, 0.02], '#fff', [-0.15, 1.1, d * 0.48])], 'green'],
  }),
  furnace: (w, d) => ({
    items: [b([w, 3.2, d * 0.95], '#3a2a24', [0, 1.6, 0]), b([w * 0.9, 0.3, d], '#2a1e18', [0, 3.3, 0]), cyl(0.35, 1.2, '#2a2420', [w * 0.25, 3.9, 0]), b([w * 0.6, 0.9, 0.1], '#1a1210', [0, 0.9, d * 0.48])],
    glow: [[b([w * 0.5, 0.7, 0.04], '#fff', [0, 0.9, d * 0.5])], 'orange'],
  }),
  tank: () => ({ items: [cyl(0.45, 2.6, '#7a8a90', [0, 1.3, 0]), cyl(0.47, 0.1, '#4a5458', [0, 0.05, 0]), cyl(0.1, 0.5, '#5a6468', [0, 2.8, 0])], glow: [[b([0.06, 1.6, 0.02], '#fff', [0, 1.4, 0.46])], 'green'] }),
  radio: () => ({ items: [b([0.9, 1.4, 0.6], '#4a5040', [0, 0.7, 0]), b([0.7, 0.4, 0.05], '#2a2e26', [0, 1.1, 0.3]), cyl(0.06, 0.08, '#ddd', [-0.2, 0.7, 0.3]), cyl(0.06, 0.08, '#ddd', [0.2, 0.7, 0.3]), b([0.02, 1.2, 0.02], '#888', [0.35, 2.0, 0])], glow: [[b([0.5, 0.2, 0.02], '#fff', [0, 1.1, 0.33])], 'orange'] }),
  curtain: (w, d) => ({ items: [b([0.05, 2.2, d * 0.95], '#a8c0b0', [0, 1.3, 0]), b([0.08, 0.05, d], '#888', [0, 2.42, 0]), b([0.06, 0.2, d * 0.95], '#7a8f80', [0, 0.25, 0])] }),
  stall: (w, d) => ({ items: [b([0.1, 2.2, d * 0.95], '#8aa0b0', [0, 1.1, 0]), b([0.6, 0.06, 0.06], '#bbb', [0.3, 2.0, 0]), cyl(0.06, 0.02, '#ddd', [0.4, 2.0, 0])] }),
  stove: () => ({ items: [b([0.9, 0.95, 0.8], '#9aa0a6', [0, 0.47, 0]), b([0.95, 0.04, 0.85], '#2a2a2a', [0, 0.96, 0]), b([0.8, 0.4, 0.05], '#1a1a1a', [0, 0.45, 0.4]), b([0.9, 0.9, 0.3], '#8a9096', [0, 1.6, -0.25])] }),
  vending: () => ({ items: [b([0.9, 2.0, 0.8], '#b0201a', [0, 1.0, 0]), b([0.2, 0.6, 0.05], '#222', [0.25, 1.0, 0.41])], glow: [[b([0.5, 1.3, 0.03], '#fff', [-0.12, 1.25, 0.41])], 'white'] }),
  fountain: (w, d) => ({
    items: [r([w * 0.95, 0.5, d * 0.95], '#b8b0a0', [0, 0.25, 0], { r: 0.08 }), b([w * 0.8, 0.05, d * 0.8], '#2a4a5a', [0, 0.48, 0]), cyl(0.15, 1.2, '#b8b0a0', [0, 1.0, 0]), cyl(0.5, 0.15, '#b8b0a0', [0, 1.55, 0])],
  }),
  planter: () => ({ items: [b([0.9, 0.6, 0.9], '#7a7068', [0, 0.3, 0]), r([0.8, 0.9, 0.8], '#2f5a2a', [0, 1.05, 0], { r: 0.3, v: 0.1 }), r([0.5, 0.7, 0.5], '#3a6a32', [0.1, 1.6, 0.1], { r: 0.2, v: 0.1 })] }),
  car: (w, d) => {
    const along = w >= d, L = along ? w : d, Wd = along ? d : w;
    const S = (x, y, z) => (along ? [x, y, z] : [z, y, x]);
    const P = (x, y, z) => (along ? [x, y, z] : [z, y, x]);
    const col = '#6a2a2a';
    return {
      items: [r(S(L * 0.95, 0.55, Wd * 0.85), col, P(0, 0.55, 0), { r: 0.12 }), r(S(L * 0.5, 0.45, Wd * 0.78), '#2a3038', P(-L * 0.05, 1.0, 0), { r: 0.1 }),
        ...[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz]) => cyl(0.3, 0.2, '#151515', P(sx * L * 0.32, 0.3, sz * Wd * 0.42))).map((it) => ({ ...it, rot: along ? [Math.PI / 2, 0, 0] : [0, 0, Math.PI / 2] })),
        b(S(0.05, 0.12, Wd * 0.6), '#dcdcd0', P(L * 0.48, 0.65, 0)), b(S(L * 0.3, 0.02, Wd * 0.3), '#3a0a0a', P(L * 0.1, 0.83, 0.1))],
    };
  },
  projector: () => ({ items: [b([0.8, 0.9, 0.9], '#3a3a40', [0, 0.45, 0]), r([0.6, 0.5, 0.8], '#2a2a30', [0, 1.15, 0]), cyl(0.18, 0.4, '#555', [0, 1.2, 0.5])], glow: [[b([0.2, 0.2, 0.02], '#fff', [0, 1.2, 0.71])], 'white'] }),
  seat: () => ({ items: [b([0.55, 0.08, 0.5], '#6a1a1a', [0, 0.45, 0]), b([0.55, 0.6, 0.08], '#7a1f1f', [0, 0.75, -0.22]), b([0.06, 0.45, 0.45], '#2a2a2a', [-0.28, 0.22, 0]), b([0.06, 0.45, 0.45], '#2a2a2a', [0.28, 0.22, 0])] }),
  wheelchair: () => ({ items: [b([0.5, 0.06, 0.5], '#333', [0, 0.5, 0]), b([0.5, 0.5, 0.05], '#333', [0, 0.8, -0.25]), cyl(0.3, 0.04, '#888', [-0.28, 0.32, 0]), cyl(0.3, 0.04, '#888', [0.28, 0.32, 0])].map((it, i) => (i >= 2 ? { ...it, rot: [0, 0, Math.PI / 2] } : it)) }),
};

export function buildProps(scene, props) {
  const groups = new Map();
  for (const p of props) {
    if (p.kind === 'crate') continue; // crates use the textured crate mesh in world.js
    const key = `${p.kind}|${p.w}|${p.h}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(p);
  }
  const meshes = [];
  const m = new THREE.Matrix4();
  for (const [key, list] of groups) {
    const [kind, w, h] = key.split('|');
    const make = KINDS[kind];
    if (!make) continue;
    const def = make(+w, +h);
    const parts = [[build(def.items), propMat]];
    if (def.glow) parts.push([build(def.glow[0]), glowMats[def.glow[1]]]);
    for (const [geo, mat] of parts) {
      const im = new THREE.InstancedMesh(geo, mat, list.length);
      list.forEach((p, i) => {
        m.makeRotationY(p.rot || 0);
        m.setPosition(p.x + p.w / 2, 0, p.y + p.h / 2);
        im.setMatrixAt(i, m);
      });
      im.castShadow = !list[0].decor && mat === propMat;
      im.receiveShadow = true;
      scene.add(im);
      meshes.push(im);
    }
  }
  return meshes;
}
