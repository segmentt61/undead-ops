// Procedurally painted canvas textures — no image assets needed.
import * as THREE from 'three';

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}

function rand(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

function noise(ctx, w, h, amount, rnd, dark = true) {
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (rnd() - 0.5) * amount;
    d[i] += n; d[i + 1] += n; d[i + 2] += n;
  }
  ctx.putImageData(img, 0, 0);
  if (dark) {
    for (let i = 0; i < 18; i++) {
      const x = rnd() * w, y = rnd() * h, r = 10 + rnd() * 50;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `rgba(0,0,0,${0.08 + rnd() * 0.12})`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
  }
}

function tex(c, repeat = true) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

export function brickTexture() {
  const [c, x] = canvas(256, 256);
  const rnd = rand(7);
  x.fillStyle = '#4a3f38';
  x.fillRect(0, 0, 256, 256);
  const bh = 256 / 8, bw = 256 / 4;
  for (let row = 0; row < 8; row++) {
    const off = row % 2 ? bw / 2 : 0;
    for (let col = -1; col < 5; col++) {
      const r = 120 + rnd() * 40, g = 58 + rnd() * 22, b = 44 + rnd() * 16;
      x.fillStyle = `rgb(${r | 0},${g | 0},${b | 0})`;
      x.fillRect(col * bw + off + 3, row * bh + 3, bw - 6, bh - 6);
    }
  }
  noise(x, 256, 256, 26, rnd);
  // grime towards the bottom
  const g = x.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(10,5,0,0.25)');
  x.fillStyle = g;
  x.fillRect(0, 0, 256, 256);
  return tex(c);
}

export function plasterTexture(base = '#6d6458') {
  const [c, x] = canvas(256, 256);
  const rnd = rand(11);
  x.fillStyle = base;
  x.fillRect(0, 0, 256, 256);
  noise(x, 256, 256, 22, rnd);
  x.strokeStyle = 'rgba(0,0,0,0.35)';
  x.lineWidth = 1.5;
  for (let i = 0; i < 6; i++) {
    x.beginPath();
    let px = rnd() * 256, py = rnd() * 256;
    x.moveTo(px, py);
    for (let j = 0; j < 6; j++) { px += (rnd() - 0.5) * 40; py += rnd() * 30; x.lineTo(px, py); }
    x.stroke();
  }
  return tex(c);
}

export function woodFloorTexture() {
  const [c, x] = canvas(256, 256);
  const rnd = rand(3);
  const pw = 256 / 6;
  for (let i = 0; i < 6; i++) {
    const l = 60 + rnd() * 25;
    x.fillStyle = `hsl(25, 45%, ${l / 3.2}%)`;
    x.fillRect(i * pw, 0, pw, 256);
    x.strokeStyle = 'rgba(0,0,0,0.12)';
    for (let k = 0; k < 14; k++) {
      x.beginPath();
      const gx = i * pw + rnd() * pw;
      x.moveTo(gx, 0);
      x.bezierCurveTo(gx + 4, 80, gx - 4, 170, gx + 2, 256);
      x.stroke();
    }
    x.fillStyle = 'rgba(0,0,0,0.6)';
    x.fillRect(i * pw, 0, 2, 256);
    x.fillRect(i * pw, (rnd() * 256) | 0, pw, 2);
  }
  noise(x, 256, 256, 16, rnd);
  return tex(c);
}

export function tileTexture(a = '#cfc6b4', b = '#2b2622') {
  const [c, x] = canvas(256, 256);
  const rnd = rand(5);
  const s = 64;
  for (let i = 0; i < 4; i++)
    for (let j = 0; j < 4; j++) {
      x.fillStyle = (i + j) % 2 ? a : b;
      x.fillRect(i * s, j * s, s, s);
    }
  x.strokeStyle = 'rgba(0,0,0,0.5)';
  x.lineWidth = 2;
  for (let i = 0; i <= 4; i++) { x.beginPath(); x.moveTo(i * s, 0); x.lineTo(i * s, 256); x.stroke(); x.beginPath(); x.moveTo(0, i * s); x.lineTo(256, i * s); x.stroke(); }
  noise(x, 256, 256, 30, rnd);
  // blood stains
  for (let i = 0; i < 3; i++) {
    x.fillStyle = `rgba(90,0,0,${0.2 + rnd() * 0.3})`;
    x.beginPath();
    x.ellipse(rnd() * 256, rnd() * 256, 10 + rnd() * 25, 6 + rnd() * 15, rnd() * 3, 0, Math.PI * 2);
    x.fill();
  }
  return tex(c);
}

export function concreteTexture(base = '#55524c') {
  const [c, x] = canvas(256, 256);
  const rnd = rand(9);
  x.fillStyle = base;
  x.fillRect(0, 0, 256, 256);
  noise(x, 256, 256, 30, rnd);
  x.strokeStyle = 'rgba(0,0,0,0.3)';
  x.lineWidth = 2;
  x.strokeRect(0, 0, 256, 256);
  return tex(c);
}

export function dirtTexture() {
  const [c, x] = canvas(256, 256);
  const rnd = rand(13);
  x.fillStyle = '#2a2a1e';
  x.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 900; i++) {
    x.fillStyle = rnd() < 0.5 ? `rgba(70,80,40,${rnd() * 0.5})` : `rgba(15,12,8,${rnd() * 0.6})`;
    x.fillRect(rnd() * 256, rnd() * 256, 2 + rnd() * 4, 2 + rnd() * 4);
  }
  noise(x, 256, 256, 18, rnd);
  return tex(c);
}

