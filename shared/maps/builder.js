// Map builder: maps are described as rooms, doors, windows and props, then validated.
// One grid cell = 1 metre. Grid x -> world x, grid y -> world z.

export const T = { FLOOR: 0, WALL: 1, WINDOW: 2, DOOR: 3, CRATE: 4, YARD: 5, BLOCK: 6 };
export const WALL_HEIGHT = 4;
export const CRATE_HEIGHT = 1;
export const WINDOW_SILL = 0.7;
export const WINDOW_TOP = 2.5;
export const BOARDS_PER_WINDOW = 6;

const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];

export class MapBuilder {
  /** All coordinates passed to the builder are shifted by (ox, oy). */
  constructor(id, name, w, h, ox = 3, oy = 3) {
    Object.assign(this, { id, name, w, h, ox, oy });
    this.grid = new Uint8Array(w * h).fill(T.WALL);
    this.zone = new Int8Array(w * h).fill(-1);
    this.rooms = [];
    this.doors = [];
    this.windows = [];
    this.objects = [];
    this.boxLocs = [];
    this.props = [];
    this.playerSpawns = [];
    this.theme = {};
  }

  i(x, y) { return y * this.w + x; }
  get(x, y) { return x < 0 || y < 0 || x >= this.w || y >= this.h ? T.WALL : this.grid[this.i(x, y)]; }
  set(x, y, t) { this.grid[this.i(x, y)] = t; }
  A(x, y) { return [x + this.ox, y + this.oy]; }

  room(key, name, x0, y0, x1, y1, opts = {}) {
    const id = this.rooms.length;
    const [ax0, ay0] = this.A(x0, y0), [ax1, ay1] = this.A(x1, y1);
    this.rooms.push({ id, key, name, x0: ax0, y0: ay0, x1: ax1, y1: ay1, style: opts.style || 'theater', light: opts.light ?? 0xffb070, outdoor: !!opts.outdoor, lights: opts.lights });
    for (let y = ay0; y <= ay1; y++)
      for (let x = ax0; x <= ax1; x++) {
        this.set(x, y, T.FLOOR);
        this.zone[this.i(x, y)] = id;
      }
    return id;
  }

  door(cost, cells) {
    const id = this.doors.length + 1;
    const abs = cells.map(([x, y]) => this.A(x, y));
    for (const [x, y] of abs) this.set(x, y, T.DOOR);
    this.doors.push({ id, cost, cells: abs, zones: [] });
  }

  win(x, y, dx, dy) {
    const [ax, ay] = this.A(x, y);
    this.set(ax, ay, T.WINDOW);
    const px = dy !== 0 ? 1 : 0, py = dx !== 0 ? 1 : 0;
    const spawnCells = [];
    for (let d = 1; d <= 3; d++)
      for (let s = -1; s <= 1; s++) {
        const cx = ax + dx * d + px * s, cy = ay + dy * d + py * s;
        if (this.get(cx, cy) === T.WALL) this.set(cx, cy, T.YARD);
        if (d >= 2) spawnCells.push([cx, cy]);
      }
    this.windows.push({ id: this.windows.length, x: ax, y: ay, dir: [dx, dy], zone: -1, inside: [ax - dx, ay - dy], outside: [ax + dx, ay + dy], spawnCells });
  }

  /** Low (jumpable, 1 m) obstacle. size: [w, h] in cells. */
  crate(x, y, kind = 'crate', size = [1, 1], rot = 0) {
    const [ax, ay] = this.A(x, y);
    for (let j = 0; j < size[1]; j++) for (let i = 0; i < size[0]; i++) this.set(ax + i, ay + j, T.CRATE);
    this.props.push({ kind, x: ax, y: ay, w: size[0], h: size[1], rot, low: true });
  }

  /** Tall solid obstacle (pillar, shelf, machine…). */
  block(x, y, kind = 'pillar', size = [1, 1], rot = 0) {
    const [ax, ay] = this.A(x, y);
    for (let j = 0; j < size[1]; j++) for (let i = 0; i < size[0]; i++) this.set(ax + i, ay + j, T.BLOCK);
    this.props.push({ kind, x: ax, y: ay, w: size[0], h: size[1], rot, low: false });
  }

