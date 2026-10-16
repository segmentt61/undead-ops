// "Asylum": a decaying mental hospital (inspired by Verrückt).
import { MapBuilder } from './builder.js';

export default function asylum() {
  const B = new MapBuilder('asylum', 'Asylum', 51, 41, 3, 3);
  B.theme = { fog: '#0c0d10', fogDensity: 0.034, hemiSky: '#8a96a0', hemiGround: '#2c2a26', rain: false, music: 'ambient', flicker: 0.8 };
  B.room('start', 'Reception', 18, 14, 29, 23, { style: 'ward', light: 0xd8f0ff });
  B.room('kitchen', 'Kitchen', 6, 14, 16, 23, { style: 'kitchen', light: 0xfff0d0 });
  B.room('dining', 'Dining Hall', 6, 3, 29, 12, { style: 'dining', light: 0xffc890 });
  B.room('ward', 'Patient Ward', 31, 3, 42, 23, { style: 'ward', light: 0xc8ffe8 });
  B.room('showers', 'Shower Block', 31, 25, 42, 32, { style: 'showers', light: 0xb8d8ff });

  B.door(750, [[17, 18], [17, 19]]);   // reception -> kitchen
  B.door(1000, [[23, 13], [24, 13]]);  // reception -> dining
  B.door(1000, [[30, 18], [30, 19]]);  // reception -> ward
  B.door(1250, [[36, 24], [37, 24]]);  // ward -> showers
  B.door(1000, [[11, 13], [12, 13]]);  // kitchen -> dining

  B.win(21, 24, 0, 1); B.win(26, 24, 0, 1);
  B.win(5, 17, -1, 0); B.win(5, 21, -1, 0); B.win(11, 24, 0, 1);
  B.win(10, 2, 0, -1); B.win(17, 2, 0, -1); B.win(25, 2, 0, -1); B.win(5, 7, -1, 0);
  B.win(43, 6, 1, 0); B.win(43, 12, 1, 0); B.win(43, 19, 1, 0); B.win(36, 2, 0, -1);
  B.win(43, 28, 1, 0); B.win(34, 33, 0, 1); B.win(40, 33, 0, 1);

  // kitchen counters and stoves
  for (const x of [8, 9, 10]) B.crate(x, 20, 'counter');
  B.block(14, 22, 'stove');
  // dining tables
  for (const x of [10, 15, 20]) for (const y of [6, 9]) B.crate(x, y, 'table', [2, 1]);
  // reception desk
  B.crate(23, 17, 'counter', [3, 1]);
  // ward beds and curtain walls
  for (const [x, y] of [[33, 6], [39, 6], [33, 15], [39, 15]]) B.crate(x, y, 'bed', [1, 2]);
  B.block(36, 9, 'curtain', [1, 2]); B.block(36, 13, 'curtain', [1, 2]);
  // shower stalls
  B.block(34, 27, 'stall', [1, 2]); B.block(40, 27, 'stall', [1, 2]);
  B.decor(27, 21, 'wheelchair'); B.decor(38, 21, 'wheelchair');

  B.perk('revive', 18, 20, -1, 0);
  B.wallbuy('olympia', 20, 14, 0, -1);
  B.wallbuy('m14', 29, 15, 1, 0);
  B.wallbuy('mp40', 6, 15, -1, 0);
  B.perk('speed', 16, 14, 0, -1);
  B.wallbuy('stakeout', 29, 6, 1, 0);
  B.obj('power', 42, 4, 1, 0);
  B.perk('jugg', 31, 21, -1, 0);
  B.perk('dtap', 31, 8, -1, 0);
  B.wallbuy('ak74u', 39, 3, 0, -1);
  B.obj('pap', 37, 32, 0, 1);
  B.wallbuy('m16', 31, 27, -1, 0);

  B.box(27, 23, 0, 1); B.box(6, 10, -1, 0); B.box(42, 16, 1, 0); B.box(42, 30, 1, 0);
  B.spawns([[20, 16], [26, 16], [20, 21], [27, 20], [22, 20], [24, 21], [19, 18], [28, 18]]);
  return B.finish();
}
