// Builds the 3D map from the shared grid and drives all map-state visuals.
import * as THREE from 'three';
import { MAP, T, cellAt, zoneAt, WALL_HEIGHT, WINDOW_SILL, WINDOW_TOP, BOARDS_PER_WINDOW } from '/shared/map.js';
import { PERKS } from '/shared/config.js';
import { WEAPONS } from '/shared/weapons.js';
import * as TX from './textures.js';
import * as MD from './models.js';
import * as SF from './surfaces.js';
import { buildProps, realLoaded, realModel } from './props.js';
import { buildDecals } from './decals.js';
import { PBR, pbrSurface, worldUV } from './pbr.js';
import { goreCfg } from './entities.js';

// Surfaces are expensive to paint, so they are generated once and shared between rebuilds.
let SURF = null;
function surfaces() {
  if (!SURF) {
    SURF = {
      bricks: SF.bricks(), plaster: SF.plaster(), wood: SF.woodFloor(), tilesA: SF.tiles('#cbc2ae', '#2c2420'),
      tilesB: SF.tiles('#9fb3b8', '#252e33'), concA: SF.concrete('#5a554a', 9), concB: SF.concrete('#4b4e5a', 19),
      dirt: SF.dirt(), beams: SF.beams(), crate: SF.crate(), door: SF.door(), planks: SF.planks(),
    };
  }
  return SURF;
}
// Theme surfaces are painted lazily, only when a map uses them.
const LAZY = {
  concWall: () => SF.concreteWall(), plankWall: () => SF.plankWall(), stone: () => SF.stoneWall(),
  tileGreen: () => SF.tileWall('#d8ddd2', '#d8ddd2', 53), tileBlue: () => SF.tileWall('#dfe6ea', '#dfe6ea', 57),
  tileBaseGreen: () => SF.tileWall('#4f7a62', '#3a5a48', 54), tileBaseBlue: () => SF.tileWall('#4a6a8a', '#3a5470', 58),
  tilesC: () => SF.tiles('#c8d0c8', '#5a7a68'), plasterWall: () => SF.plasterWall(), metalWall: () => SF.metalWall(),
  labWall: () => SF.metalWall('#9aa2aa', 63), shopWall: () => SF.shopWall(), shopWall2: () => SF.shopWall('#d0c8b0', '#2a4a8a', 69),
  marble: () => SF.marble(), asphalt: () => SF.asphalt(), panels: () => SF.ceilingPanels(), metalCeil: () => SF.metalCeiling(),
  concCeil: () => SF.concreteWall('#4a4842', 89), darkBricks: () => SF.bricks(),
};
function surf(key) {
  if (PBR[key]) return pbrSurface(key);
  const S = surfaces();
  if (!S[key]) S[key] = LAZY[key] ? LAZY[key]() : S.bricks;
  return S[key];
}

// Visual style per room: wall/floor/ceiling surfaces, wall tint, wainscot and lamp type.
const STYLES = {
  theater:     { wall: 'bricksOld', tint: '#ffffff', floor: 'checker', ceil: 'planks', base: 'woodOld', baseTint: '#a08070', lamp: 'hanging' },
  theaterWood: { wall: 'bricksOld', tint: '#f2dcd0', floor: 'woodOld', ceil: 'planks', base: 'woodOld', baseTint: '#8a6a58', lamp: 'hanging' },
  dressing:    { wall: 'bricksOld', tint: '#dfe6f0', floor: 'stoneTiles', ceil: 'planks', base: 'woodOld', baseTint: '#8a7a70', lamp: 'hanging' },
  generator:   { wall: 'bricksB', tint: '#f0e6d0', floor: 'concrete', floorTint: '#9a9488', ceil: 'planks', lamp: 'cage' },
  projector:   { wall: 'bricksB', tint: '#e6dcf0', floor: 'concrete', floorTint: '#8a8890', ceil: 'planks', lamp: 'hanging' },
  bunker:      { wall: 'concrete', tint: '#d8d2c0', floor: 'concrete', floorTint: '#8a857a', ceil: 'concrete', ceilTint: '#6a665e', lamp: 'cage' },
  bunkerWood:  { wall: 'planks', tint: '#c8b8a0', floor: 'woodOld', ceil: 'planks', lamp: 'cage' },
  courtyard:   { wall: 'bricksB', tint: '#a8a8a4', floor: 'gravel', ceil: null, lamp: 'pole' },
  ward:        { wall: 'tilesDirty', tint: '#b8bcb2', floor: 'stoneTiles', floorTint: '#c8ccc0', ceil: 'ceiling', base: 'tilesDirty', baseTint: '#7fa08c', lamp: 'fluoro' },
  kitchen:     { wall: 'tilesWhite', tint: '#b4b6b0', floor: 'checker', ceil: 'ceiling', base: 'tilesWhite', baseTint: '#86a0b8', lamp: 'fluoro' },
  dining:      { wall: 'plaster', tint: '#b0a48c', floor: 'woodOld', ceil: 'planks', base: 'woodOld', baseTint: '#7a5a48', lamp: 'hanging' },
  showers:     { wall: 'tilesWhite', tint: '#aab2ba', floor: 'tilesDirty', floorTint: '#9a9c96', ceil: 'ceiling', base: 'tilesWhite', baseTint: '#6f88a4', lamp: 'fluoro' },
  warehouse:   { wall: 'corrugated', tint: '#c8ccd0', floor: 'concrete', floorTint: '#9a958a', ceil: 'corrugated', ceilTint: '#6a6e72', lamp: 'industrial' },
  factory:     { wall: 'bricksB', tint: '#c8b8a8', floor: 'concrete', floorTint: '#8f8a80', ceil: 'corrugated', ceilTint: '#5a5e62', lamp: 'industrial' },
  furnace:     { wall: 'bricksB', tint: '#e0a888', floor: 'concrete', floorTint: '#8a7a70', ceil: 'planks', lamp: 'cage' },
  lab:         { wall: 'tilesWhite', tint: '#b0b8bc', floor: 'checker', floorTint: '#d0d8d8', ceil: 'ceiling', lamp: 'fluoro' },
  atrium:      { wall: 'plaster', tint: '#bab4a8', floor: 'stoneTiles', ceil: null, lamp: 'pole' },
  shop:        { wall: 'plaster', tint: '#b0acb8', floor: 'stoneTiles', ceil: 'ceiling', lamp: 'fluoro' },
  foodcourt:   { wall: 'plaster', tint: '#c0b098', floor: 'checker', ceil: 'ceiling', lamp: 'fluoro' },
  store:       { wall: 'plaster', tint: '#b4b4b4', floor: 'stoneTiles', ceil: 'ceiling', lamp: 'fluoro' },
  parking:     { wall: 'concrete', tint: '#b8bcc0', floor: 'asphalt', ceil: 'concrete', ceilTint: '#6a6c70', lamp: 'fluoro' },
};
const styleOf = (room) => STYLES[room?.style] || STYLES.theater;