  /** Decoration only (no collision). */
  decor(x, y, kind, rot = 0) {
    const [ax, ay] = this.A(x, y);
    this.props.push({ kind, x: ax, y: ay, w: 1, h: 1, rot, decor: true });
  }

  obj(type, x, y, fx, fy, extra = {}) {
    const [ax, ay] = this.A(x, y);
    this.objects.push({ id: `${type}${extra.key ? ':' + extra.key : ''}`, type, x: ax, y: ay, face: [fx, fy], ...extra });
  }
  wallbuy(weapon, x, y, fx, fy) { this.obj('wall', x, y, fx, fy, { key: weapon, weapon }); }
  perk(perk, x, y, fx, fy) { this.obj('perk', x, y, fx, fy, { key: perk, perk }); }
  box(x, y, fx, fy) { const [ax, ay] = this.A(x, y); this.boxLocs.push({ x: ax, y: ay, face: [fx, fy] }); }
  spawns(list) { for (const [x, y] of list) { const [ax, ay] = this.A(x, y); this.playerSpawns.push([ax + 0.5, ay + 0.5]); } }

  fail(msg) { throw new Error(`[map ${this.id}] ${msg}`); }

  finish() {
    const { w, h } = this;
    const walk = (t) => t === T.FLOOR || t === T.CRATE || t === T.BLOCK;
    // door zones
    for (const d of this.doors) {
      const zs = new Set();
      for (const [x, y] of d.cells)
        for (const [dx, dy] of N4) {
          const z = this.zone[this.i(x + dx, y + dy)];
          if (z >= 0 && this.get(x + dx, y + dy) !== T.DOOR) zs.add(z);
        }
      d.zones = [...zs];
      if (d.zones.length !== 2) this.fail(`door ${d.id} touches ${d.zones.length} rooms`);
    }
    // windows
    for (const win of this.windows) {
      const [ix, iy] = win.inside;
      if (this.get(ix, iy) !== T.FLOOR) this.fail(`window ${win.id} inside cell is not floor`);
      win.zone = this.zone[this.i(ix, iy)];
    }
    // yards may only touch walls, windows and other yard cells
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        if (this.get(x, y) !== T.YARD) continue;
        if (x === 0 || y === 0 || x === w - 1 || y === h - 1) this.fail(`yard at map edge (${x},${y})`);
        for (const [dx, dy] of N4) {
          const t = this.get(x + dx, y + dy);
          if (walk(t) || t === T.DOOR) this.fail(`yard (${x},${y}) leaks into a room at (${x + dx},${y + dy})`);
        }
      }
    // objects face a wall and stand on floor
    for (const o of this.objects) {
      if (this.get(o.x, o.y) !== T.FLOOR) this.fail(`${o.id} not on floor (${o.x},${o.y})`);
      if (this.get(o.x + o.face[0], o.y + o.face[1]) !== T.WALL) this.fail(`${o.id} does not face a wall`);
    }
    for (const b of this.boxLocs) {
      if (this.get(b.x, b.y) !== T.FLOOR) this.fail(`box location not on floor (${b.x},${b.y})`);
      if (this.get(b.x + b.face[0], b.y + b.face[1]) !== T.WALL) this.fail(`box location does not face a wall (${b.x},${b.y})`);
    }
    for (const [x, y] of this.playerSpawns) if (this.get(Math.floor(x), Math.floor(y)) !== T.FLOOR) this.fail(`spawn not on floor (${x},${y})`);
    // perk machines and Pack-a-Punch are solid: players, zombies and bullets stop at them
    for (const o of this.objects) {
      if (o.type !== 'perk' && o.type !== 'pap') continue;
      const ax = o.x - o.face[0], ay = o.y - o.face[1];
      if (this.get(ax, ay) !== T.FLOOR) this.fail(`${o.id} can't be reached: cell in front (${ax},${ay}) is blocked`);
      this.set(o.x, o.y, T.BLOCK);
    }
    // wall-buys and the power switch need a free spot in front of them
    for (const o of this.objects) {
      if (o.type !== 'wall' && o.type !== 'power') continue;
      const t = this.get(o.x, o.y);
      if (t !== T.FLOOR) this.fail(`${o.id} is covered by a prop`);
    }
    // the mystery box is 1.6 m wide: both cells beside each box spot must be open floor
    for (const b of this.boxLocs) {
      const px = b.face[1] !== 0 ? 1 : 0, py = b.face[0] !== 0 ? 1 : 0;
      for (const s of [-1, 1]) if (this.get(b.x + px * s, b.y + py * s) !== T.FLOOR) this.fail(`box spot (${b.x},${b.y}) is too tight`);
      if (this.get(b.x - b.face[0], b.y - b.face[1]) !== T.FLOOR) this.fail(`box spot (${b.x},${b.y}) is blocked in front`);
    }
    // every room reachable from the start room through floor and doors (ignoring props)
    const seen = new Uint8Array(w * h);
    const start = this.rooms[0];
    const q = [[start.x0, start.y0]];
    seen[this.i(start.x0, start.y0)] = 1;
    while (q.length) {
      const [x, y] = q.pop();
      for (const [dx, dy] of N4) {
        const nx = x + dx, ny = y + dy, t = this.get(nx, ny);
        if ((walk(t) || t === T.DOOR) && !seen[this.i(nx, ny)]) { seen[this.i(nx, ny)] = 1; q.push([nx, ny]); }
      }
    }
    for (const r of this.rooms) if (!seen[this.i(r.x0, r.y0)] && !seen[this.i(r.x1, r.y1)]) this.fail(`room ${r.key} unreachable`);
    // props must not block doorways or windows
    for (const d of this.doors) for (const [x, y] of d.cells) for (const [dx, dy] of N4) {
      const t = this.get(x + dx, y + dy);
      if ((t === T.CRATE || t === T.BLOCK) && this.zone[this.i(x + dx, y + dy)] >= 0) this.fail(`prop blocks door ${d.id} at (${x + dx},${y + dy})`);
    }
    for (const win of this.windows) {
      const t = this.get(...win.inside);
      if (t !== T.FLOOR) this.fail(`prop blocks window ${win.id}`);
    }
    if (this.boxLocs.length < 2) this.fail('needs at least 2 box locations');
    if (this.playerSpawns.length < 4) this.fail('needs at least 4 player spawns');

