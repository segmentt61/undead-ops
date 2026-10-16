// "Bunker 9": a small, brutal WW2 bunker with a rainy courtyard (inspired by Nacht der Untoten).
import { MapBuilder } from './builder.js';

export default function bunker() {
  const B = new MapBuilder('bunker', 'Bunker 9', 47, 30, 3, 3);
  B.theme = { fog: '#0a0d0b', fogDensity: 0.036, hemiSky: '#6f7f74', hemiGround: '#2a261c', rain: true, music: 'ambient' };
  B.room('start', 'Bunker', 14, 12, 27, 21, { style: 'bunker', light: 0xffc98a });
  B.room('radio', 'Radio Room', 14, 3, 27, 10, { style: 'bunker', light: 0xffd9a0 });
  B.room('storage', 'Storage', 29, 12, 38, 21, { style: 'bunkerWood', light: 0xffb36b });
  B.room('yard', 'Courtyard', 2, 3, 12, 21, { style: 'courtyard', light: 0x9fb8ff, outdoor: true });

  B.door(750, [[20, 11], [21, 11]]);   // bunker -> radio
  B.door(1000, [[28, 16], [28, 17]]);  // bunker -> storage
  B.door(1250, [[13, 18], [13, 19]]);  // bunker -> courtyard
  B.door(1000, [[13, 6], [13, 7]]);    // radio -> courtyard

  B.win(17, 22, 0, 1); B.win(24, 22, 0, 1);
  B.win(17, 2, 0, -1); B.win(24, 2, 0, -1);
  B.win(39, 15, 1, 0); B.win(39, 19, 1, 0); B.win(33, 22, 0, 1);
  B.win(1, 6, -1, 0); B.win(1, 12, -1, 0); B.win(1, 18, -1, 0); B.win(9, 2, 0, -1);

  // sandbag walls, crates and barrels
  for (const x of [17, 18, 23, 24]) B.crate(x, 17, 'sandbags');
  B.crate(20, 5, 'table', [2, 1]);
  B.block(24, 4, 'radio');
  B.crate(6, 9, 'crate'); B.crate(7, 9, 'crate'); B.crate(9, 15, 'barrel'); B.crate(10, 15, 'barrel'); B.crate(5, 16, 'sandbags'); B.crate(6, 16, 'sandbags');
  B.block(35, 15, 'shelf', [1, 3]);
  B.crate(31, 19, 'crate');

  B.wallbuy('olympia', 15, 12, 0, -1);
  B.wallbuy('m14', 27, 13, 1, 0);
  B.perk('revive', 14, 20, -1, 0);
  B.wallbuy('mp40', 27, 5, 1, 0);
  B.perk('speed', 14, 4, -1, 0);
  B.obj('power', 38, 13, 1, 0);
  B.perk('jugg', 34, 12, 0, -1);
  B.wallbuy('stakeout', 29, 21, 0, 1);
  B.obj('pap', 2, 9, -1, 0);
  B.perk('dtap', 12, 4, 1, 0);
  B.wallbuy('ak74u', 5, 3, 0, -1);

  B.box(20, 3, 0, -1); B.box(31, 12, 0, -1); B.box(7, 21, 0, 1); B.box(26, 21, 0, 1);
  B.spawns([[16, 14], [19, 14], [22, 14], [25, 14], [16, 19], [20, 20], [22, 19], [25, 19]]);
  return B.finish();
}
