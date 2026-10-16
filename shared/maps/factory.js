// "Factory": a war factory with furnaces and labs (inspired by Der Riese).
import { MapBuilder } from './builder.js';

export default function factory() {
  const B = new MapBuilder('factory', 'Factory', 53, 42, 3, 3);
  B.theme = { fog: '#0d0b0a', fogDensity: 0.03, hemiSky: '#8a7f70', hemiGround: '#2a1e14', rain: false, music: 'ambient' };
  B.room('start', 'Loading Bay', 4, 22, 17, 33, { style: 'warehouse', light: 0xffc580 });
  B.room('floor', 'Factory Floor', 19, 16, 44, 33, { style: 'factory', light: 0xffd8a0, lights: 2 });
  B.room('furnace', 'Furnace Room', 4, 8, 17, 20, { style: 'furnace', light: 0xff7a2a });
  B.room('lab', 'Research Lab', 19, 4, 33, 14, { style: 'lab', light: 0xbfe0ff });
  B.room('stores', 'Generator Stores', 35, 4, 44, 14, { style: 'warehouse', light: 0xffe0a8 });

  B.door(750, [[18, 27], [18, 28]]);   // bay -> floor
  B.door(1000, [[10, 21], [11, 21]]);  // bay -> furnace
  B.door(1000, [[26, 15], [27, 15]]);  // floor -> lab
  B.door(1250, [[18, 11], [18, 12]]);  // furnace -> lab
  B.door(1250, [[40, 15], [41, 15]]);  // floor -> stores

  B.win(3, 26, -1, 0); B.win(3, 31, -1, 0); B.win(9, 34, 0, 1); B.win(14, 34, 0, 1);
  B.win(24, 34, 0, 1); B.win(32, 34, 0, 1); B.win(40, 34, 0, 1); B.win(45, 20, 1, 0); B.win(45, 29, 1, 0);
  B.win(3, 12, -1, 0); B.win(3, 17, -1, 0); B.win(8, 7, 0, -1); B.win(14, 7, 0, -1);
  B.win(22, 3, 0, -1); B.win(30, 3, 0, -1);
  B.win(45, 8, 1, 0); B.win(39, 3, 0, -1);

  // loading bay
  B.crate(7, 25, 'crate'); B.crate(8, 25, 'crate'); B.crate(13, 30, 'crate'); B.crate(6, 31, 'barrel'); B.crate(7, 31, 'barrel');
  // factory floor: pillars and big machines
  for (const x of [24, 31, 38]) for (const y of [20, 29]) B.block(x, y, 'pillar');
  B.block(27, 24, 'machine', [2, 2]); B.block(35, 24, 'machine', [2, 2]);
  B.crate(42, 25, 'barrel'); B.crate(21, 31, 'crate');
  // furnace room
  B.block(12, 9, 'furnace', [2, 1]);
  B.crate(7, 15, 'barrel'); B.crate(8, 15, 'barrel');
  // lab
  B.crate(22, 8, 'labtable', [2, 1]); B.crate(29, 8, 'labtable', [2, 1]); B.block(25, 11, 'tank');
  // stores shelving
  for (const x of [37, 41]) { B.block(x, 7, 'shelf', [1, 2]); B.block(x, 11, 'shelf', [1, 2]); }

  B.perk('revive', 17, 23, 1, 0);
  B.wallbuy('olympia', 5, 22, 0, -1);
  B.wallbuy('m14', 4, 29, -1, 0);
  B.wallbuy('mp40', 19, 16, 0, -1);
  B.wallbuy('stakeout', 44, 24, 1, 0);
  B.perk('speed', 19, 32, -1, 0);
  B.perk('jugg', 28, 33, 0, 1);
  B.obj('power', 4, 14, -1, 0);
  B.perk('dtap', 17, 9, 1, 0);
  B.wallbuy('ak74u', 11, 8, 0, -1);
  B.obj('pap', 26, 4, 0, -1);
  B.wallbuy('m16', 33, 10, 1, 0);
  B.wallbuy('mpl', 44, 5, 1, 0);

  B.box(16, 33, 0, 1); B.box(44, 32, 1, 0); B.box(6, 20, 0, 1); B.box(19, 5, -1, 0); B.box(35, 13, -1, 0);
  B.spawns([[6, 24], [10, 24], [14, 24], [6, 28], [10, 28], [15, 27], [10, 32], [12, 32]]);
  return B.finish();
}