export function plankTexture() {
  const [c, x] = canvas(128, 32);
  const rnd = rand(17);
  x.fillStyle = '#7a5532';
  x.fillRect(0, 0, 128, 32);
  x.strokeStyle = 'rgba(40,20,5,0.45)';
  for (let i = 0; i < 8; i++) {
    x.beginPath();
    const y = rnd() * 32;
    x.moveTo(0, y);
    x.bezierCurveTo(40, y + 3, 80, y - 3, 128, y + 1);
    x.stroke();
  }
  x.fillStyle = '#222';
  x.fillRect(6, 13, 4, 4);
  x.fillRect(118, 13, 4, 4);
  noise(x, 128, 32, 20, rnd, false);
  return tex(c, false);
}

export function crateTexture() {
  const [c, x] = canvas(128, 128);
  const rnd = rand(21);
  x.fillStyle = '#8a6438';
  x.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 6; i++) { x.fillStyle = 'rgba(0,0,0,0.18)'; x.fillRect(0, i * 21.3, 128, 1.5); }
  x.strokeStyle = '#4e3418';
  x.lineWidth = 10;
  x.strokeRect(5, 5, 118, 118);
  x.beginPath(); x.moveTo(10, 10); x.lineTo(118, 118); x.stroke();
  noise(x, 128, 128, 24, rnd, false);
  return tex(c, false);
}

export function doorTexture() {
  const [c, x] = canvas(128, 256);
  const rnd = rand(23);
  x.fillStyle = '#4b3420';
  x.fillRect(0, 0, 128, 256);
  for (let i = 0; i < 5; i++) {
    x.fillStyle = `hsl(28, 40%, ${18 + rnd() * 10}%)`;
    x.fillRect(i * 25.6 + 1, 0, 24, 256);
  }
  x.fillStyle = '#2b2b2b';
  x.fillRect(0, 40, 128, 12);
  x.fillRect(0, 200, 128, 12);
  for (let i = 0; i < 6; i++) { x.fillStyle = '#888'; x.beginPath(); x.arc(10 + i * 21, 46, 3, 0, 7); x.fill(); x.beginPath(); x.arc(10 + i * 21, 206, 3, 0, 7); x.fill(); }
  noise(x, 128, 256, 24, rnd, true);
  return tex(c, false);
}

export function ceilingTexture() {
  const [c, x] = canvas(256, 256);
  const rnd = rand(29);
  x.fillStyle = '#211c19';
  x.fillRect(0, 0, 256, 256);
  x.fillStyle = '#3a2b20';
  for (let i = 0; i < 4; i++) x.fillRect(i * 64, 0, 18, 256);
  noise(x, 256, 256, 18, rnd);
  return tex(c);
}

export function metalTexture(base = '#5d6166') {
  const [c, x] = canvas(128, 128);
  const rnd = rand(31);
  x.fillStyle = base;
  x.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 128; i++) { x.fillStyle = `rgba(255,255,255,${rnd() * 0.05})`; x.fillRect(0, i, 128, 1); }
  noise(x, 128, 128, 14, rnd);
  return tex(c);
}

export function camoTexture() {
  const [c, x] = canvas(128, 128);
  const rnd = rand(37);
  x.fillStyle = '#2a0a4a';
  x.fillRect(0, 0, 128, 128);
  const cols = ['#7b2cff', '#1e8bff', '#ff3ad7', '#3a1070', '#00e5ff'];
  for (let i = 0; i < 46; i++) {
    x.fillStyle = cols[(rnd() * cols.length) | 0];
    x.beginPath();
    x.ellipse(rnd() * 128, rnd() * 128, 6 + rnd() * 18, 4 + rnd() * 10, rnd() * 3, 0, 7);
    x.fill();
  }
  return tex(c);
}

