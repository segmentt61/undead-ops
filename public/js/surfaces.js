// Physically based surface materials: each one paints a colour map and a matching height map,
// and the height map is turned into a normal map so walls and floors catch the light.
import * as THREE from 'three';

const S = 512;

function rand(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

function canvas(w = S, h = S) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}

function speckle(ctx, w, h, amount, rnd) {
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (rnd() - 0.5) * amount;
    d[i] += n; d[i + 1] += n; d[i + 2] += n;
  }
  ctx.putImageData(img, 0, 0);
}

function blotches(ctx, w, h, rnd, count, color, maxA, minR = 20, maxR = 110) {
  for (let i = 0; i < count; i++) {
    const x = rnd() * w, y = rnd() * h, r = minR + rnd() * (maxR - minR);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(${color},${maxA * (0.4 + rnd() * 0.6)})`);
    g.addColorStop(1, `rgba(${color},0)`);
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
}

function normalFromHeight(hc, strength = 2) {
  const w = hc.width, h = hc.height;
  const src = hc.getContext('2d').getImageData(0, 0, w, h).data;
  const [c, x] = canvas(w, h);
  const out = x.createImageData(w, h);
  const H = (i, j) => src[(((j + h) % h) * w + ((i + w) % w)) * 4] / 255;
  for (let j = 0; j < h; j++)
    for (let i = 0; i < w; i++) {
      const dx = (H(i + 1, j) - H(i - 1, j)) * strength;
      const dy = (H(i, j + 1) - H(i, j - 1)) * strength;
      let nx = -dx, ny = dy, nz = 1;
      const l = Math.hypot(nx, ny, nz);
      const k = (j * w + i) * 4;
      out.data[k] = (nx / l * 0.5 + 0.5) * 255;
      out.data[k + 1] = (ny / l * 0.5 + 0.5) * 255;
      out.data[k + 2] = (nz / l * 0.5 + 0.5) * 255;
      out.data[k + 3] = 255;
    }
  x.putImageData(out, 0, 0);
  return c;
}

function toTex(c, srgb, repeat = true) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

function build(paint, { strength = 2, roughness = 0.8, metalness = 0, normalScale = 1, size = S } = {}) {
  const [c, x] = canvas(size, size);
  const [hc, hx] = canvas(size, size);
  paint(x, hx, size);
  const map = toTex(c, true);
  const normalMap = toTex(normalFromHeight(hc, strength), false);
  return { map, normalMap, roughness, metalness, normalScale: new THREE.Vector2(normalScale, normalScale) };
}

/** Create a MeshStandardMaterial from a surface; repeat sets texture tiling. */
export function surfaceMaterial(surface, repeat = [1, 1], extra = {}) {
  const map = surface.map.clone();
  const normalMap = surface.normalMap.clone();
  for (const t of [map, normalMap]) { t.repeat.set(repeat[0], repeat[1]); t.needsUpdate = true; }
  return new THREE.MeshStandardMaterial({
    map, normalMap, normalScale: surface.normalScale, roughness: surface.roughness, metalness: surface.metalness, ...extra,
  });
}

// ------------------------------------------------------------------ surfaces
export function bricks() {
  return build((x, h, s) => {
    const rnd = rand(7);
    x.fillStyle = '#3e342e'; x.fillRect(0, 0, s, s);
    h.fillStyle = '#202020'; h.fillRect(0, 0, s, s);
    const rows = 8, cols = 4, bh = s / rows, bw = s / cols, m = 5;
    for (let r = 0; r < rows; r++) {
      const off = r % 2 ? bw / 2 : 0;
      for (let col = -1; col <= cols; col++) {
        const rr = 112 + rnd() * 44, gg = 52 + rnd() * 24, bb = 40 + rnd() * 18;
        x.fillStyle = `rgb(${rr | 0},${gg | 0},${bb | 0})`;
        const px = col * bw + off + m, py = r * bh + m, pw = bw - m * 2, ph = bh - m * 2;
        x.fillRect(px, py, pw, ph);
        // bevelled height: light centre, darker edges
        const hv = 175 + rnd() * 50;
        h.fillStyle = `rgb(${hv | 0},${hv | 0},${hv | 0})`;
        h.fillRect(px, py, pw, ph);
        h.fillStyle = 'rgba(255,255,255,0.25)';
        h.fillRect(px + 3, py + 3, pw - 6, ph - 6);
        // chips
        if (rnd() < 0.35) {
          const cx = px + rnd() * pw, cy = py + rnd() * ph, cr = 4 + rnd() * 9;
          x.fillStyle = 'rgba(40,25,20,0.6)'; x.beginPath(); x.arc(cx, cy, cr, 0, 7); x.fill();
          h.fillStyle = 'rgba(40,40,40,0.8)'; h.beginPath(); h.arc(cx, cy, cr, 0, 7); h.fill();
        }
      }
    }
    speckle(x, s, s, 26, rnd);
    speckle(h, s, s, 30, rnd);
    blotches(x, s, s, rnd, 14, '0,0,0', 0.22);
    const g = x.createLinearGradient(0, 0, 0, s);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(15,8,0,0.25)');
    x.fillStyle = g; x.fillRect(0, 0, s, s);
  }, { strength: 3.2, roughness: 0.85 });
}

export function plaster(base = '#4a3426') {
  return build((x, h, s) => {
    const rnd = rand(11);
    x.fillStyle = base; x.fillRect(0, 0, s, s);
    h.fillStyle = '#909090'; h.fillRect(0, 0, s, s);
    // vertical wood panels (wainscot)
    const n = 4;
    for (let i = 0; i < n; i++) {
      const px = i * s / n;
      x.fillStyle = 'rgba(0,0,0,0.35)'; x.fillRect(px, 0, 6, s);
      h.fillStyle = '#404040'; h.fillRect(px, 0, 6, s);
      h.fillStyle = '#b0b0b0'; h.fillRect(px + 18, 30, s / n - 36, s - 60);
      x.strokeStyle = 'rgba(0,0,0,0.25)'; x.lineWidth = 3; x.strokeRect(px + 18, 30, s / n - 36, s - 60);
    }
    for (let i = 0; i < 90; i++) {
      x.strokeStyle = `rgba(0,0,0,${0.05 + rnd() * 0.08})`;
      x.beginPath(); const gx = rnd() * s; x.moveTo(gx, 0); x.bezierCurveTo(gx + 6, s * 0.3, gx - 6, s * 0.7, gx + 3, s); x.stroke();
    }
    speckle(x, s, s, 16, rnd); speckle(h, s, s, 14, rnd);
    blotches(x, s, s, rnd, 10, '0,0,0', 0.25);
  }, { strength: 2.4, roughness: 0.6 });
}

export function woodFloor() {
  return build((x, h, s) => {
    const rnd = rand(3);
    const n = 8, pw = s / n;
    for (let i = 0; i < n; i++) {
      const l = 22 + rnd() * 12;
      x.fillStyle = `hsl(24, 42%, ${l}%)`;
      x.fillRect(i * pw, 0, pw, s);
      h.fillStyle = '#b4b4b4'; h.fillRect(i * pw, 0, pw, s);
      for (let k = 0; k < 22; k++) {
        const a = 0.05 + rnd() * 0.12;
        x.strokeStyle = `rgba(30,12,0,${a})`; h.strokeStyle = `rgba(60,60,60,${a * 2})`;
        const gx = i * pw + rnd() * pw;
        for (const ctx of [x, h]) { ctx.lineWidth = 1 + rnd() * 1.5; ctx.beginPath(); ctx.moveTo(gx, 0); ctx.bezierCurveTo(gx + 5, s * 0.33, gx - 5, s * 0.66, gx + 2, s); ctx.stroke(); }
      }
      // plank seams
      x.fillStyle = 'rgba(0,0,0,0.7)'; x.fillRect(i * pw, 0, 3, s);
      h.fillStyle = '#202020'; h.fillRect(i * pw, 0, 3, s);
      const cy = (rnd() * s) | 0;
      x.fillRect(i * pw, cy, pw, 3); h.fillRect(i * pw, cy, pw, 3);
      // nails
      x.fillStyle = 'rgba(20,20,20,0.8)';
      for (const ny of [cy - 10, cy + 12]) { x.fillRect(i * pw + 8, ny, 4, 4); x.fillRect(i * pw + pw - 12, ny, 4, 4); }
    }
    speckle(x, s, s, 14, rnd);
    blotches(x, s, s, rnd, 8, '0,0,0', 0.3);
    blotches(x, s, s, rnd, 3, '80,0,0', 0.35, 10, 40);
  }, { strength: 2.5, roughness: 0.62 });
}

export function tiles(a = '#cbc2ae', b = '#2c2420') {
  return build((x, h, s) => {
    const rnd = rand(5);
    const n = 4, t = s / n;
    x.fillStyle = '#1a1714'; x.fillRect(0, 0, s, s);
    h.fillStyle = '#303030'; h.fillRect(0, 0, s, s);
    for (let i = 0; i < n; i++)
      for (let j = 0; j < n; j++) {
        const c = new THREE.Color((i + j) % 2 ? a : b).offsetHSL(0, 0, (rnd() - 0.5) * 0.04);
        x.fillStyle = `#${c.getHexString()}`;
        x.fillRect(i * t + 3, j * t + 3, t - 6, t - 6);
        h.fillStyle = '#c8c8c8'; h.fillRect(i * t + 3, j * t + 3, t - 6, t - 6);
        if (rnd() < 0.3) { // crack
          x.strokeStyle = 'rgba(0,0,0,0.5)'; h.strokeStyle = '#555';
          for (const ctx of [x, h]) { ctx.lineWidth = 1.5; ctx.beginPath(); let px = i * t + rnd() * t, py = j * t + rnd() * t; ctx.moveTo(px, py); for (let k = 0; k < 4; k++) { px += (rnd() - 0.5) * 40; py += (rnd() - 0.5) * 40; ctx.lineTo(px, py); } ctx.stroke(); }
        }
      }
    speckle(x, s, s, 18, rnd);
    blotches(x, s, s, rnd, 10, '0,0,0', 0.25);
    blotches(x, s, s, rnd, 4, '90,0,0', 0.45, 10, 50);
  }, { strength: 3, roughness: 0.45 });
}

