// Weapon definitions shared by client (feel/visuals) and server (damage validation).
// cls: pistol | smg | rifle | shotgun | lmg | sniper | wonder
// mode: semi | auto | burst
// kind: hitscan (default) | ray (projectile + splash) | thunder (cone blast) | launcher (explosive projectile)

export const WEAPONS = {
  m1911: {
    name: 'M1911', cls: 'pistol', mode: 'semi', dmg: 20, head: 2.0, rpm: 420, mag: 8, reserve: 80, reload: 1.6,
    spread: [1.8, 0.4], pen: 1, range: 30, recoil: 1.2, move: 1.05, sound: 'pistol',
    pap: { name: 'Mustang & Sally', kind: 'launcher', dmg: 600, mag: 12, reserve: 50, rpm: 300, splash: { r: 3.6, dmg: 1200 }, sound: 'launcher' },
  },
  olympia: {
    name: 'Olympia', cls: 'shotgun', mode: 'semi', dmg: 70, head: 1.4, pellets: 8, rpm: 140, mag: 2, reserve: 38, reload: 2.6,
    spread: [7, 5], pen: 1, range: 12, recoil: 4.5, move: 1, sound: 'shotgun_double', cost: 500,
    pap: { name: 'Hades', dmg: 160, mag: 2, reserve: 60 },
  },
  m14: {
    name: 'M14', cls: 'rifle', mode: 'semi', dmg: 105, head: 3.5, rpm: 420, mag: 8, reserve: 92, reload: 2.2,
    spread: [2.2, 0.25], pen: 2, range: 60, recoil: 2.2, move: 1, sound: 'rifle_semi', cost: 500,
    pap: { name: 'Mnesia', dmg: 220, mag: 12, reserve: 132 },
  },
  mp40: {
    name: 'MP40', cls: 'smg', mode: 'auto', dmg: 38, head: 2.5, rpm: 560, mag: 32, reserve: 192, reload: 2.1,
    spread: [2.6, 1.0], pen: 1, range: 30, recoil: 0.9, move: 1.03, sound: 'smg', cost: 1000,
    pap: { name: 'The Afterburner', dmg: 82, mag: 64, reserve: 256 },
  },
  stakeout: {
    name: 'Stakeout', cls: 'shotgun', mode: 'semi', dmg: 85, head: 1.4, pellets: 8, rpm: 75, mag: 6, reserve: 60, reload: 3.0,
    spread: [6, 4.5], pen: 1, range: 14, recoil: 5, move: 1, sound: 'shotgun_pump', cost: 1500,
    pap: { name: 'Raid', dmg: 185, mag: 10, reserve: 100 },
  },
  mpl: {
    name: 'MPL', cls: 'smg', mode: 'auto', dmg: 36, head: 2.5, rpm: 860, mag: 24, reserve: 192, reload: 1.9,
    spread: [3.0, 1.2], pen: 1, range: 28, recoil: 0.8, move: 1.04, sound: 'smg2', cost: 1000,
    pap: { name: 'MPL-LF', dmg: 78, mag: 48, reserve: 288 },
  },
  ak74u: {
    name: 'AK-74', cls: 'smg', mode: 'auto', dmg: 44, head: 2.5, rpm: 720, mag: 20, reserve: 160, reload: 2.0,
    spread: [2.8, 1.0], pen: 1, range: 32, recoil: 1.0, move: 1.02, sound: 'ak', cost: 1200,
    pap: { name: 'AK-74fu2', dmg: 95, mag: 40, reserve: 280 },
  },
  m16: {
    name: 'M16', cls: 'rifle', mode: 'burst', burst: 3, dmg: 58, head: 3.0, rpm: 820, mag: 30, reserve: 120, reload: 2.3,
    spread: [2.4, 0.5], pen: 2, range: 50, recoil: 1.1, move: 1, sound: 'ar15', cost: 1200,
    pap: { name: 'Skullpiercer', dmg: 125, mode: 'auto', mag: 30, reserve: 270 },
  },
  // ---- Mystery box exclusives ----
  ray_gun: {
    name: 'Ray Gun', cls: 'wonder', kind: 'ray', mode: 'semi', dmg: 1000, head: 1, rpm: 180, mag: 20, reserve: 160, reload: 2.4,
    spread: [1.0, 0.3], pen: 1, range: 80, recoil: 1.5, move: 1.05, sound: 'ray', splash: { r: 3.2, dmg: 400 }, box: 4,
    pap: { name: "Porter's X2 Ray Gun", dmg: 2200, mag: 40, reserve: 200, splash: { r: 3.8, dmg: 900 } },
  },
  thundergun: {
    name: 'Thunder Cannon', cls: 'wonder', kind: 'thunder', mode: 'semi', dmg: 99999, head: 1, rpm: 55, mag: 2, reserve: 12, reload: 3.4,
    spread: [0, 0], pen: 99, range: 13, cone: 34, recoil: 9, move: 0.95, sound: 'thunder', box: 2,
    pap: { name: 'Zeus Cannon', mag: 4, reserve: 24, range: 16, cone: 40 },
  },
  galil: {
    name: 'Galil', cls: 'rifle', mode: 'auto', dmg: 62, head: 3.0, rpm: 680, mag: 35, reserve: 315, reload: 2.6,
    spread: [2.6, 0.6], pen: 2, range: 55, recoil: 1.1, move: 0.97, sound: 'ak', box: 10,
    pap: { name: 'Lamentation', dmg: 130, reserve: 490 },
  },
  commando: {
    name: 'Commando', cls: 'rifle', mode: 'auto', dmg: 66, head: 3.0, rpm: 760, mag: 30, reserve: 270, reload: 2.3,
    spread: [2.4, 0.55], pen: 2, range: 55, recoil: 1.0, move: 0.98, sound: 'ar15', box: 10,
    pap: { name: 'Predator', dmg: 138, mag: 60, reserve: 360 },
  },
  hk21: {
    name: 'Bren LMG', cls: 'lmg', mode: 'auto', dmg: 72, head: 2.6, rpm: 640, mag: 125, reserve: 500, reload: 4.4,
    spread: [3.4, 1.0], pen: 3, range: 60, recoil: 1.2, move: 0.88, sound: 'lmg', box: 9,
    pap: { name: 'H115 Oscillator', dmg: 150, reserve: 750 },
  },
  spas: {
    name: 'SPAS-12', cls: 'shotgun', mode: 'semi', dmg: 75, head: 1.4, pellets: 8, rpm: 170, mag: 8, reserve: 32, reload: 3.2,
    spread: [6.5, 5], pen: 1, range: 14, recoil: 4.2, move: 0.97, sound: 'shotgun_semi', box: 9,
    pap: { name: 'SPAZ-24', dmg: 170, mag: 24, reserve: 120 },
  },
  python: {
    name: 'Python', cls: 'pistol', mode: 'semi', dmg: 160, head: 3, rpm: 220, mag: 6, reserve: 84, reload: 2.4,
    spread: [1.6, 0.3], pen: 2, range: 40, recoil: 4, move: 1.04, sound: 'magnum', box: 9,
    pap: { name: 'Cobra', dmg: 340, mag: 12, reserve: 120 },
  },
  dragunov: {
    name: 'Mosin Sniper', cls: 'sniper', mode: 'semi', dmg: 450, head: 3, rpm: 190, mag: 10, reserve: 40, reload: 2.8,
    spread: [4, 0.05], pen: 5, range: 120, recoil: 5, move: 0.95, sound: 'sniper', zoom: 25, box: 7,
    pap: { name: 'D115 Disassembler', dmg: 1000, mag: 15, reserve: 60 },
  },
};

export const WALL_WEAPONS = ['olympia', 'm14', 'mp40', 'stakeout', 'mpl', 'ak74u', 'm16'];

export function weaponStats(id, pap) {
  const base = WEAPONS[id];
  if (!base) return null;
  const s = { id, kind: 'hitscan', pellets: 1, zoom: 55, ...base, pap: !!pap };
  if (pap && base.pap) Object.assign(s, base.pap);
  if (pap) s.pap = true;
  return s;
}

export function boxPool() {
  const pool = [];
  for (const [id, w] of Object.entries(WEAPONS)) {
    pool.push({ id, weight: w.box ?? 3 });
  }
  return pool.filter((p) => p.id !== 'm1911');
}

export function pickBoxWeapon(exclude, rnd = Math.random) {
  const pool = boxPool().filter((p) => !exclude.includes(p.id));
  const total = pool.reduce((a, p) => a + p.weight, 0);
  let r = rnd() * total;
  for (const p of pool) {
    r -= p.weight;
    if (r <= 0) return p.id;
  }
  return pool[pool.length - 1].id;
}

// Explosive kinds fire a projectile that splashes on impact.
export function isSplash(stats) {
  return stats.kind === 'ray' || stats.kind === 'launcher';
}