// A labelled glowing sign for perk machines etc.
export function signTexture(text, color, sub = '') {
  const [c, x] = canvas(256, 96);
  x.fillStyle = '#0d0d10';
  x.fillRect(0, 0, 256, 96);
  x.fillStyle = color;
  x.font = '30px "Black Ops One", Impact, sans-serif';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.shadowColor = color;
  x.shadowBlur = 14;
  const words = text.split(' ');
  if (words.length > 2) {
    x.font = '24px "Black Ops One", Impact, sans-serif';
    x.fillText(words.slice(0, 2).join(' '), 128, 34);
    x.fillText(words.slice(2).join(' '), 128, 64);
  } else {
    x.fillText(text, 128, sub ? 38 : 48);
  }
  if (sub) {
    x.font = '18px Rajdhani, sans-serif';
    x.fillStyle = '#fff';
    x.shadowBlur = 0;
    x.fillText(sub, 128, 74);
  }
  return tex(c, false);
}

// Chalk outline wall-buy drawing
export function chalkTexture(name, cost, silhouette) {
  const [c, x] = canvas(256, 192);
  x.clearRect(0, 0, 256, 192);
  x.strokeStyle = 'rgba(245,245,235,0.92)';
  x.fillStyle = 'rgba(245,245,235,0.92)';
  x.lineWidth = 4;
  x.lineCap = 'round';
  x.lineJoin = 'round';
  const rnd = rand(name.length * 99);
  const jitter = () => (rnd() - 0.5) * 3;
  x.save();
  x.translate(128, 78);
  x.beginPath();
  for (const shape of silhouette) {
    x.moveTo(shape[0][0] + jitter(), shape[0][1] + jitter());
    for (let i = 1; i < shape.length; i++) x.lineTo(shape[i][0] + jitter(), shape[i][1] + jitter());
  }
  x.stroke();
  x.restore();
  x.font = '30px "Permanent Marker", cursive';
  x.textAlign = 'center';
  x.fillText(name, 128, 150);
  x.font = '22px "Permanent Marker", cursive';
  x.fillText(String(cost), 128, 180);
  const t = tex(c, false);
  return t;
}

export function labelTexture(text, color = '#fff') {
  const [c, x] = canvas(256, 64);
  x.font = '700 34px Rajdhani, sans-serif';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.lineWidth = 6;
  x.strokeStyle = 'rgba(0,0,0,0.85)';
  x.strokeText(text, 128, 32);
  x.fillStyle = color;
  x.fillText(text, 128, 32);
  return tex(c, false);
}

export function glowTexture(color = '255,255,255') {
  const [c, x] = canvas(64, 64);
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, `rgba(${color},1)`);
  g.addColorStop(0.35, `rgba(${color},0.45)`);
  g.addColorStop(1, `rgba(${color},0)`);
  x.fillStyle = g;
  x.fillRect(0, 0, 64, 64);
  return tex(c, false);
}

export function powerupTexture(kind) {
  const [c, x] = canvas(128, 128);
  const g = x.createRadialGradient(64, 64, 10, 64, 64, 64);
  g.addColorStop(0, 'rgba(120,255,90,0.55)');
  g.addColorStop(1, 'rgba(60,255,40,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 128, 128);
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.shadowColor = '#5f5';
  x.shadowBlur = 16;
  if (kind === 'double') {
    x.font = '64px "Black Ops One", Impact';
    x.fillStyle = '#d9ffcc';
    x.fillText('x2', 64, 68);
  } else if (kind === 'maxammo') {
    x.fillStyle = '#d9ffcc';
    for (let i = 0; i < 3; i++) {
      const bx = 34 + i * 22;
      x.fillRect(bx, 50, 16, 40);
      x.beginPath(); x.moveTo(bx, 50); x.lineTo(bx + 8, 30); x.lineTo(bx + 16, 50); x.fill();
    }
  } else {
    const emoji = { insta: '💀', nuke: '💣', carpenter: '🔨' }[kind] || '?';
    x.font = '64px "Apple Color Emoji","Segoe UI Emoji",sans-serif';
    x.fillText(emoji, 64, 68);
  }
  return tex(c, false);
}

export const POWERUP_ICONS = { maxammo: '🔫', insta: '💀', double: '✖2', nuke: '💣', carpenter: '🔨' };