// a world-space-mapped material: one texture repeat covers `size` metres, seamless across cells
function worldMat(key, color) {
  const sf = surf(key);
  const k = 1 / (sf.size || 1);
  const m = SF.surfaceMaterial(sf, [k, k]);
  if (color) m.color.set(color);
  return worldUV(m);
}

export class World {
  constructor(scene, quality = { shadows: true, level: 'high' }) {
    this.scene = scene;
    this.quality = quality;
    this.openDoors = new Set();
    this.boards = MAP.windows.map(() => BOARDS_PER_WINDOW);
    this.power = false;
    this.anims = [];
    this.flickerLights = [];
    this.powered = [];
    this.time = 0;
    this.build();
  }

  build() {
    const s = this.scene;
    const th = MAP.theme || {};
    this.theme = th;
    s.background = new THREE.Color('#05060b');
    s.fog = new THREE.FogExp2(th.fog || '#0a0c14', th.fogDensity || 0.03);
    this.baseFog = th.fogDensity || 0.03;

    this.hemi = new THREE.HemisphereLight(th.hemiSky || '#7d8cb8', th.hemiGround || '#3a2a1c', th.bright ? 0.62 : 0.5);
    this.baseHemi = this.hemi.intensity;
    s.add(this.hemi);
    this.moon = new THREE.DirectionalLight('#7f95ff', 0.6);
    this.moon.position.set(-20, 40, 10);
    s.add(this.moon);
    this.buildSky();
    this.buildDust();

    this.buildFloors();
    this.buildWalls();
    this.buildWindows();
    this.buildDoors();
    this.buildCrates();
    this.buildLights();
    this.buildObjects();
    this.buildBox();
    buildProps(this.scene, MAP.props);
    // keep posters and blood off the wall-buys, perks and box spots
    const avoid = [];
    for (const o of MAP.objects) for (const d of [-1, 0, 1]) avoid.push([o.x + (o.face[1] ? d : 0), o.y + (o.face[0] ? d : 0)]);
    for (const b of MAP.boxLocs) for (const d of [-1, 0, 1]) avoid.push([b.x + (b.face[1] ? d : 0), b.y + (b.face[0] ? d : 0)]);
    buildDecals(this.scene, MAP, styleOf, { gore: goreCfg.level !== 'off', avoid });
    if (th.rain) this.buildRain();
  }