export function concrete(base = '#58544c', seed = 9) {
  return build((x, h, s) => {
    const rnd = rand(seed);
    x.fillStyle = base; x.fillRect(0, 0, s, s);
    h.fillStyle = '#808080'; h.fillRect(0, 0, s, s);
    speckle(x, s, s, 30, rnd); speckle(h, s, s, 60, rnd);
    blotches(x, s, s, rnd, 22, '0,0,0', 0.2);
    blotches(x, s, s, rnd, 8, '255,255,255', 0.05);
    // expansion joints
    x.fillStyle = 'rgba(0,0,0,0.5)'; x.fillRect(0, 0, s, 4); x.fillRect(0, 0, 4, s);
    h.fillStyle = '#202020'; h.fillRect(0, 0, s, 4); h.fillRect(0, 0, 4, s);
    for (let i = 0; i < 5; i++) {
      x.strokeStyle = 'rgba(0,0,0,0.4)'; h.strokeStyle = '#303030';
      for (const ctx of [x, h]) { ctx.lineWidth = 1.5; ctx.beginPath(); let px = rnd() * s, py = rnd() * s; ctx.moveTo(px, py); for (let k = 0; k < 6; k++) { px += (rnd() - 0.5) * 60; py += (rnd() - 0.5) * 60; ctx.lineTo(px, py); } ctx.stroke(); }
    }
  }, { strength: 1.6, roughness: 0.9 });
}

