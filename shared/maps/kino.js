// "Kino Outpost": an abandoned theater (original layout inspired by Kino der Toten).
import { MapBuilder } from './builder.js';

export default function kino() {
  const B = new MapBuilder('kino', 'Kino Outpost', 56, 40, 2, 2);
  B.theme = { fog: '#0a0c14', fogDensity: 0.03, hemiSky: '#7d8cb8', hemiGround: '#3a2a1c', rain: false, music: 'ambient' };
  B.room('start', 'Lobby', 16, 17, 29, 28, { style: 'theater', light: 0xffb070 });
  B.room('hall', 'Theater Hall', 10, 6, 31, 15, { style: 'theaterWood', light: 0xff9a5a });
  B.room('east', 'Dressing Rooms', 31, 17, 42, 32, { style: 'dressing', light: 0x9fd0ff });
  B.room('power', 'Generator Room', 4, 17, 14, 30, { style: 'generator', light: 0xffd27a });
  B.room('lab', 'Projector Lab', 33, 4, 48, 15, { style: 'projector', light: 0xc08cff });

  B.door(750, [[22, 16], [23, 16]]);
  B.door(750, [[30, 22], [30, 23]]);
  B.door(1000, [[11, 16], [12, 16]]);
  B.door(1000, [[37, 16], [38, 16]]);
  B.door(1250, [[32, 10], [32, 11]]);

  B.win(18, 29, 0, 1); B.win(23, 29, 0, 1); B.win(28, 29, 0, 1);
  B.win(14, 5, 0, -1); B.win(21, 5, 0, -1); B.win(28, 5, 0, -1); B.win(9, 10, -1, 0);
  B.win(3, 21, -1, 0); B.win(3, 27, -1, 0); B.win(9, 31, 0, 1);
  B.win(43, 21, 1, 0); B.win(43, 28, 1, 0); B.win(36, 33, 0, 1);
  B.win(38, 3, 0, -1); B.win(44, 3, 0, -1); B.win(49, 10, 1, 0);

  for (const [x, y] of [[18, 9], [19, 9], [18, 10], [26, 12], [27, 12], [36, 21], [36, 22], [44, 8], [45, 8], [44, 9], [7, 24], [8, 24], [39, 27]]) B.crate(x, y);
  // theater seats and stage props (decoration)
  for (let x = 13; x <= 29; x += 2) for (const y of [13, 14]) if (x !== 21 && x !== 23) B.decor(x, y, 'seat');
  B.block(46, 13, 'projector');

  B.wallbuy('olympia', 20, 17, 0, -1);
  B.wallbuy('m14', 29, 26, 1, 0);
  B.perk('revive', 16, 25, -1, 0);
  B.wallbuy('mp40', 17, 6, 0, -1);
  B.wallbuy('stakeout', 31, 7, 1, 0);
  B.perk('speed', 10, 14, -1, 0);
  B.wallbuy('mpl', 14, 17, 0, -1);
  B.obj('power', 14, 29, 1, 0);
  B.perk('dtap', 4, 24, -1, 0);
  B.perk('jugg', 42, 24, 1, 0);
  B.wallbuy('ak74u', 31, 30, -1, 0);
  B.obj('pap', 41, 4, 0, -1);
  B.wallbuy('m16', 48, 6, 1, 0);

  B.box(16, 20, -1, 0); B.box(26, 15, 0, 1); B.box(5, 30, 0, 1); B.box(40, 32, 0, 1); B.box(33, 14, -1, 0);
  B.spawns([[21, 21], [24, 21], [21, 24], [24, 24], [19, 22], [26, 22], [19, 26], [26, 26]]);
  return B.finish();
}
