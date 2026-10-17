// Static set dressing painted onto walls and floors: grime, cracks, blood, graffiti, posters and signs.
// Wall textures repeat every metre, so these one-off decals are what make each room look lived-in.
// Everything shares one atlas texture and is merged into a single mesh (one draw call per map).
import * as THREE from 'three';
import { T, cellAt, zoneAt } from '/shared/map.js';

const CELL = 256, COLS = 4;
// atlas cells
const D = {
  grime: 0, stain: 1, crack: 2, smear: 3, hands: 4, splat: 5, graffiti: 6, tally: 7,
  poster: 8, advert: 9, hazard: 10, sign: 11, dirt: 12, pool: 13, papers: 14, debris: 15,
};

function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

let atlasTex = null;
function atlas() {
  if (atlasTex) return atlasTex;
  const c = document.createElement('canvas');
  c.width = c.height = CELL * COLS;
  const x = c.getContext('2d');
  const rnd = rng(7);
  const cell = (i, fn) => {
    x.save();
    x.translate((i % COLS) * CELL, Math.floor(i / COLS) * CELL);
    x.beginPath(); x.rect(0, 0, CELL, CELL); x.clip();
    fn(CELL);
    x.restore();
  };
  const blob = (cx, cy, r, color) => {
    const g = x.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, color); g.addColorStop(1, color.replace(/[\d.]+\)$/, '0)'));
    x.fillStyle = g; x.fillRect(cx - r, cy - r, r * 2, r * 2);
  };
  const drips = (y0, n, color, maxLen) => {
    for (let i = 0; i < n; i++) {
      const dx = 30 + rnd() * (CELL - 60), len = 20 + rnd() * maxLen, w = 2 + rnd() * 5;
      x.fillStyle = color; x.fillRect(dx, y0, w, len);
      x.beginPath(); x.arc(dx + w / 2, y0 + len, w * 0.9, 0, 7); x.fill();
    }
  };
  // grime running down from the ceiling
  cell(D.grime, (s) => {
    // soft water stains: blurred, uneven runs instead of hard stripes
    x.filter = 'blur(6px)';
    for (let i = 0; i < 18; i++) {
      const gx = rnd() * s, w = 14 + rnd() * 40, len = s * (0.25 + rnd() * 0.6);
      const g = x.createLinearGradient(0, 0, 0, len);
      g.addColorStop(0, `rgba(34,26,16,${0.12 + rnd() * 0.16})`); g.addColorStop(1, 'rgba(34,26,16,0)');
      x.fillStyle = g;
      x.beginPath(); x.moveTo(gx, 0); x.lineTo(gx + w, 0); x.lineTo(gx + w * (0.4 + rnd() * 0.4), len); x.lineTo(gx + w * 0.3, len * 0.9); x.closePath(); x.fill();
    }
    x.filter = 'none';
  });
  // damp stain creeping up from the floor
  cell(D.stain, (s) => {
    for (let i = 0; i < 14; i++) blob(rnd() * s, s - rnd() * s * 0.3, 40 + rnd() * 70, `rgba(38,44,24,${0.25 + rnd() * 0.25})`);
    for (let i = 0; i < 8; i++) blob(rnd() * s, s - rnd() * 40, 20 + rnd() * 30, 'rgba(20,18,10,0.4)');
  });
  // crack
  cell(D.crack, (s) => {
    x.strokeStyle = 'rgba(12,10,8,0.85)'; x.lineCap = 'round';
    const branch = (px, py, ang, len, w) => {
      if (w < 0.6 || len < 6) return;
      x.lineWidth = w; x.beginPath(); x.moveTo(px, py);
      const nx = px + Math.cos(ang) * len, ny = py + Math.sin(ang) * len;
      x.lineTo(nx, ny); x.stroke();
      branch(nx, ny, ang + (rnd() - 0.5) * 0.9, len * 0.8, w * 0.78);
      if (rnd() < 0.4) branch(nx, ny, ang + (rnd() < 0.5 ? 1 : -1) * (0.6 + rnd() * 0.6), len * 0.6, w * 0.6);
    };
    branch(s * 0.5, s * 0.05, Math.PI / 2 + 0.2, 34, 4);
    blob(s * 0.5, s * 0.1, 40, 'rgba(0,0,0,0.25)');
  });
  // horizontal blood smear with drips
  cell(D.smear, (s) => {
    for (let i = 0; i < 40; i++) { x.fillStyle = `rgba(${90 + rnd() * 40},6,6,${0.25 + rnd() * 0.4})`; x.fillRect(20 + rnd() * 30, s * 0.4 + rnd() * 50, s * (0.5 + rnd() * 0.35), 3 + rnd() * 6); }
    drips(s * 0.5, 9, 'rgba(110,8,8,0.8)', 90);
  });
  // bloody handprints sliding down
  cell(D.hands, (s) => {
    const hand = (hx, hy, a, sc) => {
      x.save(); x.translate(hx, hy); x.rotate(a); x.scale(sc, sc);
      x.fillStyle = 'rgba(120,10,10,0.85)';
      x.beginPath(); x.ellipse(0, 0, 22, 26, 0, 0, 7); x.fill();
      for (let f = 0; f < 4; f++) { x.beginPath(); x.ellipse(-15 + f * 10, -36 - (f === 1 || f === 2 ? 6 : 0), 4.5, 15, (f - 1.5) * 0.12, 0, 7); x.fill(); }
      x.beginPath(); x.ellipse(24, 2, 5, 13, -0.9, 0, 7); x.fill();
      x.fillStyle = 'rgba(110,8,8,0.5)'; x.fillRect(-18, 10, 36, 40 + rnd() * 50);
      x.restore();
    };
    hand(s * 0.32, s * 0.35, -0.2, 1); hand(s * 0.68, s * 0.5, 0.15, 0.95); hand(s * 0.45, s * 0.72, 0.4, 0.8);
  });
  // big splatter
  cell(D.splat, (s) => {
    blob(s / 2, s / 2, 70, 'rgba(110,8,8,0.9)');
    for (let i = 0; i < 70; i++) {
      const a = rnd() * 7, r = 30 + rnd() * 90, sz = 2 + rnd() * 9;
      x.fillStyle = `rgba(${100 + rnd() * 40},6,6,${0.6 + rnd() * 0.4})`;
      x.beginPath(); x.arc(s / 2 + Math.cos(a) * r, s / 2 + Math.sin(a) * r, sz, 0, 7); x.fill();
    }
    drips(s * 0.55, 6, 'rgba(100,6,6,0.8)', 70);
  });
  // graffiti
  cell(D.graffiti, (s) => {
    x.fillStyle = 'rgba(150,12,12,0.9)'; x.font = `${s * 0.17}px "Permanent Marker", "Comic Sans MS", cursive`; x.textAlign = 'center';
    x.save(); x.translate(s / 2, s / 2); x.rotate(-0.08);
    x.fillText("THEY'RE", 0, -s * 0.08); x.fillText('COMING', 0, s * 0.14);
    x.restore();
    drips(s * 0.62, 7, 'rgba(140,10,10,0.7)', 50);
  });
  // tally marks and "HELP"
  cell(D.tally, (s) => {
    x.strokeStyle = 'rgba(230,226,210,0.75)'; x.lineWidth = 5; x.lineCap = 'round';
    for (let g = 0; g < 4; g++) for (let k = 0; k < 5; k++) {
      x.beginPath();
      if (k < 4) { x.moveTo(26 + g * 56 + k * 10, 40); x.lineTo(28 + g * 56 + k * 10, 100); }
      else { x.moveTo(20 + g * 56, 90); x.lineTo(66 + g * 56, 48); }
      x.stroke();
    }
    x.fillStyle = 'rgba(230,226,210,0.8)'; x.font = `${s * 0.2}px "Permanent Marker", cursive`; x.textAlign = 'center';
    x.fillText('HELP', s / 2, s * 0.78);
  });
  // old movie poster
  cell(D.poster, (s) => {
    const px = s * 0.18, pw = s * 0.64;
    x.fillStyle = '#c8b890'; x.fillRect(px, 8, pw, s - 16);
    const g = x.createLinearGradient(0, 0, 0, s); g.addColorStop(0, '#7a1a12'); g.addColorStop(1, '#2a0a08');
    x.fillStyle = g; x.fillRect(px + 8, 16, pw - 16, s * 0.62);
    x.fillStyle = '#e8d090'; x.beginPath(); x.arc(s / 2, s * 0.32, 34, 0, 7); x.fill();
    x.fillStyle = '#1a0806'; x.beginPath(); x.ellipse(s / 2, s * 0.6, 50, 60, 0, Math.PI, 0); x.fill();
    x.fillStyle = '#2a1a10'; x.font = `bold ${s * 0.09}px "Black Ops One", Impact, sans-serif`; x.textAlign = 'center';
    x.fillText('DER TOTEN', s / 2, s * 0.78); x.font = `${s * 0.05}px sans-serif`; x.fillText('NUR HEUTE NACHT', s / 2, s * 0.86);
    blob(px + pw * 0.8, s * 0.2, 60, 'rgba(60,40,10,0.45)');
    x.fillStyle = 'rgba(0,0,0,0.5)'; x.beginPath(); x.moveTo(px + pw, s - 8); x.lineTo(px + pw - 50, s - 8); x.lineTo(px + pw, s - 70); x.fill();
  });
  // shop advert
  cell(D.advert, (s) => {
    x.fillStyle = '#e8e4da'; x.fillRect(s * 0.1, 20, s * 0.8, s - 40);
    x.fillStyle = '#c81a1a'; x.fillRect(s * 0.1, 20, s * 0.8, s * 0.32);
    x.fillStyle = '#fff'; x.font = `bold ${s * 0.16}px "Black Ops One", Impact, sans-serif`; x.textAlign = 'center';
    x.fillText('SALE', s / 2, s * 0.3);
    x.fillStyle = '#1a1a1a'; x.font = `bold ${s * 0.2}px Impact, sans-serif`; x.fillText('-50%', s / 2, s * 0.62);
    x.font = `${s * 0.055}px sans-serif`; x.fillText('EVERYTHING MUST GO', s / 2, s * 0.76);
    blob(s * 0.7, s * 0.7, 50, 'rgba(110,8,8,0.7)');
  });
  // hazard sign
  cell(D.hazard, (s) => {
    x.fillStyle = '#d8b020'; x.fillRect(s * 0.12, s * 0.2, s * 0.76, s * 0.6);
    x.fillStyle = '#111';
    for (let i = -4; i < 12; i++) { x.beginPath(); x.moveTo(s * 0.12 + i * 24, s * 0.2); x.lineTo(s * 0.12 + i * 24 + 12, s * 0.2); x.lineTo(s * 0.12 + i * 24 - 20, s * 0.32); x.lineTo(s * 0.12 + i * 24 - 32, s * 0.32); x.fill(); }
    x.fillRect(s * 0.12, s * 0.2, 4, s * 0.6);
    x.font = `bold ${s * 0.12}px Impact, sans-serif`; x.textAlign = 'center';
    x.fillText('GEFAHR', s / 2, s * 0.52); x.font = `bold ${s * 0.07}px Impact, sans-serif`; x.fillText('HOCHSPANNUNG', s / 2, s * 0.66);
    x.beginPath(); x.moveTo(s * 0.8, s * 0.38); x.lineTo(s * 0.74, s * 0.52); x.lineTo(s * 0.79, s * 0.52); x.lineTo(s * 0.73, s * 0.7); x.lineTo(s * 0.84, s * 0.48); x.lineTo(s * 0.79, s * 0.48); x.fill();
  });
  // hospital sign
  cell(D.sign, (s) => {
    x.fillStyle = '#e8ece4'; x.fillRect(s * 0.1, s * 0.3, s * 0.8, s * 0.4);
    x.fillStyle = '#1a3a6a'; x.fillRect(s * 0.1, s * 0.3, s * 0.8, 8); x.fillRect(s * 0.1, s * 0.7 - 8, s * 0.8, 8);
    x.fillStyle = '#c81a1a'; x.fillRect(s * 0.17, s * 0.42, 40, 14); x.fillRect(s * 0.17 + 13, s * 0.42 - 13, 14, 40);
    x.fillStyle = '#1a1a1a'; x.font = `bold ${s * 0.1}px Impact, sans-serif`; x.textAlign = 'left';
    x.fillText('STATION B', s * 0.37, s * 0.5); x.font = `${s * 0.06}px sans-serif`; x.fillText('RUHE BITTE', s * 0.37, s * 0.6);
    blob(s * 0.3, s * 0.65, 40, 'rgba(110,8,8,0.6)');
  });
  // floor dirt
  cell(D.dirt, (s) => {
    for (let i = 0; i < 18; i++) blob(s / 2 + (rnd() - 0.5) * s * 0.5, s / 2 + (rnd() - 0.5) * s * 0.5, 30 + rnd() * 60, `rgba(40,30,18,${0.2 + rnd() * 0.25})`);
    for (let i = 0; i < 120; i++) { x.fillStyle = `rgba(30,24,16,${rnd() * 0.6})`; x.fillRect(s / 2 + (rnd() - 0.5) * s * 0.7, s / 2 + (rnd() - 0.5) * s * 0.7, 2 + rnd() * 4, 2 + rnd() * 4); }
  });
  // blood pool with a drag trail
  cell(D.pool, (s) => {
    x.fillStyle = 'rgba(80,4,4,0.55)';
    for (let i = 0; i < 12; i++) x.fillRect(s * 0.5 - 18 + rnd() * 8, s * 0.1 + i * 14, 36 - rnd() * 10, 16);
    blob(s * 0.5, s * 0.66, 80, 'rgba(90,4,4,0.95)');
    for (let i = 0; i < 6; i++) blob(s * 0.5 + (rnd() - 0.5) * 120, s * 0.66 + (rnd() - 0.5) * 100, 20 + rnd() * 26, 'rgba(90,4,4,0.9)');
  });
  // scattered papers
  cell(D.papers, (s) => {
    for (let i = 0; i < 9; i++) {
      x.save(); x.translate(30 + rnd() * (s - 60), 30 + rnd() * (s - 60)); x.rotate(rnd() * 7);
      x.fillStyle = rnd() < 0.3 ? '#d8cca8' : '#e8e4d8'; x.fillRect(-26, -34, 52, 68);
      x.fillStyle = 'rgba(40,40,40,0.5)'; for (let l = 0; l < 7; l++) x.fillRect(-20, -26 + l * 8, 30 + rnd() * 10, 2);
      if (rnd() < 0.3) blob(0, 0, 20, 'rgba(110,8,8,0.6)');
      x.restore();
    }
  });
  // broken glass and debris
  cell(D.debris, (s) => {
    for (let i = 0; i < 40; i++) {
      x.fillStyle = rnd() < 0.5 ? `rgba(180,200,210,${0.3 + rnd() * 0.4})` : `rgba(70,64,56,${0.5 + rnd() * 0.4})`;
      x.save(); x.translate(s / 2 + (rnd() - 0.5) * s * 0.75, s / 2 + (rnd() - 0.5) * s * 0.75); x.rotate(rnd() * 7);
      x.beginPath(); x.moveTo(0, 0); x.lineTo(6 + rnd() * 14, 2); x.lineTo(3, 6 + rnd() * 12); x.fill();
      x.restore();
    }
    for (let i = 0; i < 6; i++) blob(s / 2 + (rnd() - 0.5) * s * 0.6, s / 2 + (rnd() - 0.5) * s * 0.6, 20 + rnd() * 30, 'rgba(30,26,20,0.35)');
  });
  atlasTex = new THREE.CanvasTexture(c);
  atlasTex.colorSpace = THREE.SRGBColorSpace;
  atlasTex.anisotropy = 8;
  return atlasTex;
}