export function dirt() {
  return build((x, h, s) => {
    const rnd = rand(13);
    x.fillStyle = '#23241a'; x.fillRect(0, 0, s, s);
    h.fillStyle = '#707070'; h.fillRect(0, 0, s, s);
    for (let i = 0; i < 2600; i++) {
      const px = rnd() * s, py = rnd() * s, r = 1 + rnd() * 5;
      const grass = rnd() < 0.45;
      x.fillStyle = grass ? `rgba(${60 + rnd() * 30},${75 + rnd() * 30},${30 + rnd() * 20},${0.3 + rnd() * 0.5})` : `rgba(${20 + rnd() * 30},${16 + rnd() * 20},${10 + rnd() * 10},${0.5 + rnd() * 0.5})`;
      x.beginPath(); x.arc(px, py, r, 0, 7); x.fill();
      const hv = (grass ? 150 : 60 + rnd() * 100) | 0;
      h.fillStyle = `rgba(${hv},${hv},${hv},0.6)`; h.beginPath(); h.arc(px, py, r, 0, 7); h.fill();
    }
    speckle(x, s, s, 18, rnd);
  }, { strength: 2.5, roughness: 0.95 });
}

export function beams() {
  return build((x, h, s) => {
    const rnd = rand(29);
    x.fillStyle = '#1b1613'; x.fillRect(0, 0, s, s);
    h.fillStyle = '#404040'; h.fillRect(0, 0, s, s);
    for (let i = 0; i < 4; i++) {
      const px = i * s / 4;
      x.fillStyle = `hsl(25, 35%, ${15 + rnd() * 5}%)`; x.fillRect(px, 0, 40, s);
      h.fillStyle = '#d0d0d0'; h.fillRect(px, 0, 40, s);
      for (let k = 0; k < 8; k++) { x.fillStyle = 'rgba(0,0,0,0.2)'; x.fillRect(px + rnd() * 40, 0, 1.5, s); }
    }
    speckle(x, s, s, 14, rnd);
  }, { strength: 3, roughness: 0.8 });
}

