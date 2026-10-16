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

  // lobby: ticket counter, pillars
  B.crate(25, 18, 'counter', [3, 1]);
  B.block(18, 19, 'pillar'); B.block(27, 25, 'pillar');
  B.decor(17, 27, 'body'); B.decor(22, 27, 'rubble'); B.decor(28, 20, 'trash');
  // theater hall: rows of seats with a centre aisle
  for (const y of [8, 10, 12]) { B.crate(13, y, 'seats', [8, 1]); B.crate(25, y, 'seats', [6, 1]); }
  B.decor(22, 9, 'body'); B.decor(11, 7, 'rubble');
  // dressing rooms
  B.block(33, 17, 'lockers', [3, 1]);
  B.crate(34, 21, 'desk', [2, 1]);
  B.block(39, 20, 'mannequin');
  B.block(36, 26, 'curtain', [1, 3]);
  B.crate(38, 29, 'boxes'); B.crate(33, 28, 'crates'); B.decor(40, 23, 'trash');
  // generator room
  B.block(8, 20, 'generator', [2, 1]);
  B.block(12, 21, 'tank');
  B.crate(11, 27, 'workbench', [2, 1]);
  B.crate(7, 25, 'barrel'); B.crate(8, 25, 'barrel');
  B.decor(6, 28, 'rubble');
  // projector lab
  B.block(46, 13, 'projector');
  B.crate(36, 7, 'labtable', [2, 1]);
  B.crate(42, 9, 'desk', [2, 1]);
  B.block(47, 15, 'filing');
  B.crate(35, 12, 'boxes'); B.decor(44, 12, 'papers');

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