  buildRain() {
    const areas = MAP.rooms.filter((r) => r.outdoor);
    if (!areas.length) return;
    const n = 1400;
    const pos = new Float32Array(n * 6);
    this.rainData = [];
    for (let i = 0; i < n; i++) {
      const r = areas[i % areas.length];
      const x = r.x0 - 1 + Math.random() * (r.x1 - r.x0 + 3), z = r.y0 - 1 + Math.random() * (r.y1 - r.y0 + 3), y = Math.random() * 12;
      this.rainData.push({ x, z, y, v: 14 + Math.random() * 6 });
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.rain = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: '#9fb0c8', transparent: true, opacity: 0.35, depthWrite: false }));
    this.rain.frustumCulled = false;
    this.scene.add(this.rain);
  }

  buildFloors() {
    const s = this.scene;
    const SU = surfaces();
    const yard = new THREE.Mesh(new THREE.PlaneGeometry(MAP.w + 40, MAP.h + 40), worldMat('gravel', '#8a8680'));
    yard.rotation.x = -Math.PI / 2;
    yard.position.set(MAP.w / 2, -0.03, MAP.h / 2);
    yard.receiveShadow = true;
    s.add(yard);

    for (const r of MAP.rooms) {
      const st = styleOf(r);
      const w = r.x1 - r.x0 + 1, h = r.y1 - r.y0 + 1;
      const floor = new THREE.Mesh(new THREE.PlaneGeometry(w, h), worldMat(st.floor, st.floorTint));
      floor.rotation.x = -Math.PI / 2;
      floor.position.set(r.x0 + w / 2, 0, r.y0 + h / 2);
      floor.receiveShadow = true;
      s.add(floor);
      if (!st.ceil || r.outdoor) continue;
      const ceil = new THREE.Mesh(new THREE.PlaneGeometry(w, h), worldMat(st.ceil, st.ceilTint || '#9a968e'));
      ceil.rotation.x = Math.PI / 2;
      ceil.position.set(r.x0 + w / 2, WALL_HEIGHT, r.y0 + h / 2);
      ceil.receiveShadow = true;
      s.add(ceil);
    }
    const conc = worldMat('concrete', '#7a766e');
    conc.polygonOffset = true; conc.polygonOffsetFactor = -1; conc.polygonOffsetUnits = -1;
    for (const d of MAP.doors)
      for (const [x, y] of d.cells) {
        const f = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), conc);
        f.rotation.x = -Math.PI / 2;
        f.position.set(x + 0.5, 0.004, y + 0.5);
        f.receiveShadow = true;
        s.add(f);
      }
  }

  buildSky() {
    // gradient night sky with stars and a moon, visible through the windows
    const c = document.createElement('canvas');
    c.width = 1024; c.height = 512;
    const x = c.getContext('2d');
    const g = x.createLinearGradient(0, 0, 0, 512);
    g.addColorStop(0, '#02030a'); g.addColorStop(0.45, '#0b1030'); g.addColorStop(0.5, '#1a1a2e'); g.addColorStop(1, '#05060b');
    x.fillStyle = g; x.fillRect(0, 0, 1024, 512);
    for (let i = 0; i < 900; i++) {
      const a = Math.random();
      x.fillStyle = `rgba(255,255,255,${a * a * 0.9})`;
      x.fillRect(Math.random() * 1024, Math.random() * 240, a > 0.95 ? 2 : 1, a > 0.95 ? 2 : 1);
    }
    const mg = x.createRadialGradient(780, 90, 0, 780, 90, 90);
    mg.addColorStop(0, 'rgba(230,235,255,1)'); mg.addColorStop(0.18, 'rgba(220,228,255,0.95)'); mg.addColorStop(0.24, 'rgba(150,170,255,0.25)'); mg.addColorStop(1, 'rgba(80,100,200,0)');
    x.fillStyle = mg; x.fillRect(600, 0, 360, 220);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const sky = new THREE.Mesh(new THREE.SphereGeometry(150, 32, 16), new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, fog: false, depthWrite: false }));
    sky.position.set(MAP.w / 2, 0, MAP.h / 2);
    sky.renderOrder = -1;
    this.scene.add(sky);
  }

  buildDust() {
    const n = 360;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const r = MAP.rooms[i % MAP.rooms.length];
      pos[i * 3] = r.x0 + Math.random() * (r.x1 - r.x0 + 1);
      pos[i * 3 + 1] = Math.random() * 3.8;
      pos[i * 3 + 2] = r.y0 + Math.random() * (r.y1 - r.y0 + 1);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.dust = new THREE.Points(geo, new THREE.PointsMaterial({
      map: TX.glowTexture('255,230,190'), size: 0.03, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending, color: '#ffd9a8',
    }));
    this.dustBase = pos.slice();
    this.scene.add(this.dust);
  }

  buildWalls() {
    const groups = new Map(); // wall surface -> [[x, y, tint, base]]
    for (let y = 0; y < MAP.h; y++)
      for (let x = 0; x < MAP.w; x++) {
        if (cellAt(x, y) !== T.WALL) continue;
        let visible = false, zone = -1;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
          const t = cellAt(x + dx, y + dy);
          if (t !== T.WALL) {
            visible = true;
            const z = zoneAt(x + dx, y + dy);
            // shared walls take the indoor room's look
            if (z >= 0 && (zone < 0 || (MAP.rooms[zone].outdoor && !MAP.rooms[z].outdoor))) zone = z;
          }
        }
        if (!visible) continue;
        const st = styleOf(MAP.rooms[zone]);
        const key = zone < 0 ? 'bricksB' : st.wall;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push([x, y, zone < 0 ? '#8a8884' : st.tint, zone >= 0 && st.base ? `${st.base}|${st.baseTint || '#ffffff'}` : null]);
      }

    const geo = new THREE.BoxGeometry(1, WALL_HEIGHT, 1);
    const uv = geo.attributes.uv;
    for (const face of [0, 1, 4, 5]) for (let i = 0; i < 4; i++) uv.setY(face * 4 + i, uv.getY(face * 4 + i) * WALL_HEIGHT);
    this.wallMats = {};
    const m = new THREE.Matrix4();
    const c = new THREE.Color();
    const baseCells = [];
    for (const [key, cells] of groups) {
      const mat = worldMat(key);
      this.wallMats[key] = mat;
      const walls = new THREE.InstancedMesh(geo, mat, cells.length);
      walls.castShadow = walls.receiveShadow = true;
      cells.forEach(([x, y, tint, base], i) => {
        m.makeTranslation(x + 0.5, WALL_HEIGHT / 2, y + 0.5);
        walls.setMatrixAt(i, m);
        walls.setColorAt(i, c.set(tint));
        if (base) baseCells.push([x, y, base]);
      });
      this.scene.add(walls);
    }
    this.wallMat = this.wallMats[styleOf(MAP.rooms[0]).wall] || Object.values(this.wallMats)[0];
    if (baseCells.length) {
      const baseGeo = new THREE.BoxGeometry(1.03, 1.1, 1.03);
      const buv = baseGeo.attributes.uv;
      for (const face of [0, 1, 4, 5]) for (let i = 0; i < 4; i++) buv.setY(face * 4 + i, buv.getY(face * 4 + i) * 1.1);
      const byKind = new Map();
      for (const c of baseCells) { if (!byKind.has(c[2])) byKind.set(c[2], []); byKind.get(c[2]).push(c); }
      for (const [kind, cells] of byKind) {
        const [bkey, btint] = kind.split('|');
        const base = new THREE.InstancedMesh(baseGeo, worldMat(bkey, btint), cells.length);
        const trim = new THREE.InstancedMesh(new THREE.BoxGeometry(1.06, 0.08, 1.06), new THREE.MeshStandardMaterial({ color: bkey === 'woodOld' ? '#2a1b10' : '#2a3430', roughness: 0.5 }), cells.length);
        base.receiveShadow = true;
        cells.forEach(([x, y], i) => {
          m.makeTranslation(x + 0.5, 0.55, y + 0.5);
          base.setMatrixAt(i, m);
          m.makeTranslation(x + 0.5, 1.12, y + 0.5);
          trim.setMatrixAt(i, m);
        });
        this.scene.add(base, trim);
      }
    }
  }

  wallMatAt(x, y) {
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const z = zoneAt(x + dx, y + dy);
      if (z >= 0) return this.wallMats[styleOf(MAP.rooms[z]).wall] || this.wallMat;
    }
    return this.wallMat;
  }

  buildWindows() {
    this.windowGroups = [];
    const plankMat = SF.surfaceMaterial(surf('planks'), [0.57, 0.085]);
    const frameMat = new THREE.MeshStandardMaterial({ color: '#3a2a1c', roughness: 0.6 });
    const bottomGeo = new THREE.BoxGeometry(1, WINDOW_SILL, 1);
    const topGeo = new THREE.BoxGeometry(1, WALL_HEIGHT - WINDOW_TOP, 1);
    for (const w of MAP.windows) {
      const g = new THREE.Group();
      g.position.set(w.x + 0.5, 0, w.y + 0.5);
      // rotate so local +z points outside
      g.rotation.y = Math.atan2(w.dir[0], w.dir[1]);
      this.scene.add(g);
      const brick = this.wallMatAt(w.x, w.y);
      const b = new THREE.Mesh(bottomGeo, brick); b.position.y = WINDOW_SILL / 2; g.add(b);
      const t = new THREE.Mesh(topGeo, brick); t.position.y = (WALL_HEIGHT + WINDOW_TOP) / 2; g.add(t);
      const sill = new THREE.Mesh(MD.boxGeo(1.05, 0.08, 1.05), frameMat); sill.position.y = WINDOW_SILL; g.add(sill);
      const lintel = new THREE.Mesh(MD.boxGeo(1.05, 0.08, 1.05), frameMat); lintel.position.y = WINDOW_TOP; g.add(lintel);
      const planks = [];
      for (let i = 0; i < BOARDS_PER_WINDOW; i++) {
        const p = new THREE.Mesh(MD.boxGeo(1.15, 0.17, 0.05), plankMat);
        p.castShadow = true;
        const h = WINDOW_SILL + 0.18 + (i / (BOARDS_PER_WINDOW - 1)) * (WINDOW_TOP - WINDOW_SILL - 0.36);
        const home = { y: h, z: -0.38 + (i % 2) * 0.04, rz: (i % 2 ? 1 : -1) * (0.12 + ((i * 37) % 10) / 60) };
        p.position.set(0, home.y, home.z);
        p.rotation.z = home.rz;
        p.userData.home = home;
        g.add(p);
        planks.push(p);
      }
      this.windowGroups.push({ g, planks });
    }
  }

  setBoards(winId, n, animate = true) {
    const prev = this.boards[winId];
    this.boards[winId] = n;
    const wg = this.windowGroups[winId];
    wg.planks.forEach((p, i) => {
      const shouldShow = i < n;
      const home = p.userData.home;
      if (shouldShow && !p.visible && animate) {
        p.visible = true;
        this.animate(0.25, (k) => {
          p.position.set(0, home.y - (1 - k) * 0.8, home.z - (1 - k) * 0.8);
          p.rotation.set((1 - k) * 1.2, 0, home.rz);
        });
      } else if (!shouldShow && p.visible && animate && i === n) {
        const spin = (Math.random() - 0.5) * 6;
        this.animate(0.7, (k) => {
          p.position.set(Math.sin(k * 3) * 0.2, home.y + k * 0.6 - k * k * 2.2, home.z + k * 1.8);
          p.rotation.set(k * spin, k * 2, home.rz + k * spin);
        }, () => { p.visible = false; p.position.set(0, home.y, home.z); p.rotation.set(0, 0, home.rz); });
      } else {
        p.visible = shouldShow;
        if (shouldShow) { p.position.set(0, home.y, home.z); p.rotation.set(0, 0, home.rz); }
      }
    });
    return prev;
  }

  buildDoors() {
    this.doorGroups = new Map();
    const doorMat = SF.surfaceMaterial(surfaces().door, [1, 1]);
    for (const d of MAP.doors) {
      const lintelMat = this.wallMatAt(d.cells[0][0], d.cells[0][1]);
      const horiz = d.cells.every((c) => c[1] === d.cells[0][1]);
      const sorted = [...d.cells].sort((a, b) => (horiz ? a[0] - b[0] : a[1] - b[1]));
      const panels = [];
      sorted.forEach(([x, y], i) => {
        const lintel = new THREE.Mesh(MD.boxGeo(1, 1, 1), lintelMat);
        lintel.position.set(x + 0.5, 3.5, y + 0.5);
        this.scene.add(lintel);
        const left = i === 0;
        const hinge = new THREE.Group();
        // hinge at the outer edge of the opening
        if (horiz) hinge.position.set(left ? x : x + 1, 0, y + 0.5);
        else hinge.position.set(x + 0.5, 0, left ? y : y + 1);
        const panel = new THREE.Mesh(MD.boxGeo(horiz ? 1 : 0.22, 3, horiz ? 0.22 : 1), doorMat);
        if (horiz) panel.position.set(left ? 0.5 : -0.5, 1.5, 0);
        else panel.position.set(0, 1.5, left ? 0.5 : -0.5);
        panel.castShadow = panel.receiveShadow = true;
        hinge.add(panel);
        this.scene.add(hinge);
        panels.push({ hinge, left });
      });
      this.doorGroups.set(d.id, { panels, horiz });
    }
  }

  setDoorOpen(id, animate = true) {
    if (this.openDoors.has(id)) return;
    this.openDoors.add(id);
    const dg = this.doorGroups.get(id);
    for (const { hinge, left } of dg.panels) {
      const target = (left ? 1 : -1) * (Math.PI / 2 - 0.05) * (dg.horiz ? -1 : 1);
      if (animate) this.animate(0.7, (k) => { hinge.rotation.y = target * (1 - Math.pow(1 - k, 3)); });
      else hinge.rotation.y = target;
    }
  }

  buildCrates() {
    if (realLoaded()) return; // scanned crates come with the props
    const list = [];
    for (const p of MAP.props) if (p.kind === 'crate') list.push([p.x, p.y]);
    const im = new THREE.InstancedMesh(MD.boxGeo(0.98, 0.98, 0.98), SF.surfaceMaterial(surfaces().crate, [1, 1]), list.length);
    im.castShadow = im.receiveShadow = true;
    const m = new THREE.Matrix4();
    list.forEach(([x, y], i) => {
      m.makeRotationY(((x * 7 + y * 13) % 5) * 0.03);
      m.setPosition(x + 0.5, 0.49, y + 0.5);
      im.setMatrixAt(i, m);
    });
    this.scene.add(im);
  }

  buildLights() {
    this.roomLights = [];
    const shadeMat = new THREE.MeshStandardMaterial({ color: '#2c3a2c', metalness: 0.6, roughness: 0.4, side: THREE.DoubleSide });
    const shadeGeo = new THREE.ConeGeometry(0.42, 0.32, 16, 1, true);
    const bulbGeo = new THREE.SphereGeometry(0.1, 12, 8);
    const coneGeo = new THREE.ConeGeometry(2.3, 3.4, 24, 1, true);
    coneGeo.translate(0, -1.7, 0);
    const coneTex = (() => {
      const c = document.createElement('canvas'); c.width = 4; c.height = 128;
      const x = c.getContext('2d'); const g = x.createLinearGradient(0, 0, 0, 128);
      g.addColorStop(0, 'rgba(255,255,255,0.0)'); g.addColorStop(0.08, 'rgba(255,255,255,0.7)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = g; x.fillRect(0, 0, 4, 128);
      return new THREE.CanvasTexture(c);
    })();
    const tubeGeo = new THREE.BoxGeometry(1.2, 0.06, 0.16);
    const tubeHousing = new THREE.MeshStandardMaterial({ color: '#8a8e92', metalness: 0.5, roughness: 0.4 });
    const domeGeo = new THREE.SphereGeometry(0.5, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2);
    const cageGeo = new THREE.CylinderGeometry(0.16, 0.2, 0.26, 8, 1, true);
    const cageMat = new THREE.MeshStandardMaterial({ color: '#2a2a2a', metalness: 0.7, roughness: 0.5, wireframe: true });
    const poleGeo = new THREE.CylinderGeometry(0.06, 0.08, 4.4, 8);
    for (const r of MAP.rooms) {
      const st = styleOf(r);
      const w = r.x1 - r.x0 + 1, h = r.y1 - r.y0 + 1;
      const count = r.lights || 1;
      const lamp = r.outdoor ? 'pole' : st.lamp;
      const emissive = new THREE.Color(r.light).lerp(new THREE.Color('#fff'), 0.5);
      // decorative fluorescent tubes across the ceiling (emissive only, no real light)
      const real = realLoaded();
      const placeReal = (name, x, y, z, ry = 0) => {
        const mdl = realModel(name);
        if (!mdl) return null;
        mdl.position.set(x, y, z);
        mdl.rotation.y = ry;
        this.scene.add(mdl);
        return mdl;
      };
      if (lamp === 'fluoro') {
        const tubeMat = new THREE.MeshStandardMaterial({ color: '#000', emissive, emissiveIntensity: 1.4 });
        for (let ty = r.y0 + 2; ty <= r.y1 - 1; ty += 4)
          for (let tx = r.x0 + 2; tx <= r.x1 - 1; tx += 4) {
            const dead = Math.random() < 0.15;
            if (real) {
              placeReal('mounted_fluorescent_lights', tx, WALL_HEIGHT, ty);
              const glow = new THREE.Mesh(tubeGeo, dead ? tubeHousing : tubeMat);
              glow.scale.set(0.62, 0.4, 0.5);
              glow.position.set(tx, WALL_HEIGHT - 0.035, ty);
              this.scene.add(glow);
              continue;
            }
            const tube = new THREE.Mesh(tubeGeo, dead ? tubeHousing : tubeMat);
            tube.position.set(tx, WALL_HEIGHT - 0.04, ty);
            this.scene.add(tube);
          }
      }
      for (let i = 0; i < count; i++) {
        const along = w >= h;
        const fx = along ? (i + 0.5) / count : 0.5, fy = along ? 0.5 : (i + 0.5) / count;
        const ceilY = r.outdoor ? 4.4 : WALL_HEIGHT;
        const pos = new THREE.Vector3(r.x0 + w * fx, ceilY - 0.75, r.y0 + h * fy);
        if (lamp === 'pole') {
          // lamp post standing in an outdoor area, nudged off the walking line
          pos.x = r.x0 + w * fx + (i % 2 ? 1.5 : -1.5);
          if (cellAt(Math.floor(pos.x), Math.floor(pos.z)) !== T.FLOOR) pos.x = r.x0 + w * fx;
        }
        // lamps are data only; a small pool of real lights follows the nearest ones (see update)
        const light = { position: new THREE.Vector3(), intensity: 0, distance: r.outdoor ? 20 : 24 };
        light.position.copy(pos).y -= 0.12;
        const bulbMat = new THREE.MeshStandardMaterial({ color: '#000', emissive, emissiveIntensity: 6 });
        let bulbMesh = new THREE.Mesh(bulbGeo, bulbMat);
        bulbMesh.position.copy(pos).y -= 0.12;
        let coneOpacity = 0.04;
        if (real && (lamp === 'hanging' || lamp === 'industrial')) {
          // scanned industrial pendant hanging from the ceiling, bulb inside its shade
          placeReal('hanging_industrial_lamp', pos.x, ceilY, pos.z);
          pos.y = ceilY - 1.24;
          light.position.copy(pos).y -= 0.1;
          bulbMesh.position.copy(pos);
          bulbMesh.scale.setScalar(0.8);
          coneOpacity = 0.05;
        } else if (real && lamp === 'cage') {
          placeReal('caged_hanging_light', pos.x, ceilY, pos.z, Math.random() * Math.PI);
          pos.y = ceilY - 0.62;
          light.position.copy(pos).y -= 0.1;
          bulbMesh.position.copy(pos);
          bulbMesh.scale.setScalar(0.8);
          coneOpacity = 0;
        } else if (real && lamp === 'fluoro') {
          placeReal('mounted_fluorescent_lights', pos.x, ceilY, pos.z);
          bulbMesh = new THREE.Mesh(tubeGeo, bulbMat);
          bulbMesh.scale.set(0.62, 0.4, 0.5);
          pos.y = ceilY - 0.035;
          bulbMesh.position.copy(pos);
          light.position.copy(pos).y -= 0.25;
          coneOpacity = 0;
        } else if (real && lamp === 'pole') {
          placeReal('street_lamp_01', pos.x, 0, pos.z);
          bulbMesh = new THREE.Mesh(MD.boxGeo(0.3, 0.04, 0.2), bulbMat);
          pos.y = 3.72;
          bulbMesh.position.copy(pos);
          light.position.set(pos.x, 3.55, pos.z);
          coneOpacity = 0.03;
        } else if (lamp === 'hanging') {
          const shade = new THREE.Mesh(shadeGeo, shadeMat);
          shade.position.copy(pos).y += 0.05;
          const cord = new THREE.Mesh(MD.boxGeo(0.02, 0.6, 0.02), MD.mat('#111'));
          cord.position.copy(pos).y += 0.45;
          this.scene.add(shade, cord);
        } else if (lamp === 'industrial') {
          const dome = new THREE.Mesh(domeGeo, shadeMat);
          dome.position.copy(pos).y += 0.12;
          const cord = new THREE.Mesh(MD.boxGeo(0.03, 0.55, 0.03), MD.mat('#111'));
          cord.position.copy(pos).y += 0.5;
          this.scene.add(dome, cord);
          coneOpacity = 0.05;
        } else if (lamp === 'cage') {
          pos.y = ceilY - 0.25;
          light.position.copy(pos).y -= 0.1;
          bulbMesh.position.copy(pos);
          const cage = new THREE.Mesh(cageGeo, cageMat);
          cage.position.copy(pos);
          this.scene.add(cage);
          coneOpacity = 0;
        } else if (lamp === 'fluoro') {
          bulbMesh = new THREE.Mesh(tubeGeo, bulbMat);
          pos.y = ceilY - 0.05;
          bulbMesh.position.copy(pos);
          light.position.copy(pos).y -= 0.25;
          coneOpacity = 0;
        } else if (lamp === 'pole') {
          const pole = new THREE.Mesh(poleGeo, MD.mat('#26282a'));
          pole.position.set(pos.x, 2.2, pos.z);
          const head = new THREE.Mesh(MD.boxGeo(0.5, 0.12, 0.3), MD.mat('#26282a'));
          head.position.set(pos.x, 4.4, pos.z);
          bulbMesh = new THREE.Mesh(MD.boxGeo(0.4, 0.04, 0.22), bulbMat);
          pos.y = 4.32;
          bulbMesh.position.copy(pos);
          light.position.set(pos.x, 4.1, pos.z);
          this.scene.add(pole, head);
          coneOpacity = 0.03;
        }
        this.scene.add(bulbMesh);
        const coneMat = new THREE.MeshBasicMaterial({ color: r.light, map: coneTex, transparent: true, opacity: coneOpacity, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
        if (coneOpacity > 0) {
          const cone = new THREE.Mesh(coneGeo, coneMat);
          cone.position.copy(pos).y -= 0.05;
          this.scene.add(cone);
        }
        const flickerChance = this.theme.flicker ?? 0.5;
        // fluorescent rooms are white-tiled and bounce a lot of light, so their lamps run dimmer
        const scale = lamp === 'fluoro' ? 0.55 : lamp === 'pole' ? 0.8 : 1;
        this.roomLights.push({ light, bulb: bulbMat, cone: coneMat, coneBase: coneOpacity, scale, base: 9 * scale, flicker: Math.random() < flickerChance, pos, color: new THREE.Color(r.light), shadowed: false });
      }
    }
    // A fixed pool of real point lights is handed to the lamps nearest the camera. The light count
    // never changes (no shader recompiles) and stays small, which is what phones need most.
    // Pool light 0 always takes the nearest lamp and is the only one that casts shadows.
    this.pool = [];
    const n = Math.min(this.quality.lights || 6, this.roomLights.length);
    for (let i = 0; i < n; i++) {
      const pl = new THREE.PointLight('#ffffff', 0, 24, 1.15);
      if (i === 0 && this.quality.shadows) {
        pl.castShadow = true;
        pl.shadow.mapSize.set(1024, 1024);
        pl.shadow.bias = -0.004;
        pl.shadow.normalBias = 0.02;
        pl.shadow.camera.near = 0.2;
        pl.shadow.camera.far = 24;
        // the shadow casters are static, so only re-render the shadow map when something changes
        pl.shadow.autoUpdate = false;
        pl.shadow.needsUpdate = true;
      }
      this.scene.add(pl);
      this.pool.push({ light: pl, lamp: null, fade: 0 });
    }
    this.shadowLight = this.quality.shadows && this.pool[0] ? this.pool[0].light : null;
    for (const l of this.roomLights) l.light.intensity = l.base;
  }

  buildObjects() {
    this.objects = [];
    for (const o of MAP.objects) {
      const cx = o.x + 0.5, cz = o.y + 0.5;
      const [fx, fy] = o.face;
      const rotY = Math.atan2(-fx, -fy);
      let model = null;
      if (o.type === 'perk') {
        model = MD.createPerkMachine(o.perk, PERKS[o.perk]);
        model.position.set(cx + fx * 0.1, 0, cz + fy * 0.1);
        model.rotation.y = rotY;
        this.powered.push(model);
        if (!PERKS[o.perk].power) model.userData.setPower(true);
      } else if (o.type === 'pap') {
        model = MD.createPapMachine();
        model.position.set(cx + fx * 0.02, 0, cz + fy * 0.02);
        model.rotation.y = rotY;
        this.pap = model;
        this.powered.push(model);
      } else if (o.type === 'power') {
        model = MD.createPowerSwitch();
        model.position.set(cx + fx * 0.4, 0, cz + fy * 0.4);
        model.rotation.y = rotY;
        this.powerSwitch = model;
      } else if (o.type === 'wall') {
        const wd = WEAPONS[o.weapon];
        const sil = wd.cls === 'shotgun' ? MD.CHALK.shotgun : wd.cls === 'smg' ? MD.CHALK.smg : MD.CHALK.rifle;
        const t = TX.chalkTexture(wd.name, wd.cost, sil);
        model = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.125), new THREE.MeshLambertMaterial({ map: t, transparent: true, depthWrite: false, emissive: '#ffffff', emissiveMap: t, emissiveIntensity: 0.15 }));
        model.position.set(cx + fx * 0.48, 1.55, cz + fy * 0.48);
        model.rotation.y = rotY;
        // small floating gun in the chalk outline
        const gun = MD.createGun(o.weapon).group;
        gun.scale.setScalar(1.4);
        gun.rotation.y = Math.PI / 2;
        gun.position.set(0, 0.12, 0.08);
        model.add(gun);
      }
      if (model) {
        model.traverse((o) => { if (o.isMesh && o.material && !o.material.transparent) { o.castShadow = true; o.receiveShadow = true; } });
        this.scene.add(model);
        this.objects.push({ o, model });
      }
    }
  }

  buildBox() {
    this.box = MD.createMysteryBox();
    this.scene.add(this.box);
    this.boxLoc = -1;
    this.boxState = 'idle';
    this.boxFloat = null;
    this.setBoxLoc(0);
  }

  setBoxLoc(loc) {
    this.boxLoc = loc;
    const b = MAP.boxLocs[loc];
    const [fx, fy] = b.face;
    this.box.position.set(b.x + 0.5 + fx * 0.12, 0, b.y + 0.5 + fy * 0.12);
    this.box.rotation.y = Math.atan2(-fx, -fy);
    this.box.visible = true;
    this.box.userData.beam.visible = true;
    this.box.userData.lid.rotation.x = 0;
  }

  boxCollider() {
    if (!this.box || !this.box.visible || this.boxLoc < 0) return null;
    const b = MAP.boxLocs[this.boxLoc];
    const cx = b.x + 0.5 + b.face[0] * 0.12, cz = b.y + 0.5 + b.face[1] * 0.12;
    const along = b.face[1] !== 0; // box runs along x when it faces north/south
    const hw = along ? 0.8 : 0.35, hd = along ? 0.35 : 0.8;
    return { x0: cx - hw, x1: cx + hw, z0: cz - hd, z1: cz + hd };
  }

  boxWorldPos() {
    const b = MAP.boxLocs[this.boxLoc];
    return new THREE.Vector3(b.x + 0.5, 0, b.y + 0.5);
  }

  clearBoxFloat() {
    if (this.boxFloat) { this.box.remove(this.boxFloat); this.boxFloat = null; }
  }

  setBoxFloat(model) {
    this.clearBoxFloat();
    this.boxFloat = model;
    this.box.add(model);
  }

  boxSpin(finalWeapon, teddy) {
    this.boxState = 'spin';
    const lid = this.box.userData.lid;
    this.animate(0.35, (k) => { lid.rotation.x = -1.3 * k; });
    const ids = Object.keys(WEAPONS);
    let elapsed = 0, nextSwap = 0;
    const holder = new THREE.Group();
    this.setBoxFloat(holder);
    const dur = 3.6;
    this.animate(dur, (k, dt) => {
      elapsed += dt;
      holder.position.set(0, 0.6 + k * 0.6, 0);
      holder.rotation.y = 0;
      if (elapsed >= nextSwap && k < 0.97) {
        nextSwap = elapsed + 0.06 + k * k * 0.35;
        holder.clear();
        const id = ids[Math.floor(Math.random() * ids.length)];
        const gun = MD.createGun(id).group;
        gun.rotation.y = Math.PI / 2;
        gun.scale.setScalar(1.3);
        holder.add(gun);
      }
    }, () => {
      holder.clear();
      if (teddy) holder.add(MD.createTeddy());
      else {
        const gun = MD.createGun(finalWeapon).group;
        gun.rotation.y = Math.PI / 2;
        gun.scale.setScalar(1.3);
        holder.add(gun);
      }
    });
  }

  boxOffer() {
    this.boxState = 'offer';
    const holder = this.boxFloat;
    if (!holder) return;
    this.animate(10, (k) => { if (this.boxFloat === holder) holder.position.y = 1.2 - k * 0.6; });
  }

  boxClose() {
    this.boxState = 'idle';
    this.clearBoxFloat();
    const lid = this.box.userData.lid;
    const start = lid.rotation.x;
    this.animate(0.3, (k) => { lid.rotation.x = start * (1 - k); });
  }

  boxTeddy() {
    this.boxState = 'leaving';
    const holder = this.boxFloat;
    this.animate(3.4, (k) => {
      if (holder) holder.position.y = 1.2 + k * 1.5;
      this.box.position.y = k > 0.5 ? (k - 0.5) * 6 : Math.sin(k * 60) * 0.03;
      this.box.rotation.z = k > 0.5 ? Math.sin(k * 30) * 0.1 : 0;
    }, () => {
      this.clearBoxFloat();
      this.box.visible = false;
      this.box.position.y = 0;
      this.box.rotation.z = 0;
    });
  }

  boxGone() {
    this.boxState = 'away';
    this.box.visible = false;
  }

  boxMove(loc) {
    this.boxState = 'idle';
    this.setBoxLoc(loc);
    this.box.position.y = 6;
    const y0 = 6;
    this.animate(1.0, (k) => { this.box.position.y = y0 * (1 - k * k); });
  }

  assignPool(camPos) {
    const ranked = [...this.roomLights].sort((a, b) => a.pos.distanceToSquared(camPos) - b.pos.distanceToSquared(camPos)).slice(0, this.pool.length);
    const keep = new Set(ranked);
    const owner = new Map();
    for (const p of this.pool) if (p.lamp && keep.has(p.lamp)) owner.set(p.lamp, p);
    const free = this.pool.filter((p) => !p.lamp || !keep.has(p.lamp));
    const bind = (p, lamp, fadeIn) => {
      p.lamp = lamp;
      if (fadeIn) p.fade = 0;
      p.light.position.copy(lamp.light.position);
      p.light.color.copy(lamp.color);
      p.light.distance = lamp.light.distance;
    };
    for (const lamp of ranked) if (!owner.has(lamp)) { const p = free.shift(); bind(p, lamp, true); owner.set(lamp, p); }
    // the shadow caster always sits on the nearest lamp
    if (this.shadowLight && ranked[0]) {
      const p0 = this.pool[0], holder = owner.get(ranked[0]);
      if (holder !== p0) {
        const other = p0.lamp;
        bind(p0, ranked[0], false);
        if (other) bind(holder, other, false);
        p0.light.shadow.needsUpdate = true;
      }
    }
  }

  setPower(on, animate = true) {
    this.power = on;
    for (const m of this.powered) m.userData.setPower(on);
    if (this.powerSwitch) this.powerSwitch.userData.setPower(on);
    const apply = (k) => {
      for (const l of this.roomLights) {
        l.base = (9 + 7 * k) * l.scale;
        l.light.intensity = l.shadowed ? 0 : l.base;
        l.cone.opacity = l.coneBase * (1 + 0.7 * k);
      }
      this.hemi.intensity = this.baseHemi + 0.2 * k;
      this.scene.fog.density = this.baseFog * (1 - 0.25 * k);
    };
    if (animate) this.animate(2.5, (k) => apply(k * (0.6 + 0.4 * Math.random())), () => apply(1));
    else apply(on ? 1 : 0);
  }

  animate(duration, fn, done) {
    this.anims.push({ t: 0, duration, fn, done });
  }

  update(dt, papBusy, camPos) {
    this.time += dt;
    if (camPos && this.pool.length) {
      this.poolPick = (this.poolPick || 0) - dt;
      if (this.poolPick <= 0) {
        this.poolPick = 0.3;
        this.assignPool(camPos);
      }
    }
    if (this.rain) {
      const a = this.rain.geometry.attributes.position.array;
      this.rainData.forEach((d, i) => {
        d.y -= d.v * dt;
        if (d.y < 0) d.y += 12;
        a[i * 6] = d.x; a[i * 6 + 1] = d.y; a[i * 6 + 2] = d.z;
        a[i * 6 + 3] = d.x + 0.02; a[i * 6 + 4] = d.y + 0.45; a[i * 6 + 5] = d.z;
      });
      this.rain.geometry.attributes.position.needsUpdate = true;
    }
    if (this.dust) {
      const a = this.dust.geometry.attributes.position;
      const t = this.time;
      for (let i = 0; i < a.count; i++) {
        a.array[i * 3] = this.dustBase[i * 3] + Math.sin(t * 0.13 + i) * 0.4;
        a.array[i * 3 + 1] = (this.dustBase[i * 3 + 1] + t * 0.03 * ((i % 5) - 2) * 0.3 + 40) % 3.9;
        a.array[i * 3 + 2] = this.dustBase[i * 3 + 2] + Math.cos(t * 0.11 + i * 1.3) * 0.4;
      }
      a.needsUpdate = true;
    }
    if (this.anims.length && this.shadowLight) this.shadowLight.shadow.needsUpdate = true;
    for (let i = this.anims.length - 1; i >= 0; i--) {
      const a = this.anims[i];
      a.t += dt;
      const k = Math.min(1, a.t / a.duration);
      a.fn(k, dt);
      if (k >= 1) {
        this.anims.splice(i, 1);
        if (a.done) a.done();
      }
    }
    // flickering lights (only before power)
    for (const l of this.roomLights) {
      const f = !l.flicker || this.power ? 1 : (Math.sin(this.time * 13 + l.pos.x) > 0.93 || Math.random() < 0.015 ? 0.12 : 1);
      const target = l.base * f;
      l.current = target;
      l.bulb.emissiveIntensity = 6 * f;
    }
    for (const p of this.pool) {
      p.fade = Math.min(1, p.fade + dt * 3);
      p.light.intensity = p.lamp ? (p.lamp.current ?? p.lamp.base) * p.fade : 0;
    }
    if (this.pap) this.pap.userData.update(dt, papBusy);
    const beam = this.box.userData.beam;
    beam.material.opacity = 0.14 + Math.sin(this.time * 2) * 0.05;
    if (this.boxFloat && this.boxState === 'offer') this.boxFloat.rotation.y += dt * 0.6;
    MD.animatePap(dt);
  }
}
