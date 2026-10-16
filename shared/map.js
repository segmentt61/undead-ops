// Map runtime: cell queries, collision ranges and ray casting. Map layouts live in shared/maps/.
// The client keeps one "current" map (setMap); the server passes each room's map explicitly.
import { MAPS, MAP_LIST } from './maps/index.js';
import { T, WALL_HEIGHT, CRATE_HEIGHT, WINDOW_SILL, WINDOW_TOP, BOARDS_PER_WINDOW } from './maps/builder.js';

export { T, WALL_HEIGHT, CRATE_HEIGHT, WINDOW_SILL, WINDOW_TOP, BOARDS_PER_WINDOW, MAP_LIST };

const built = new Map();
export function getMap(id) {
  if (!MAPS[id]) id = MAP_LIST[0].id;
  if (!built.has(id)) built.set(id, MAPS[id]());
  return built.get(id);
}

export let MAP = getMap(MAP_LIST[0].id);
export function setMap(id) {
  MAP = getMap(id);
  return MAP;
}

export function cellAt(x, y, map = MAP) {
  if (x < 0 || y < 0 || x >= map.w || y >= map.h) return T.WALL;
  return map.grid[y * map.w + x];
}

export function zoneAt(x, y, map = MAP) {
  if (x < 0 || y < 0 || x >= map.w || y >= map.h) return -1;
  return map.zone[y * map.w + x];
}

export function doorAtCell(x, y, map = MAP) {
  if (x < 0 || y < 0 || x >= map.w || y >= map.h) return null;
  const id = map.doorIndex[y * map.w + x];
  return id ? map.doors[id - 1] : null;
}

export function windowAtCell(x, y, map = MAP) {
  if (x < 0 || y < 0 || x >= map.w || y >= map.h) return null;
  const id = map.windowIndex[y * map.w + x];
  return id ? map.windows[id - 1] : null;
}

// Height ranges of a cell that block a player.
const FULL = [[0, 99]];
const NONE = [];
const CRATE = [[0, CRATE_HEIGHT]];
export function solidRanges(x, y, openDoors, map = MAP) {
  switch (cellAt(x, y, map)) {
    case T.WALL: case T.YARD: case T.WINDOW: case T.BLOCK: return FULL;
    case T.CRATE: return CRATE;
    case T.DOOR: {
      const d = doorAtCell(x, y, map);
      return d && openDoors.has(d.id) ? NONE : FULL;
    }
    default: return NONE;
  }
}

// What blocks a bullet travelling through a cell.
const B_FULL = [[-1, 99]];
const B_WINDOW = [[-1, WINDOW_SILL], [WINDOW_TOP, 99]];
const B_CRATE = [[-1, CRATE_HEIGHT]];
export function bulletBlockers(x, y, openDoors, map = MAP) {
  switch (cellAt(x, y, map)) {
    case T.WALL: case T.BLOCK: return B_FULL;
    case T.WINDOW: return B_WINDOW;
    case T.CRATE: return B_CRATE;
    case T.DOOR: {
      const d = doorAtCell(x, y, map);
      return d && openDoors.has(d.id) ? NONE : B_FULL;
    }
    default: return NONE;
  }
}

// 2D DDA through the grid honouring vertical blockers. Returns { dist, normal }.
export function raycastWorld(ox, oy, oz, dx, dy, dz, maxDist, openDoors, map = MAP) {
  let cx = Math.floor(ox), cy = Math.floor(oz);
  const stepX = dx > 0 ? 1 : -1, stepY = dz > 0 ? 1 : -1;
  const tDeltaX = dx !== 0 ? Math.abs(1 / dx) : Infinity;
  const tDeltaY = dz !== 0 ? Math.abs(1 / dz) : Infinity;
  let tMaxX = dx !== 0 ? ((dx > 0 ? cx + 1 - ox : ox - cx) * tDeltaX) : Infinity;
  let tMaxY = dz !== 0 ? ((dz > 0 ? cy + 1 - oz : oz - cy) * tDeltaY) : Infinity;
  let t = 0;
  let lastAxis = -1;
  let limit = maxDist;
  const ceiling = map.outdoorAt && map.outdoorAt(cx, cy) ? 60 : WALL_HEIGHT;
  if (dy < 0) limit = Math.min(limit, -oy / dy);
  else if (dy > 0) limit = Math.min(limit, (ceiling - oy) / dy);
  for (let i = 0; i < 400 && t < limit; i++) {
    const tNext = Math.min(tMaxX, tMaxY, limit);
    const ranges = bulletBlockers(cx, cy, openDoors, map);
    if (ranges.length) {
      const y0 = oy + dy * t, y1 = oy + dy * tNext;
      const lo = Math.min(y0, y1), hi = Math.max(y0, y1);
      for (const [b, tp] of ranges) {
        if (hi >= b && lo <= tp) {
          if (y0 >= b && y0 <= tp) {
            const normal = lastAxis < 0 ? [-dx, -dy, -dz] : lastAxis === 0 ? [-stepX, 0, 0] : [0, 0, -stepY];
            return { dist: t, normal };
          }
          const edge = y0 > tp ? tp : b;
          return { dist: Math.max(t, (edge - oy) / dy), normal: [0, y0 > tp ? 1 : -1, 0] };
        }
      }
    }
    if (tNext >= limit) break;
    if (tMaxX < tMaxY) { t = tMaxX; tMaxX += tDeltaX; cx += stepX; lastAxis = 0; }
    else { t = tMaxY; tMaxY += tDeltaY; cy += stepY; lastAxis = 1; }
  }
  if (limit < maxDist) return { dist: limit, normal: [0, dy < 0 ? 1 : -1, 0] };
  return { dist: maxDist, normal: null };
}
