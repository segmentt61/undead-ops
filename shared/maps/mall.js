// "Dead Mall": a shopping mall overrun by the dead (inspired by Left 4 Dead 2's Dead Center).
import { MapBuilder } from './builder.js';

export default function mall() {
  const B = new MapBuilder('mall', 'Dead Mall', 55, 42, 3, 3);
  B.theme = { fog: '#10121a', fogDensity: 0.022, hemiSky: '#9aa6c8', hemiGround: '#3a3430', rain: false, music: 'ambient', bright: true };
  B.room('start', 'Atrium', 16, 13, 33, 26, { style: 'atrium', light: 0xe8f0ff, outdoor: true, lights: 2 });
  B.room('guns', 'Gun Store', 4, 13, 14, 20, { style: 'shop', light: 0xffe0b0 });
  B.room('food', 'Food Court', 16, 2, 33, 11, { style: 'foodcourt', light: 0xffd090 });
  B.room('dept', 'Department Store', 35, 2, 46, 26, { style: 'store', light: 0xf0f4ff, lights: 2 });
  B.room('parking', 'Parking Garage', 4, 22, 14, 33, { style: 'parking', light: 0xc8d8ff });

  B.door(750, [[15, 16], [15, 17]]);   // atrium -> gun store
  B.door(1000, [[24, 12], [25, 12]]);  // atrium -> food court
  B.door(1000, [[34, 19], [34, 20]]);  // atrium -> department store
  B.door(1250, [[8, 21], [9, 21]]);    // gun store -> parking
  B.door(1250, [[34, 6], [34, 7]]);    // food court -> department store

  B.win(20, 27, 0, 1); B.win(29, 27, 0, 1);
  B.win(3, 16, -1, 0); B.win(9, 12, 0, -1);
  B.win(20, 1, 0, -1); B.win(29, 1, 0, -1);
  B.win(47, 6, 1, 0); B.win(47, 14, 1, 0); B.win(47, 22, 1, 0);
  B.win(3, 25, -1, 0); B.win(3, 31, -1, 0); B.win(9, 34, 0, 1);

  // atrium fountain and benches
  B.block(24, 19, 'fountain', [2, 2]);
  B.crate(19, 16, 'bench', [2, 1]); B.crate(29, 16, 'bench', [2, 1]); B.crate(19, 23, 'bench', [2, 1]); B.crate(29, 23, 'bench', [2, 1]);
  B.block(16, 13, 'planter'); B.block(33, 13, 'planter'); B.block(16, 26, 'planter'); B.block(33, 26, 'planter');
  B.block(29, 19, 'kiosk', [2, 2]); B.decor(22, 15, 'cart'); B.decor(27, 24, 'body');
  // gun store counters
  B.crate(8, 17, 'counter', [3, 1]);
  // food court tables
  for (const x of [19, 23, 27, 31]) for (const y of [5, 8]) B.crate(x, y, 'table');
  B.block(16, 9, 'vending'); B.block(33, 3, 'vending');
  // department store shelves
  for (const x of [38, 43]) { B.block(x, 5, 'shelf', [1, 5]); B.block(x, 15, 'shelf', [1, 6]); }
  // gun store lockers, food stall counter, mannequins
  B.block(11, 20, 'lockers', [2, 1], Math.PI);
  B.crate(30, 10, 'counter', [2, 1]); B.decor(21, 10, 'trash');
  B.block(36, 12, 'mannequin'); B.block(40, 12, 'mannequin'); B.block(41, 22, 'mannequin'); B.decor(45, 10, 'cart');
  // parking garage: full-size cars around a pillar
  B.block(6, 23, 'car', [2, 4]); B.block(11, 23, 'car2', [2, 4]); B.block(6, 29, 'car3', [2, 4]); B.block(11, 28, 'car', [2, 4]);
  B.block(9, 28, 'pillar'); B.decor(13, 26, 'rubble');

  B.perk('revive', 16, 25, -1, 0);
  B.wallbuy('olympia', 20, 13, 0, -1);
  B.wallbuy('m14', 4, 14, -1, 0);
  B.wallbuy('mp40', 14, 13, 1, 0);
  B.wallbuy('stakeout', 6, 13, 0, -1);
  B.wallbuy('ak74u', 4, 19, -1, 0);
  B.perk('speed', 16, 3, -1, 0);
  B.wallbuy('mpl', 33, 10, 1, 0);
  B.obj('power', 46, 26, 1, 0);
  B.perk('jugg', 35, 25, -1, 0);
  B.perk('dtap', 46, 2, 0, -1);
  B.wallbuy('m16', 35, 3, -1, 0);
  B.obj('pap', 13, 33, 0, 1);

  B.box(33, 15, 1, 0); B.box(25, 2, 0, -1); B.box(41, 26, 0, 1); B.box(4, 28, -1, 0);
  B.spawns([[21, 18], [28, 18], [21, 21], [28, 21], [23, 17], [26, 22], [22, 25], [27, 25]]);
  return B.finish();
}