export function crate() {
  return build((x, h, s) => {
    const rnd = rand(21);
    x.fillStyle = '#8c6236'; x.fillRect(0, 0, s, s);
    h.fillStyle = '#909090'; h.fillRect(0, 0, s, s);
    for (let i = 0; i < 6; i++) {
      x.fillStyle = 'rgba(0,0,0,0.3)'; x.fillRect(0, i * s / 6, s, 3);
      h.fillStyle = '#404040'; h.fillRect(0, i * s / 6, s, 3);
    }
    for (let k = 0; k < 60; k++) { x.strokeStyle = `rgba(40,20,5,${0.05 + rnd() * 0.1})`; x.beginPath(); const y = rnd() * s; x.moveTo(0, y); x.bezierCurveTo(s * 0.3, y + 4, s * 0.6, y - 4, s, y + 2); x.stroke(); }
    const f = 34;
    x.fillStyle = '#5e3d1b'; h.fillStyle = '#e0e0e0';
    for (const ctx of [x, h]) {
      ctx.fillRect(0, 0, s, f); ctx.fillRect(0, s - f, s, f); ctx.fillRect(0, 0, f, s); ctx.fillRect(s - f, 0, f, s);
      ctx.save(); ctx.translate(s / 2, s / 2); ctx.rotate(Math.PI / 4); ctx.fillRect(-s * 0.7, -f / 2, s * 1.4, f); ctx.restore();
    }
    x.fillStyle = '#222';
    for (const [px, py] of [[17, 17], [s - 17, 17], [17, s - 17], [s - 17, s - 17]]) { x.beginPath(); x.arc(px, py, 5, 0, 7); x.fill(); }
    speckle(x, s, s, 22, rnd);
    blotches(x, s, s, rnd, 6, '0,0,0', 0.3);
  }, { strength: 3, roughness: 0.75 });
}

export function door() {
  return build((x, h, s) => {
    const rnd = rand(23);
    x.fillStyle = '#3f2a18'; x.fillRect(0, 0, s, s);
    h.fillStyle = '#909090'; h.fillRect(0, 0, s, s);
    const n = 5, pw = s / n;
    for (let i = 0; i < n; i++) {
      x.fillStyle = `hsl(26, 38%, ${15 + rnd() * 8}%)`; x.fillRect(i * pw + 2, 0, pw - 4, s);
      h.fillStyle = '#c0c0c0'; h.fillRect(i * pw + 2, 0, pw - 4, s);
    }
    for (const by of [s * 0.15, s * 0.8]) {
      x.fillStyle = '#26282b'; x.fillRect(0, by, s, 26);
      h.fillStyle = '#ffffff'; h.fillRect(0, by, s, 26);
      for (let i = 0; i < 8; i++) { x.fillStyle = '#7a7e84'; x.beginPath(); x.arc(14 + i * (s - 28) / 7, by + 13, 5, 0, 7); x.fill(); }
    }
    speckle(x, s, s, 20, rnd);
    blotches(x, s, s, rnd, 8, '0,0,0', 0.3);
  }, { strength: 3, roughness: 0.7 });
}