    // lookup tables
    const doorIndex = new Int16Array(w * h);
    for (const d of this.doors) for (const [x, y] of d.cells) doorIndex[this.i(x, y)] = d.id;
    const windowIndex = new Int16Array(w * h);
    for (const win of this.windows) windowIndex[this.i(win.x, win.y)] = win.id + 1;
    const outdoor = new Uint8Array(w * h);
    for (const r of this.rooms) if (r.outdoor) for (let y = r.y0; y <= r.y1; y++) for (let x = r.x0; x <= r.x1; x++) outdoor[this.i(x, y)] = 1;
    // yards are always open sky
    for (let k = 0; k < w * h; k++) if (this.grid[k] === T.YARD) outdoor[k] = 1;

    // keep the real-time light count low: at most 8 lamps with real lights per map
    let budget = 8;
    for (const r of this.rooms) {
      const area = (r.x1 - r.x0 + 1) * (r.y1 - r.y0 + 1);
      r.lights = r.lights ?? (area > 220 ? 2 : 1);
    }
    let total = this.rooms.reduce((a, r) => a + r.lights, 0);
    for (const r of [...this.rooms].sort((a, b) => b.lights - a.lights)) {
      while (total > budget && r.lights > 1) { r.lights--; total--; }
    }

    const map = {
      id: this.id, name: this.name, w, h, grid: this.grid, zone: this.zone, rooms: this.rooms, doors: this.doors,
      windows: this.windows, objects: this.objects, boxLocs: this.boxLocs, playerSpawns: this.playerSpawns,
      props: this.props, startZone: 0, theme: this.theme, doorIndex, windowIndex, outdoor,
      outdoorAt: (x, y) => x >= 0 && y >= 0 && x < w && y < h && outdoor[y * w + x] === 1,
    };
    return map;
  }
}
