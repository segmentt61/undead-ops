import kino from './kino.js';
import bunker from './bunker.js';
import asylum from './asylum.js';
import factory from './factory.js';
import mall from './mall.js';

export const MAPS = { kino, bunker, asylum, factory, mall };
export const MAP_LIST = [
  { id: 'kino', name: 'Kino Outpost', desc: 'Abandoned theater. The classic.', difficulty: 'Normal' },
  { id: 'bunker', name: 'Bunker 9', desc: 'Tiny WW2 bunker + rainy courtyard. Brutal.', difficulty: 'Hard' },
  { id: 'asylum', name: 'Asylum', desc: 'Dark hospital, kitchens and patient wards.', difficulty: 'Normal' },
  { id: 'factory', name: 'Factory', desc: 'Huge factory floor, furnaces and labs.', difficulty: 'Normal' },
  { id: 'mall', name: 'Dead Mall', desc: 'Shops, food court and a parking garage.', difficulty: 'Easy' },
];