export function planks() {
  return build((x, h, s) => {
    const rnd = rand(17);
    x.fillStyle = '#7d5631'; x.fillRect(0, 0, s, s);
    h.fillStyle = '#a0a0a0'; h.fillRect(0, 0, s, s);
    for (let k = 0; k < 40; k++) {
      x.strokeStyle = `rgba(40,20,5,${0.1 + rnd() * 0.25})`;
      x.beginPath(); const y = rnd() * s; x.moveTo(0, y); x.bezierCurveTo(s * 0.3, y + 6, s * 0.6, y - 6, s, y + 2); x.stroke();
    }
    x.fillStyle = '#1b1b1b';
    for (const [px, py] of [[20, s * 0.35], [20, s * 0.65], [s - 24, s * 0.35], [s - 24, s * 0.65]]) x.fillRect(px, py, 8, 8);
    speckle(x, s, s, 20, rnd);
  }, { strength: 2, roughness: 0.8, size: 256 });
}

// ------------------------------------------------------------------ themed walls / floors / ceilings
export function concreteWall(base = '#6a685f', seed = 41) {
  return build((x, h, s) => {
    const rnd = rand(seed);
    x.fillStyle = base; x.fillRect(0, 0, s, s);
    h.fillStyle = '#909090'; h.fillRect(0, 0, s, s);
    speckle(x, s, s, 26, rnd); speckle(h, s, s, 50, rnd);
    blotches(x, s, s, rnd, 18, '0,0,0', 0.22);
    // formwork board lines + tie holes
    x.fillStyle = 'rgba(0,0,0,0.25)'; x.fillRect(0, s / 2, s, 3);
    h.fillStyle = '#505050'; h.fillRect(0, s / 2, s, 3);
    for (const [px, py] of [[s * 0.3, s * 0.25], [s * 0.7, s * 0.75]]) {
      x.fillStyle = 'rgba(20,20,20,0.7)'; x.beginPath(); x.arc(px, py, 6, 0, 7); x.fill();
      h.fillStyle = '#202020'; h.beginPath(); h.arc(px, py, 6, 0, 7); h.fill();
    }
    // water stains running down
    for (let i = 0; i < 6; i++) { const g = x.createLinearGradient(0, 0, 0, s); g.addColorStop(0, 'rgba(30,25,15,0.25)'); g.addColorStop(1, 'rgba(30,25,15,0)'); x.fillStyle = g; x.fillRect(rnd() * s, 0, 6 + rnd() * 20, s * (0.3 + rnd() * 0.7)); }
  }, { strength: 2, roughness: 0.92 });
}

export function plankWall() {
  return build((x, h, s) => {
    const rnd = rand(43);
    const n = 6, pw = s / n;
    for (let i = 0; i < n; i++) {
      x.fillStyle = `hsl(28, 35%, ${18 + rnd() * 10}%)`; x.fillRect(i * pw, 0, pw, s);
      h.fillStyle = '#b0b0b0'; h.fillRect(i * pw, 0, pw, s);
      for (let k = 0; k < 18; k++) { x.strokeStyle = `rgba(20,10,0,${0.08 + rnd() * 0.12})`; x.beginPath(); const gx = i * pw + rnd() * pw; x.moveTo(gx, 0); x.bezierCurveTo(gx + 4, s * 0.3, gx - 4, s * 0.7, gx, s); x.stroke(); }
      x.fillStyle = 'rgba(0,0,0,0.7)'; x.fillRect(i * pw, 0, 4, s); h.fillStyle = '#202020'; h.fillRect(i * pw, 0, 4, s);
    }
    speckle(x, s, s, 18, rnd);
    blotches(x, s, s, rnd, 10, '0,0,0', 0.3);
  }, { strength: 2.5, roughness: 0.8 });
}