// which wall pictures fit which room style
const WALL_SETS = {
  theater: ['poster', 'poster', 'graffiti', 'hands', 'smear'], theaterWood: ['poster', 'graffiti', 'smear'], dressing: ['hands', 'splat', 'poster', 'tally'],
  generator: ['hazard', 'hazard', 'smear'], projector: ['poster', 'hazard', 'tally'],
  bunker: ['tally', 'hazard', 'smear', 'graffiti'], bunkerWood: ['tally', 'smear'], courtyard: ['graffiti', 'splat'],
  ward: ['sign', 'hands', 'tally', 'splat'], kitchen: ['smear', 'splat', 'sign'], dining: ['graffiti', 'smear', 'hands'], showers: ['hands', 'splat', 'smear'],
  warehouse: ['hazard', 'graffiti', 'smear'], factory: ['hazard', 'hazard', 'smear', 'tally'], furnace: ['hazard', 'splat'], lab: ['sign', 'hazard', 'hands'],
  atrium: ['advert', 'graffiti', 'splat'], shop: ['advert', 'smear'], foodcourt: ['advert', 'splat', 'hands'], store: ['advert', 'advert', 'graffiti'], parking: ['graffiti', 'tally', 'splat'],
};
const SIZES = {
  grime: [0.95, 2.4, 2.6], stain: [1.0, 1.2, 0.6], crack: [0.9, 1.4, 2.7], smear: [1.0, 0.9, 1.15], hands: [0.85, 0.85, 1.25], splat: [1.0, 1.0, 1.2],
  graffiti: [1.0, 1.0, 1.7], tally: [0.9, 0.9, 1.5], poster: [0.95, 0.95, 1.65], advert: [0.95, 0.95, 1.7], hazard: [0.9, 0.9, 1.7], sign: [0.95, 0.95, 2.0],
};

