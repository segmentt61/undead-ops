// Shared tuning values used by both the server and the browser client.

export const TICK_RATE = 20;
export const MAX_PLAYERS = 8;
export const START_POINTS = 500;

export const PLAYER_HP = 100;
export const JUGG_HP = 250;
export const REGEN_DELAY = 2.5; // seconds without damage before health regenerates
export const ZOMBIE_HIT = 50;
export const DOG_HIT = 40;

export const REVIVE_TIME = 4;
export const REVIVE_TIME_QR = 2;
export const BLEEDOUT_TIME = 45;
export const SOLO_QR_TIME = 6;
export const SOLO_QR_USES = 3;

export const BOX_COST = 950;
export const PAP_COST = 5000;
export const PAP_AMMO_COST = 4500;
export const KNIFE_DAMAGE = 150;
export const MAX_GRENADES = 4;
export const REBUILD_POINTS_CAP = 500; // per round, per player
export const POWERUP_DURATION = 30;
export const POWERUP_LIFETIME = 28;
export const POWERUPS_PER_ROUND = 4;
export const ROUND_BREAK = 10;

export const PERKS = {
  jugg:   { name: 'Juggernog',            cost: 2500, color: '#e0262b', glow: 0xff2a2a, power: true,  desc: 'Take more hits before going down' },
  speed:  { name: 'Speed Cola',           cost: 3000, color: '#22c55e', glow: 0x2aff6a, power: true,  desc: 'Reload and rebuild twice as fast' },
  dtap:   { name: 'Double Tap Root Beer', cost: 2000, color: '#f2a516', glow: 0xffb020, power: true,  desc: 'Fire 33% faster' },
  revive: { name: 'Quick Revive',         cost: 1500, soloCost: 500, color: '#38a6f0', glow: 0x3ab0ff, power: false, desc: 'Revive faster. Solo: revive yourself' },
};

export const POWERUP_KINDS = ['maxammo', 'insta', 'double', 'nuke', 'carpenter'];
export const POWERUP_NAMES = {
  maxammo: 'Max Ammo', insta: 'Insta-Kill', double: 'Double Points', nuke: 'Kaboom!', carpenter: 'Carpenter',
};

export const PLAYER_COLORS = ['#f5f5f5', '#4aa3ff', '#ffd23f', '#5be37d', '#ff7ab8', '#ff8c2a', '#b18cff', '#3ff5e1'];

// Black Ops 1 style health curve: +100 per round until round 10, then +10% per round.
export function zombieHealth(round) {
  if (round < 10) return 150 + 100 * (round - 1);
  return Math.round(950 * Math.pow(1.1, round - 9));
}

export function dogHealth(round) {
  return Math.min(1600, 200 + round * 60);
}

export function zombieCount(round, players) {
  const scale = 1 + 0.5 * (players - 1);
  const early = [0, 6, 8, 13, 18];
  if (round <= 4) return Math.round(early[round] * scale);
  const base = 24 + 6 * (players - 1);
  return Math.round(base * (1 + (round - 5) * 0.18));
}

export function dogCount(round, players) {
  return Math.min(40, 6 + 2 * players + Math.floor(round / 5) * 2);
}

export function maxAlive(players) {
  return Math.min(40, 24 + 3 * (players - 1));
}

export function spawnInterval(round) {
  return Math.max(0.35, 2.0 - round * 0.12);
}

// Movement tiers: walk, jog, run, sprint (metres per second)
export const ZOMBIE_SPEEDS = [1.35, 2.6, 4.2, 5.3];
export const DOG_SPEED = 6.6;

export function pickZombieSpeedTier(round, rnd = Math.random) {
  const r = rnd();
  if (round <= 1) return 0;
  if (round === 2) return r < 0.8 ? 0 : 1;
  if (round === 3) return r < 0.45 ? 0 : 1;
  if (round === 4) return r < 0.2 ? 0 : r < 0.7 ? 1 : 2;
  if (round < 8) return r < 0.1 ? 1 : r < 0.85 ? 2 : 3;
  if (round < 12) return r < 0.6 ? 2 : 3;
  return r < 0.25 ? 2 : 3;
}

export const PLAYER_SPEED = 5.2;
export const SPRINT_SPEED = 7.6;
export const CROUCH_SPEED = 2.6;
export const DOWNED_SPEED = 0.9;
export const JUMP_VELOCITY = 6.7;
export const GRAVITY = 18;
export const PLAYER_RADIUS = 0.32;
export const EYE_HEIGHT = 1.62;
export const CROUCH_EYE = 1.05;
export const DOWNED_EYE = 0.55;