export function stoneWall() {
  return build((x, h, s) => {
    const rnd = rand(47);
    x.fillStyle = '#2e2c28'; x.fillRect(0, 0, s, s);
    h.fillStyle = '#202020'; h.fillRect(0, 0, s, s);
    let y = 0;
    while (y < s) {
      const rh = 40 + rnd() * 40; let xx = -rnd() * 60;
      while (xx < s) {
        const rw = 60 + rnd() * 70, l = 30 + rnd() * 18;
        x.fillStyle = `hsl(${30 + rnd() * 20}, 8%, ${l}%)`;
        x.beginPath(); x.roundRect(xx + 4, y + 4, rw - 8, rh - 8, 10); x.fill();
        const hv = (150 + rnd() * 90) | 0; h.fillStyle = `rgb(${hv},${hv},${hv})`; h.beginPath(); h.roundRect(xx + 4, y + 4, rw - 8, rh - 8, 10); h.fill();
        xx += rw;
      }
      y += rh;
    }
    speckle(x, s, s, 24, rnd); speckle(h, s, s, 40, rnd);
    blotches(x, s, s, rnd, 12, '20,40,10', 0.25);
  }, { strength: 3.5, roughness: 0.95 });
}

export function tileWall(upper = '#d8ddd2', lower = '#4f7a62', seed = 53) {
  return build((x, h, s) => {
    const rnd = rand(seed);
    const n = 8, t = s / n;
    x.fillStyle = '#6a6a62'; x.fillRect(0, 0, s, s);
    h.fillStyle = '#404040'; h.fillRect(0, 0, s, s);
    for (let j = 0; j < n; j++)
      for (let i = 0; i < n; i++) {
        const c = new THREE.Color(j === 0 && lower !== upper ? lower : upper).offsetHSL(0, 0, (rnd() - 0.5) * 0.05);
        x.fillStyle = `#${c.getHexString()}`; x.fillRect(i * t + 2, j * t + 2, t - 4, t - 4);
        h.fillStyle = '#c8c8c8'; h.fillRect(i * t + 2, j * t + 2, t - 4, t - 4);
        if (rnd() < 0.06) { x.fillStyle = 'rgba(40,40,30,0.8)'; x.fillRect(i * t + 2, j * t + 2, t - 4, t - 4); h.fillStyle = '#606060'; h.fillRect(i * t + 2, j * t + 2, t - 4, t - 4); }
      }
    speckle(x, s, s, 16, rnd);
    blotches(x, s, s, rnd, 16, '40,30,10', 0.28);
    blotches(x, s, s, rnd, 3, '90,0,0', 0.4, 8, 30);
  }, { strength: 2.4, roughness: 0.35 });
}

export function plasterWall(base = '#8a8070', seed = 59) {
  return build((x, h, s) => {
    const rnd = rand(seed);
    x.fillStyle = base; x.fillRect(0, 0, s, s);
    h.fillStyle = '#a0a0a0'; h.fillRect(0, 0, s, s);
    speckle(x, s, s, 16, rnd); speckle(h, s, s, 22, rnd);
    blotches(x, s, s, rnd, 20, '30,20,10', 0.18, 30, 140);
    // peeling patches showing brick
    for (let i = 0; i < 4; i++) {
      const px = rnd() * s, py = rnd() * s, pw = 40 + rnd() * 70, ph = 30 + rnd() * 50;
      x.fillStyle = '#7a3e2c'; x.beginPath(); x.ellipse(px, py, pw / 2, ph / 2, rnd() * 3, 0, 7); x.fill();
      h.fillStyle = '#505050'; h.beginPath(); h.ellipse(px, py, pw / 2, ph / 2, rnd() * 3, 0, 7); h.fill();
    }
  }, { strength: 1.8, roughness: 0.85 });
}