/** Add decals for the current map. gore: false skips the blood ones. */
export function buildDecals(scene, map, styleOf, { gore = true, avoid = [] } = {}) {
  const rnd = rng([...map.id].reduce((a, ch) => a * 31 + ch.charCodeAt(0), 17));
  const pos = [], nor = [], uv = [], idx = [];
  const blocked = new Set(avoid.map(([x, y]) => `${x},${y}`));
  const usedFace = new Set();
  const quad = (c, right, up, n, w, h, tile) => {
    const u0 = (tile % COLS) / COLS, v1 = 1 - Math.floor(tile / COLS) / COLS, u1 = u0 + 1 / COLS, v0 = v1 - 1 / COLS;
    const pad = 0.002;
    const base = pos.length / 3;
    for (const [sx, sy, u, v] of [[-1, -1, u0 + pad, v0 + pad], [1, -1, u1 - pad, v0 + pad], [1, 1, u1 - pad, v1 - pad], [-1, 1, u0 + pad, v1 - pad]]) {
      pos.push(c.x + right.x * sx * w / 2 + up.x * sy * h / 2, c.y + right.y * sx * w / 2 + up.y * sy * h / 2, c.z + right.z * sx * w / 2 + up.z * sy * h / 2);
      nor.push(n.x, n.y, n.z);
      uv.push(u, v);
    }
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  };
  const bloody = new Set(['smear', 'hands', 'splat', 'pool']);
  for (const room of map.rooms) {
    const st = styleOf(room);
    const set = (WALL_SETS[room.style] || ['graffiti', 'smear']).filter((k) => gore || !bloody.has(k));
    // wall faces along the room edge that touch a plain wall
    const faces = [];
    for (let y = room.y0; y <= room.y1; y++)
      for (let x = room.x0; x <= room.x1; x++) {
        if (cellAt(x, y, map) !== T.FLOOR || zoneAt(x, y, map) !== room.id) continue;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          if (cellAt(x + dx, y + dy, map) !== T.WALL) continue;
          if (blocked.has(`${x},${y}`)) continue;
          faces.push([x, y, dx, dy]);
        }
      }
    for (let i = faces.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [faces[i], faces[j]] = [faces[j], faces[i]]; }
    const nWall = Math.round(faces.length * 0.32);
    let placed = 0;
    for (const [x, y, dx, dy] of faces) {
      if (placed >= nWall) break;
      const key = `${x + dx},${y + dy},${dx},${dy}`;
      if (usedFace.has(key)) continue;
      usedFace.add(key);
      placed++;
      // most faces get grime or cracks, about a third get a picture
      const r = rnd();
      const kind = r < 0.34 ? set[Math.floor(rnd() * set.length)] : r < 0.62 ? 'grime' : r < 0.82 ? (room.outdoor ? 'grime' : 'stain') : 'crack';
      if (room.outdoor && (kind === 'poster' || kind === 'sign')) continue;
      const [w, h, cy] = SIZES[kind];
      const n = new THREE.Vector3(-dx, 0, -dy);
      const right = new THREE.Vector3(-dy, 0, dx);
      const up = new THREE.Vector3(0, 1, 0);
      const off = (st.base ? 0.036 : 0.012) + placed * 0.0004; // clear the wainscot where there is one
      const c = new THREE.Vector3(x + 0.5 + dx * (0.5 - off), cy + (rnd() - 0.5) * 0.15, y + 0.5 + dy * (0.5 - off));
      const sc = kind === 'grime' || kind === 'crack' ? 1 : 0.9 + rnd() * 0.2;
      quad(c, right, up, n, w * sc, h * sc, D[kind]);
    }
    // floor decals
    const area = (room.x1 - room.x0 + 1) * (room.y1 - room.y0 + 1);
    const nFloor = Math.round(area * (room.outdoor ? 0.03 : 0.05));
    for (let i = 0; i < nFloor; i++) {
      const x = room.x0 + rnd() * (room.x1 - room.x0 + 1), z = room.y0 + rnd() * (room.y1 - room.y0 + 1);
      if (cellAt(Math.floor(x), Math.floor(z), map) !== T.FLOOR) continue;
      const r = rnd();
      let kind = r < 0.38 ? 'dirt' : r < 0.6 ? 'debris' : r < 0.8 ? 'papers' : 'pool';
      if (!gore && kind === 'pool') kind = 'dirt';
      if (room.outdoor && kind === 'papers') kind = 'debris';
      const size = kind === 'pool' ? 1.3 + rnd() * 0.6 : 0.9 + rnd() * 0.8;
      const a = rnd() * Math.PI * 2;
      const right = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
      const up = new THREE.Vector3(-Math.sin(a), 0, Math.cos(a));
      quad(new THREE.Vector3(x, 0.006 + i * 0.0003, z), right, up, new THREE.Vector3(0, 1, 0), size, size, D[kind]);
    }
  }
  if (!idx.length) return null;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  const mat = new THREE.MeshStandardMaterial({ map: atlas(), transparent: true, depthWrite: false, roughness: 0.75, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.renderOrder = 1;
  scene.add(mesh);
  return mesh;
}