export function metalWall(base = '#5a6066', seed = 61) {
  return build((x, h, s) => {
    const rnd = rand(seed);
    const n = 8, pw = s / n;
    for (let i = 0; i < n; i++) {
      const g = x.createLinearGradient(i * pw, 0, (i + 1) * pw, 0);
      g.addColorStop(0, base); g.addColorStop(0.5, new THREE.Color(base).offsetHSL(0, 0, 0.08).getStyle()); g.addColorStop(1, base);
      x.fillStyle = g; x.fillRect(i * pw, 0, pw, s);
      const hg = h.createLinearGradient(i * pw, 0, (i + 1) * pw, 0);
      hg.addColorStop(0, '#404040'); hg.addColorStop(0.5, '#d0d0d0'); hg.addColorStop(1, '#404040');
      h.fillStyle = hg; h.fillRect(i * pw, 0, pw, s);
    }
    blotches(x, s, s, rnd, 16, '90,40,10', 0.3, 20, 90); // rust
    blotches(x, s, s, rnd, 10, '0,0,0', 0.25);
    speckle(x, s, s, 14, rnd);
  }, { strength: 2.5, roughness: 0.55, metalness: 0.5 });
}

export function shopWall(base = '#c8c4bc', stripe = '#8a2a2a', seed = 67) {
  return build((x, h, s) => {
    const rnd = rand(seed);
    x.fillStyle = base; x.fillRect(0, 0, s, s);
    h.fillStyle = '#a0a0a0'; h.fillRect(0, 0, s, s);
    // large wall panels with thin seams
    x.fillStyle = 'rgba(0,0,0,0.18)'; x.fillRect(0, 0, 3, s); x.fillRect(s / 2, 0, 2, s);
    h.fillStyle = '#505050'; h.fillRect(0, 0, 3, s); h.fillRect(s / 2, 0, 2, s);
    speckle(x, s, s, 8, rnd);
    blotches(x, s, s, rnd, 10, '40,30,20', 0.16, 40, 160);
  }, { strength: 1.2, roughness: 0.6 });
}

export function marble(seed = 71) {
  return build((x, h, s) => {
    const rnd = rand(seed);
    const n = 2, t = s / n;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      x.fillStyle = (i + j) % 2 ? '#d8d4cc' : '#b8b4ac'; x.fillRect(i * t, j * t, t, t);
      h.fillStyle = '#c0c0c0'; h.fillRect(i * t + 2, j * t + 2, t - 4, t - 4);
    }
    for (let k = 0; k < 30; k++) {
      x.strokeStyle = `rgba(90,90,100,${0.1 + rnd() * 0.2})`; x.lineWidth = 1 + rnd() * 2;
      x.beginPath(); let px = rnd() * s, py = rnd() * s; x.moveTo(px, py);
      for (let q = 0; q < 5; q++) { px += (rnd() - 0.5) * 120; py += (rnd() - 0.5) * 120; x.lineTo(px, py); } x.stroke();
    }
    blotches(x, s, s, rnd, 8, '0,0,0', 0.18);
    blotches(x, s, s, rnd, 3, '90,0,0', 0.45, 10, 40);
  }, { strength: 1.5, roughness: 0.18 });
}

export function asphalt() {
  return build((x, h, s) => {
    const rnd = rand(73);
    x.fillStyle = '#2c2c2e'; x.fillRect(0, 0, s, s);
    h.fillStyle = '#808080'; h.fillRect(0, 0, s, s);
    speckle(x, s, s, 30, rnd); speckle(h, s, s, 70, rnd);
    x.fillStyle = 'rgba(220,200,80,0.8)'; x.fillRect(s * 0.48, 0, 10, s * 0.45);
    blotches(x, s, s, rnd, 12, '0,0,0', 0.3);
  }, { strength: 1.8, roughness: 0.9 });
}

export function ceilingPanels() {
  return build((x, h, s) => {
    const rnd = rand(79);
    const n = 4, t = s / n;
    x.fillStyle = '#4a4a46'; x.fillRect(0, 0, s, s);
    h.fillStyle = '#303030'; h.fillRect(0, 0, s, s);
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const missing = rnd() < 0.08;
      x.fillStyle = missing ? '#121212' : `hsl(50, 6%, ${62 + rnd() * 8}%)`; x.fillRect(i * t + 3, j * t + 3, t - 6, t - 6);
      h.fillStyle = missing ? '#000' : '#b0b0b0'; h.fillRect(i * t + 3, j * t + 3, t - 6, t - 6);
    }
    speckle(x, s, s, 18, rnd);
    blotches(x, s, s, rnd, 10, '60,40,10', 0.35);
  }, { strength: 2, roughness: 0.95 });
}

export function metalCeiling() { return metalWall('#3a3e42', 83); }
