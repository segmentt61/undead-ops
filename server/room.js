import { getMap, MAP_LIST, T, cellAt, zoneAt, windowAtCell, BOARDS_PER_WINDOW, WINDOW_SILL } from '../shared/map.js';
import { weaponStats, pickBoxWeapon, WEAPONS } from '../shared/weapons.js';
import * as C from '../shared/config.js';

const DT = 1 / C.TICK_RATE;
const r2 = (v) => Math.round(v * 100) / 100;
const nowS = () => Date.now() / 1000;
const LIMB_BIT = { 5: 1, 6: 2, 7: 4, 8: 8 };
// Optional for testing: DEV_POINTS=50000 npm start
const START_POINTS = Number(process.env.DEV_POINTS) || C.START_POINTS;
const DIRS = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.4142], [1, -1, 1.4142], [-1, 1, 1.4142], [-1, -1, 1.4142]];

class MinHeap {
  constructor() { this.k = []; this.v = []; }
  get size() { return this.k.length; }
  push(key, val) {
    const k = this.k, v = this.v;
    let i = k.length; k.push(key); v.push(val);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (v[p] <= v[i]) break;
      [k[p], k[i]] = [k[i], k[p]]; [v[p], v[i]] = [v[i], v[p]]; i = p;
    }
  }
  pop() {
    const k = this.k, v = this.v;
    const rk = k[0], rv = v[0];
    const lk = k.pop(), lv = v.pop();
    if (k.length) {
      k[0] = lk; v[0] = lv;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1, r = l + 1;
        let m = i;
        if (l < k.length && v[l] < v[m]) m = l;
        if (r < k.length && v[r] < v[m]) m = r;
        if (m === i) break;
        [k[m], k[i]] = [k[i], k[m]]; [v[m], v[i]] = [v[i], v[m]]; i = m;
      }
    }
    return [rk, rv];
  }
}

export class Room {
  constructor(name, onEmpty) {
    this.name = name;
    this.onEmpty = onEmpty;
    this.players = new Map();
    this.nextPid = 1;
    this.hostId = 0;
    this.emptySince = nowS();
    this.mapId = MAP_LIST[0].id;
    this.map = getMap(this.mapId);
    this.title = name;
    this.maxPlayers = C.MAX_PLAYERS;
    this.isPrivate = false;
    this.buildInteractables();
    this.resetGame();
    this.timer = setInterval(() => {
      try { this.tick(); } catch (e) { console.error('[room tick]', e); }
    }, 1000 / C.TICK_RATE);
  }

  destroy() { clearInterval(this.timer); }

  buildInteractables() {
    this.inter = new Map();
    for (const d of this.map.doors) {
      const x = d.cells.reduce((a, c) => a + c[0], 0) / d.cells.length + 0.5;
      const z = d.cells.reduce((a, c) => a + c[1], 0) / d.cells.length + 0.5;
      this.inter.set(`door:${d.id}`, { type: 'door', x, z, door: d });
    }
    for (const o of this.map.objects) this.inter.set(o.id, { type: o.type, x: o.x + 0.5, z: o.y + 0.5, obj: o });
    for (const w of this.map.windows) this.inter.set(`win:${w.id}`, { type: 'win', x: w.x + 0.5, z: w.y + 0.5, win: w });
  }

  resetGame() {
    this.state = 'lobby';
    this.round = 0;
    this.roundState = 'pre';
    this.roundTimer = 0;
    this.openDoors = new Set();
    this.walkMap = null;
    this.activeZones = new Set([this.map.startZone]);
    this.boards = this.map.windows.map(() => BOARDS_PER_WINDOW);
    this.tearCd = this.map.windows.map(() => 0);
    this.power = false;
    this.zombies = new Map();
    this.nextZid = 1;
    this.toSpawn = 0;
    this.spawnTimer = 0;
    this.dogRound = false;
    this.nextDogRound = 5 + Math.floor(Math.random() * 3);
    this.powerups = new Map();
    this.nextPuId = 1;
    this.puThisRound = 0;
    this.insta = 0;
    this.double = 0;
    this.box = { loc: 0, state: 'idle', t: 0, pid: 0, weapon: null, uses: 0, teddy: false };
    this.papUser = 0;
    this.dist = new Float64Array(this.map.w * this.map.h).fill(Infinity);
    this.fieldTimer = 0;
    this.lastKillPos = null;
    this.statsTimer = 0;
    this.time = 0;
    for (const p of this.players.values()) this.resetPlayer(p);
  }

  resetPlayer(p) {
    Object.assign(p, {
      x: 0, y: 0, z: 0, yaw: 0, pitch: 0, flags: 0, cur: 0,
      weapons: [{ id: 'm1911', pap: false }, null],
      perks: new Set(), hp: C.PLAYER_HP, maxHp: C.PLAYER_HP,
      points: START_POINTS, kills: 0, heads: 0, downs: 0, revives: 0,
      downed: false, dead: false, bleed: 0, selfRevive: 0, qrUses: 0, lastHurt: 0,
      grenades: 2, pendingNades: 0, holding: null, holdT: 0, reviveT: 0, reviveBy: 0,
      rebuildPts: 0, papBusy: null, shotTokens: 4, lastShotT: 0, lastKnife: 0, spawned: false,
    });
  }

  // ---------------------------------------------------------------- players
  addPlayer(ws, name) {
    if (this.players.size >= this.maxPlayers) return null;
    const used = new Set([...this.players.values()].map((p) => p.color));
    const color = C.PLAYER_COLORS.find((c) => !used.has(c)) || C.PLAYER_COLORS[0];
    const p = { id: this.nextPid++, ws, name, color, ping: 0 };
    this.resetPlayer(p);
    this.players.set(p.id, p);
    if (!this.hostId || !this.players.has(this.hostId)) this.hostId = p.id;
    this.emptySince = null;

    this.send(p, {
      t: 'welcome', id: p.id, room: this.name, title: this.title, isPrivate: this.isPrivate, max: this.maxPlayers, host: this.hostId, state: this.state,
      ...this.worldState(),
    });
    this.broadcast({ t: 'join', id: p.id, name: p.name, color: p.color }, p.id);
    this.sendStats();
    if (this.state === 'playing') this.spawnPlayer(p);
    this.chatSystem(`${p.name} joined the game`);
    return p;
  }

  configure(opts) {
    this.title = String(opts.name || this.name).replace(/[<>]/g, '').trim().slice(0, 28) || this.name;
    this.maxPlayers = Math.max(1, Math.min(C.MAX_PLAYERS, Number(opts.max) || C.MAX_PLAYERS));
    this.isPrivate = !!opts.private;
    if (opts.map && MAP_LIST.some((m) => m.id === opts.map)) { this.mapId = opts.map; this.map = getMap(opts.map); this.buildInteractables(); this.resetGame(); }
  }

  info() {
    const host = this.players.get(this.hostId);
    return {
      code: this.name, title: this.title, map: this.mapId, mapName: MAP_LIST.find((m) => m.id === this.mapId)?.name || this.mapId,
      players: this.players.size, max: this.maxPlayers, state: this.state, round: this.round, host: host ? host.name : '',
    };
  }

  setMap(id) {
    if (!MAP_LIST.some((m) => m.id === id)) return;
    this.mapId = id;
    this.map = getMap(id);
    this.buildInteractables();
    this.resetGame();
    this.broadcast({ t: 'reset', ...this.worldState() });
    this.sendStats();
  }

  worldState() {
    return {
      map: this.mapId,
      round: this.round, power: this.power, doors: [...this.openDoors], boards: this.boards,
      box: { loc: this.box.loc, state: this.box.state === 'away' ? 'away' : 'idle' },
      pus: [...this.powerups.values()].map((u) => ({ id: u.id, kind: u.kind, x: u.x, z: u.z })),
      insta: Math.max(0, this.insta - this.time), double: Math.max(0, this.double - this.time),
      roundState: this.roundState,
    };
  }

  removePlayer(p) {
    this.players.delete(p.id);
    if (this.papUser === p.id) this.papUser = 0;
    if (this.box.pid === p.id && this.box.state === 'offer') { this.box.state = 'idle'; this.broadcast({ t: 'box', s: 'close' }); }
    this.broadcast({ t: 'leave', id: p.id });
    this.chatSystem(`${p.name} left the game`);
    if (this.hostId === p.id) {
      const next = this.players.values().next().value;
      this.hostId = next ? next.id : 0;
      this.broadcast({ t: 'host', id: this.hostId });
    }
    if (this.players.size === 0) {
      this.emptySince = nowS();
      this.resetGame();
    }
    this.sendStats();
  }

  spawnPlayer(p) {
    const ids = [...this.players.keys()].sort((a, b) => a - b);
    const i = Math.max(0, ids.indexOf(p.id)) % this.map.playerSpawns.length;
    const [x, z] = this.map.playerSpawns[i];
    Object.assign(p, {
      x, y: 0, z, spawned: true, dead: false, downed: false, hp: C.PLAYER_HP, maxHp: C.PLAYER_HP,
      perks: new Set(), selfRevive: 0, reviveT: 0, bleed: 0, holding: null, papBusy: null,
      weapons: [{ id: 'm1911', pap: false }, null], cur: 0, grenades: Math.max(p.grenades, 2),
    });
    this.send(p, { t: 'spawn', x, z, yaw: Math.PI, weapons: p.weapons, cur: 0, hp: p.hp, maxHp: p.maxHp, grenades: p.grenades });
    this.broadcast({ t: 'respawn', id: p.id });
  }

  activePlayers() {
    return [...this.players.values()].filter((p) => p.spawned);
  }

  targets() {
    return [...this.players.values()].filter((p) => p.spawned && !p.dead && !p.downed);
  }

  // ---------------------------------------------------------------- messaging
  send(p, msg) {
    if (p.ws.readyState === 1) p.ws.send(JSON.stringify(msg));
  }

  broadcast(msg, except) {
    const s = JSON.stringify(msg);
    for (const p of this.players.values()) if (p.id !== except && p.ws.readyState === 1) p.ws.send(s);
  }

  chatSystem(msg) {
    this.broadcast({ t: 'chat', id: 0, name: '', msg });
  }

  sendStats() {
    this.broadcast({
      t: 'ps', host: this.hostId,
      p: [...this.players.values()].map((p) => ({
        id: p.id, name: p.name, color: p.color, points: p.points, kills: p.kills, heads: p.heads,
        downs: p.downs, revives: p.revives, perks: [...p.perks], ping: p.ping, spawned: p.spawned,
        grenades: p.grenades, weapons: p.weapons, cur: p.cur,
      })),
    });
  }

  addPoints(p, n, reason) {
    if (n > 0 && reason !== 'flat' && this.double > this.time) n *= 2;
    p.points = Math.max(0, p.points + n);
    this.broadcast({ t: 'pts', id: p.id, n, total: p.points });
  }

  spend(p, cost) {
    if (p.points < cost) {
      this.send(p, { t: 'deny' });
      return false;
    }
    this.addPoints(p, -cost, 'spend');
    return true;
  }

  onMessage(p, msg) {
    switch (msg.t) {
      case 'st': return this.onState(p, msg);
      case 'fire': return this.onFire(p, msg);
      case 'use': return this.onUse(p, msg.id);
      case 'hold': p.holding = typeof msg.id === 'string' ? msg.id : null; p.holdT = 0; return;
      case 'nade': return this.onNade(p, msg);
      case 'chat': {
        const text = String(msg.msg || '').slice(0, 140).trim();
        if (text) this.broadcast({ t: 'chat', id: p.id, name: p.name, color: p.color, msg: text });
        return;
      }
      case 'start':
        if (p.id === this.hostId && this.state === 'lobby') this.startGame();
        return;
      case 'map':
        if (p.id === this.hostId && (this.state === 'lobby' || this.state === 'gameover')) this.setMap(String(msg.id));
        return;
      case 'restart':
        if (p.id === this.hostId && this.state === 'gameover') { this.resetGame(); this.broadcast({ t: 'reset', ...this.worldState() }); this.startGame(); }
        return;
      case 'ping':
        this.send(p, { t: 'pong', c: msg.c, s: Date.now() });
        if (typeof msg.rtt === 'number') p.ping = Math.round(msg.rtt);
        return;
    }
  }

  onState(p, m) {
    if (!p.spawned || p.dead || !Array.isArray(m.p)) return;
    const [x, y, z] = m.p.map(Number);
    if (![x, y, z].every(Number.isFinite)) return;
    p.x = x; p.y = y; p.z = z;
    p.yaw = +m.yaw || 0; p.pitch = +m.pitch || 0;
    p.flags = (m.f | 0) & 0xff;
    if (m.w === 0 || m.w === 1) p.cur = m.w;
  }

  startGame() {
    this.state = 'playing';
    this.roundState = 'pre';
    this.roundTimer = 3.5;
    this.broadcast({ t: 'start' });
    for (const p of this.players.values()) {
      this.resetPlayer(p);
      this.spawnPlayer(p);
    }
    this.sendStats();
  }

  // ---------------------------------------------------------------- interactions
  onUse(p, id) {
    if (this.state !== 'playing' || !p.spawned || p.dead || p.downed) return;
    if (id === 'box') return this.useBox(p);
    const it = this.inter.get(id);
    if (!it) return;
    if (Math.hypot(p.x - it.x, p.z - it.z) > 3.2) return;
    switch (it.type) {
      case 'door': {
        const d = it.door;
        if (this.openDoors.has(d.id)) return;
        if (!this.spend(p, d.cost)) return;
        this.openDoors.add(d.id);
        for (const z of d.zones) this.activeZones.add(z);
        this.broadcast({ t: 'door', id: d.id, by: p.id });
        this.computeField();
        return;
      }
      case 'wall': {
        const wid = it.obj.weapon;
        const st = WEAPONS[wid];
        const owned = p.weapons.find((w) => w && w.id === wid);
        if (owned) {
          const cost = owned.pap ? C.PAP_AMMO_COST : Math.floor(st.cost / 2);
          if (!this.spend(p, cost)) return;
          this.broadcast({ t: 'ammo', pid: p.id, id: wid });
        } else {
          if (!this.spend(p, st.cost)) return;
          this.giveWeapon(p, wid, false);
        }
        this.broadcast({ t: 'sfx', s: 'buy', x: it.x, z: it.z });
        return;
      }
      case 'perk': {
        const key = it.obj.perk;
        const perk = C.PERKS[key];
        if (p.perks.has(key)) return;
        if (perk.power && !this.power) { this.send(p, { t: 'deny', reason: 'power' }); return; }
        const solo = this.activePlayers().length === 1;
        const cost = solo && perk.soloCost ? perk.soloCost : perk.cost;
        if (key === 'revive' && solo && p.qrUses >= C.SOLO_QR_USES) { this.send(p, { t: 'deny' }); return; }
        if (!this.spend(p, cost)) return;
        p.perks.add(key);
        if (key === 'jugg') { p.maxHp = C.JUGG_HP; p.hp = C.JUGG_HP; }
        this.broadcast({ t: 'perk', pid: p.id, perk: key });
        this.sendStats();
        return;
      }
      case 'power': {
        if (this.power) return;
        this.power = true;
        this.broadcast({ t: 'power', by: p.id });
        return;
      }
      case 'pap': {
        if (!this.power) { this.send(p, { t: 'deny', reason: 'power' }); return; }
        if (this.papUser) return;
        const w = p.weapons[p.cur];
        if (!w || w.pap) return;
        if (!this.spend(p, C.PAP_COST)) return;
        this.papUser = p.id;
        p.papBusy = { slot: p.cur, id: w.id, until: this.time + 3.6 };
        p.weapons[p.cur] = null;
        this.broadcast({ t: 'pap', s: 'start', pid: p.id, slot: p.papBusy.slot, w: w.id });
        return;
      }
    }
  }

  giveWeapon(p, id, pap) {
    let slot = p.weapons.findIndex((w) => w && w.id === id);
    if (slot >= 0) {
      p.weapons[slot] = { id, pap: pap || p.weapons[slot].pap };
    } else {
      const busy = p.papBusy ? p.papBusy.slot : -1;
      slot = p.weapons.findIndex((w, i) => !w && i !== busy);
      if (slot < 0) {
        slot = p.cur;
        if (slot === busy) slot = 1 - slot;
      }
      p.weapons[slot] = { id, pap };
    }
    p.cur = slot;
    this.broadcast({ t: 'give', pid: p.id, slot, id, pap: p.weapons[slot].pap });
  }

  useBox(p) {
    const loc = this.map.boxLocs[this.box.loc];
    if (Math.hypot(p.x - (loc.x + 0.5), p.z - (loc.y + 0.5)) > 3.2) return;
    const b = this.box;
    if (b.state === 'idle') {
      if (!this.spend(p, C.BOX_COST)) return;
      b.uses++;
      b.state = 'spin';
      b.t = 3.6;
      b.pid = p.id;
      b.teddy = b.uses >= 4 && Math.random() < 0.2 && this.map.boxLocs.length > 1;
      b.weapon = b.teddy ? null : pickBoxWeapon(p.weapons.filter(Boolean).map((w) => w.id));
      this.broadcast({ t: 'box', s: 'spin', pid: p.id, w: b.weapon, teddy: b.teddy });
    } else if (b.state === 'offer' && b.pid === p.id) {
      b.state = 'idle';
      this.giveWeapon(p, b.weapon, false);
      this.broadcast({ t: 'box', s: 'take' });
    }
  }

  updateBox(dt) {
    const b = this.box;
    if (b.state === 'idle') return;
    b.t -= dt;
    if (b.t > 0) return;
    if (b.state === 'spin') {
      if (b.teddy) {
        b.state = 'leaving';
        b.t = 3.5;
        const p = this.players.get(b.pid);
        if (p) this.addPoints(p, C.BOX_COST, 'flat');
        this.broadcast({ t: 'box', s: 'teddy' });
      } else {
        b.state = 'offer';
        b.t = 10;
        this.broadcast({ t: 'box', s: 'offer', pid: b.pid, w: b.weapon });
      }
    } else if (b.state === 'offer') {
      b.state = 'idle';
      this.broadcast({ t: 'box', s: 'close' });
    } else if (b.state === 'leaving') {
      b.state = 'away';
      b.t = 3;
      this.broadcast({ t: 'box', s: 'gone' });
    } else if (b.state === 'away') {
      let next = b.loc;
      while (next === b.loc) next = Math.floor(Math.random() * this.map.boxLocs.length);
      b.loc = next;
      b.uses = 0;
      b.state = 'idle';
      this.broadcast({ t: 'box', s: 'move', loc: next });
    }
  }

  onNade(p, m) {
    if (this.state !== 'playing' || p.dead || p.grenades <= 0) return;
    p.grenades--;
    p.pendingNades++;
    this.broadcast({ t: 'nade', pid: p.id, o: m.o, v: m.v }, p.id);
  }

  // ---------------------------------------------------------------- combat
  onFire(p, m) {
    if (this.state !== 'playing' || !p.spawned || p.dead) return;
    const k = m.k;
    let hits = Array.isArray(m.h) ? m.h : [];
    const t = this.time;
    let stats = null;

    if (k === 'knife') {
      if (t - p.lastKnife < 0.35) return;
      p.lastKnife = t;
      hits = hits.slice(0, 1);
    } else if (k === 'nade') {
      if (p.pendingNades <= 0) return;
      p.pendingNades--;
      hits = hits.slice(0, 40);
    } else {
      const owns = p.weapons.some((w) => w && w.id === m.w && !!w.pap === !!m.pap)
        || (p.downed && m.w === 'm1911');
      if (!owns) return;
      stats = weaponStats(m.w, m.pap);
      if (!stats) return;
      // Token bucket fire-rate check (lenient for network jitter)
      const interval = 60 / stats.rpm * (p.perks.has('dtap') ? 0.75 : 1);
      p.shotTokens = Math.min(4, p.shotTokens + (t - p.lastShotT) / interval);
      p.lastShotT = t;
      if (p.shotTokens < 0.9) return;
      p.shotTokens -= 1;
      const cap = stats.kind === 'thunder' ? 40 : stats.splash ? 40 : stats.pellets * stats.pen + 2;
      hits = hits.slice(0, cap);
      this.broadcast({ t: 'fx', pid: p.id, w: m.w, pap: !!m.pap, o: m.o, d: m.d, e: m.e }, p.id);
    }

    for (const h of hits) {
      if (!Array.isArray(h)) continue;
      const z = this.zombies.get(h[0] | 0);
      if (!z) continue;
      const part = h[1] | 0; // 0 body, 1 head, 3 direct projectile, 4 splash
      const dist = Math.max(0, +h[2] || 0);
      let dmg = 0;
      let killKind = 'body';
      if (k === 'knife') { dmg = C.KNIFE_DAMAGE; killKind = 'knife'; }
      else if (k === 'nade') {
        dmg = (150 + this.round * 45) * (1 - Math.min(1, dist / 6) * 0.65);
        killKind = 'splash';
      } else if (stats.kind === 'thunder') {
        dmg = 1e9; killKind = 'thunder';
      } else if (part === 4 && stats.splash) {
        dmg = stats.splash.dmg * (1 - Math.min(1, dist / stats.splash.r) * 0.6);
        killKind = 'splash';
      } else {
        // limbs (5-8) take a little less damage than the torso
        const mult = part === 1 ? stats.head : part >= 5 && part <= 8 ? 0.8 : 1;
        dmg = stats.dmg * mult * (dist > stats.range ? 0.6 : 1);
        if (part === 3) killKind = 'splash';
        else if (part === 1) killKind = 'head';
      }
      this.damageZombie(z, dmg, p, killKind, m.d, part, stats ? stats.cls : k);
    }
  }

  damageZombie(z, dmg, p, kind, dir, part = 0, cls = '') {
    if (this.insta > this.time) dmg = 1e9;
    // damage from the same shot (all shotgun pellets) adds up for gore purposes
    z.burst = z.burstT === this.time ? z.burst + dmg : dmg;
    z.burstT = this.time;
    z.hp -= dmg;
    if (z.hp <= 0) {
      this.killZombie(z, p, kind, dir, part, Math.min(9, z.burst / Math.max(1, z.maxHp)));
      return;
    }
    if (kind !== 'thunder' && kind !== 'splash') this.addPoints(p, 10, 'hit');
    // dismemberment: limbs that soak enough damage come off (dogs keep theirs)
    if (z.type === 0 && part >= 5 && part <= 8) {
      const bit = LIMB_BIT[part];
      if (!(z.lost & bit)) {
        z.limbDmg[part] = (z.limbDmg[part] || 0) + dmg;
        if (z.burst >= z.maxHp * 0.3) z.limbDmg[part] = Infinity;
        const heavy = cls === 'shotgun' || cls === 'sniper' || cls === 'lmg';
        if (z.limbDmg[part] >= z.maxHp * (heavy ? 0.25 : 0.4)) {
          z.lost |= bit;
          if (part >= 7 && !z.crawler) {
            // lost a leg: it drops and crawls (BO1 crawlers)
            z.crawler = true;
            z.speed = 0.85 + Math.random() * 0.25;
            if (z.state === 'climb' || z.state === 'board') z.state = 'move';
          }
          this.broadcast({ t: 'zlimb', id: z.id, l: part, d: Array.isArray(dir) ? dir.slice(0, 3).map((v) => r2(+v || 0)) : null });
        }
      }
    }
  }

  killZombie(z, p, kind, dir, part = 0, overkill = 0) {
    this.zombies.delete(z.id);
    this.lastKillPos = [z.x, z.z];
    let fling = null;
    if (kind === 'thunder' && Array.isArray(dir)) fling = [r2(+dir[0] || 0), r2(+dir[2] || 0)];
    const d = Array.isArray(dir) ? dir.slice(0, 3).map((v) => r2(+v || 0)) : null;
    this.broadcast({ t: 'zdie', id: z.id, by: p ? p.id : 0, k: kind, f: fling, p: part, o: r2(overkill), d });
    if (p) {
      p.kills++;
      if (kind === 'head') p.heads++;
      const pts = kind === 'knife' ? 130 : kind === 'head' ? 100 : kind === 'body' ? 60 : 50;
      this.addPoints(p, pts, 'kill');
      this.maybeDropPowerup(z);
    }
  }

  maybeDropPowerup(z) {
    if (this.dogRound || this.puThisRound >= C.POWERUPS_PER_ROUND) return;
    if (Math.random() > 0.045) return;
    let x = z.x, zz = z.z;
    if (cellAt(Math.floor(x), Math.floor(zz), this.map) !== T.FLOOR) {
      // killed outside a window: drop it just inside the nearest window
      let best = null, bd = 6;
      for (const w of this.map.windows) {
        const d = Math.hypot(w.x + 0.5 - x, w.y + 0.5 - zz);
        if (d < bd) { bd = d; best = w; }
      }
      if (!best) return;
      x = best.inside[0] + 0.5; zz = best.inside[1] + 0.5;
    }
    const kinds = ['maxammo', 'maxammo', 'insta', 'double', 'double', 'nuke'];
    if (this.boards.some((b) => b < BOARDS_PER_WINDOW)) kinds.push('carpenter');
    const kind = kinds[Math.floor(Math.random() * kinds.length)];
    this.spawnPowerup(kind, x, zz);
    this.puThisRound++;
  }

  spawnPowerup(kind, x, z) {
    const u = { id: this.nextPuId++, kind, x: r2(x), z: r2(z), expire: this.time + C.POWERUP_LIFETIME };
    this.powerups.set(u.id, u);
    this.broadcast({ t: 'pu', id: u.id, kind, x: u.x, z: u.z });
  }

  updatePowerups() {
    for (const u of this.powerups.values()) {
      if (this.time > u.expire) {
        this.powerups.delete(u.id);
        this.broadcast({ t: 'pug', id: u.id, kind: u.kind, by: 0 });
        continue;
      }
      for (const p of this.targets()) {
        if (Math.hypot(p.x - u.x, p.z - u.z) < 1.3 && p.y < 2) {
          this.powerups.delete(u.id);
          this.applyPowerup(u, p);
          break;
        }
      }
    }
  }

  applyPowerup(u, p) {
    this.broadcast({ t: 'pug', id: u.id, kind: u.kind, by: p.id });
    switch (u.kind) {
      case 'maxammo':
        for (const q of this.players.values()) q.grenades = C.MAX_GRENADES;
        this.broadcast({ t: 'maxammo' });
        break;
      case 'insta':
        this.insta = this.time + C.POWERUP_DURATION;
        break;
      case 'double':
        this.double = this.time + C.POWERUP_DURATION;
        break;
      case 'nuke':
        for (const z of [...this.zombies.values()]) {
          this.zombies.delete(z.id);
          this.broadcast({ t: 'zdie', id: z.id, by: 0, k: 'nuke' });
        }
        for (const q of this.activePlayers()) this.addPoints(q, 400, 'flat');
        break;
      case 'carpenter':
        this.boards = this.boards.map(() => BOARDS_PER_WINDOW);
        this.broadcast({ t: 'boards', b: this.boards });
        for (const q of this.activePlayers()) this.addPoints(q, 200, 'flat');
        break;
    }
    this.sendStats();
  }

  // ---------------------------------------------------------------- player health
  hurtPlayer(p, dmg, z) {
    if (p.downed || p.dead) return;
    if (process.env.DEV_GOD) return; // test mode: players cannot be hurt
    p.hp -= dmg;
    p.lastHurt = this.time;
    this.send(p, { t: 'hurt', hp: Math.max(0, p.hp), from: [r2(z.x), r2(z.z)] });
    if (p.hp <= 0) this.downPlayer(p);
  }

  downPlayer(p) {
    p.hp = 0;
    p.downs++;
    const solo = this.activePlayers().length === 1;
    p.selfRevive = 0;
    if (solo && p.perks.has('revive') && p.qrUses < C.SOLO_QR_USES) {
      p.qrUses++;
      p.selfRevive = C.SOLO_QR_TIME;
    }
    p.perks.clear();
    p.maxHp = C.PLAYER_HP;
    p.downed = true;
    p.bleed = C.BLEEDOUT_TIME;
    p.reviveT = 0;
    p.holding = null;
    this.broadcast({ t: 'down', id: p.id, self: p.selfRevive > 0 });
    this.sendStats();
  }

  revivePlayer(p, by) {
    p.downed = false;
    p.selfRevive = 0;
    p.hp = p.maxHp;
    p.reviveT = 0;
    p.reviveBy = 0;
    if (by) by.revives++;
    this.broadcast({ t: 'revived', id: p.id, by: by ? by.id : 0 });
    this.sendStats();
  }

  updatePlayers(dt) {
    for (const p of this.players.values()) p._revivedBy = 0;
    for (const p of this.players.values()) {
      if (!p.spawned || p.dead) continue;
      if (!p.downed && p.hp < p.maxHp && this.time - p.lastHurt > C.REGEN_DELAY) {
        p.hp = Math.min(p.maxHp, p.hp + p.maxHp * dt * 1.2);
      }
      if (p.papBusy && this.time >= p.papBusy.until) {
        const { slot, id } = p.papBusy;
        p.papBusy = null;
        this.papUser = 0;
        p.weapons[slot] = { id, pap: true };
        p.cur = slot;
        this.broadcast({ t: 'give', pid: p.id, slot, id, pap: true });
        this.broadcast({ t: 'pap', s: 'done', pid: p.id });
      }
      if (!p.holding || p.downed) continue;
      const [kind, ref] = p.holding.split(':');
      if (kind === 'win') {
        const it = this.inter.get(p.holding);
        if (!it) continue;
        const wi = it.win.id;
        if (Math.hypot(p.x - it.x, p.z - it.z) > 2.6 || this.boards[wi] >= BOARDS_PER_WINDOW) { p.holdT = 0; continue; }
        p.holdT += dt;
        const need = p.perks.has('speed') ? 0.45 : 0.9;
        if (p.holdT >= need) {
          p.holdT = 0;
          this.boards[wi]++;
          this.broadcast({ t: 'board', w: wi, n: this.boards[wi], add: true });
          if (p.rebuildPts < C.REBUILD_POINTS_CAP) {
            p.rebuildPts += 10;
            this.addPoints(p, 10, 'rebuild');
          }
        }
      } else if (kind === 'rev') {
        const t = this.players.get(+ref);
        if (!t || !t.downed || t.dead || Math.hypot(p.x - t.x, p.z - t.z) > 2.4) continue;
        t._revivedBy = p.id;
        t.reviveT += dt;
        const need = p.perks.has('revive') ? C.REVIVE_TIME_QR : C.REVIVE_TIME;
        if (t.reviveT >= need) this.revivePlayer(t, p);
      }
    }
    for (const p of this.players.values()) {
      if (!p.downed || p.dead) continue;
      if (p._revivedBy) { p.reviveBy = p._revivedBy; continue; }
      p.reviveBy = 0;
      p.reviveT = 0;
      if (p.selfRevive > 0) {
        p.selfRevive -= dt;
        if (p.selfRevive <= 0) this.revivePlayer(p, null);
        continue;
      }
      p.bleed -= dt;
      if (p.bleed <= 0) {
        p.dead = true;
        p.downed = false;
        p.perks.clear();
        this.broadcast({ t: 'dead', id: p.id });
        this.chatSystem(`${p.name} bled out`);
      }
    }
  }

  checkGameOver() {
    const active = this.activePlayers();
    if (!active.length) return;
    const standing = active.filter((p) => !p.dead && (!p.downed || p.selfRevive > 0));
    if (standing.length) return;
    this.state = 'gameover';
    this.broadcast({
      t: 'gameover', round: this.round,
      stats: active.map((p) => ({ id: p.id, name: p.name, color: p.color, points: p.points, kills: p.kills, heads: p.heads, downs: p.downs, revives: p.revives })),
    });
  }

  // ---------------------------------------------------------------- rounds
  startRound() {
    this.round++;
    const n = Math.max(1, this.activePlayers().length);
    this.dogRound = this.round === this.nextDogRound;
    if (this.dogRound) {
      this.toSpawn = C.dogCount(this.round, n);
      this.nextDogRound += 4 + Math.floor(Math.random() * 3);
    } else {
      this.toSpawn = C.zombieCount(this.round, n);
    }
    this.roundState = 'active';
    this.spawnTimer = this.dogRound ? 3 : 1.5;
    this.puThisRound = 0;
    for (const p of this.players.values()) {
      p.rebuildPts = 0;
      if (p.dead && p.spawned) { p.grenades = 2; this.spawnPlayer(p); }
      else p.grenades = Math.min(C.MAX_GRENADES, p.grenades + 2);
    }
    this.broadcast({ t: 'round', n: this.round, dog: this.dogRound });
    this.sendStats();
  }

  endRound() {
    this.roundState = 'break';
    this.roundTimer = C.ROUND_BREAK;
    if (this.dogRound && this.lastKillPos) this.spawnPowerup('maxammo', this.lastKillPos[0], this.lastKillPos[1]);
    this.broadcast({ t: 'roundEnd', n: this.round });
  }

  // ---------------------------------------------------------------- zombie AI
  walkable(x, y) {
    if (x < 0 || y < 0 || x >= this.map.w || y >= this.map.h) return false;
    if (!this.walkMap || this.walkDoors !== this.openDoors.size) this.buildWalkMap();
    return this.walkMap[y * this.map.w + x] === 1;
  }

  buildWalkMap() {
    this.walkMap = new Uint8Array(this.map.w * this.map.h);
    this.walkDoors = this.openDoors.size;
    for (let y = 0; y < this.map.h; y++)
      for (let x = 0; x < this.map.w; x++) {
        const t = cellAt(x, y, this.map);
        const ok = t === T.FLOOR || t === T.YARD || t === T.WINDOW || (t === T.DOOR && this.isDoorCellOpen(x, y));
        this.walkMap[y * this.map.w + x] = ok ? 1 : 0;
      }
  }

  isDoorCellOpen(x, y) {
    for (const d of this.map.doors) if (this.openDoors.has(d.id) && d.cells.some((c) => c[0] === x && c[1] === y)) return true;
    return false;
  }

  zSolid(x, y) {
    const t = cellAt(x, y, this.map);
    if (t === T.WALL || t === T.CRATE || t === T.BLOCK) return true;
    if (t === T.DOOR) return !this.isDoorCellOpen(x, y);
    if (t === T.WINDOW) {
      const w = windowAtCell(x, y, this.map);
      return !w || this.boards[w.id] > 0;
    }
    return false;
  }

  computeField() {
    const dist = this.dist;
    dist.fill(Infinity);
    const heap = new MinHeap();
    for (const p of this.targets()) {
      const cx = Math.floor(p.x), cy = Math.floor(p.z);
      if (cx < 0 || cy < 0 || cx >= this.map.w || cy >= this.map.h) continue;
      const i = cy * this.map.w + cx;
      dist[i] = 0;
      heap.push(i, 0);
    }
    while (heap.size) {
      const [i, d] = heap.pop();
      if (d > dist[i]) continue;
      const x = i % this.map.w, y = (i / this.map.w) | 0;
      for (const [dx, dy, c] of DIRS) {
        const nx = x + dx, ny = y + dy;
        if (!this.walkable(nx, ny)) continue;
        if (dx && dy && (!this.walkable(x + dx, y) || !this.walkable(x, y + dy))) continue;
        const ni = ny * this.map.w + nx;
        const nd = d + c;
        if (nd < dist[ni]) { dist[ni] = nd; heap.push(ni, nd); }
      }
    }
  }

  lineClear(x0, z0, x1, z1) {
    const dx = x1 - x0, dz = z1 - z0;
    const len = Math.hypot(dx, dz);
    const steps = Math.ceil(len / 0.3);
    const nx = -dz / (len || 1) * 0.3, nz = dx / (len || 1) * 0.3;
    for (let s = 1; s <= steps; s++) {
      const f = s / steps;
      const x = x0 + dx * f, z = z0 + dz * f;
      if (!this.walkable(Math.floor(x + nx), Math.floor(z + nz)) || !this.walkable(Math.floor(x - nx), Math.floor(z - nz))) return false;
      const t = cellAt(Math.floor(x), Math.floor(z), this.map);
      if (t === T.WINDOW || t === T.YARD) return false;
    }
    return true;
  }

  spawnZombie() {
    const dog = this.dogRound;
    const z = {
      id: this.nextZid++, type: dog ? 1 : 0, x: 0, z: 0, y: 0, yaw: 0, vx: 0, vz: 0,
      state: 'rise', t: dog ? 0.9 : 1.3, attackCd: 0, tier: 0, speed: 0,
      hp: 0, maxHp: 1, stuckT: 0, checkT: 0, lastX: 0, lastZ: 0, win: -1, lost: 0, limbDmg: {}, crawler: false,
    };
    if (dog) {
      z.hp = C.dogHealth(this.round);
      z.maxHp = z.hp;
      z.speed = C.DOG_SPEED;
      z.tier = 3;
      const spot = this.findDogSpot();
      if (!spot) return false;
      [z.x, z.z] = spot;
    } else {
      z.hp = C.zombieHealth(this.round);
      z.maxHp = z.hp;
      z.tier = C.pickZombieSpeedTier(this.round);
      z.speed = C.ZOMBIE_SPEEDS[z.tier] * (0.92 + Math.random() * 0.16);
      const spot = this.findWindowSpawn();
      if (!spot) return false;
      [z.x, z.z] = spot;
    }
    z.lastX = z.x; z.lastZ = z.z;
    this.zombies.set(z.id, z);
    return true;
  }

  findWindowSpawn() {
    const wins = this.map.windows.filter((w) => this.activeZones.has(w.zone));
    if (!wins.length) return null;
    const scored = wins.map((w) => ({ w, d: this.dist[w.inside[1] * this.map.w + w.inside[0]] })).sort((a, b) => a.d - b.d);
    const pickFrom = scored.slice(0, Math.max(3, Math.ceil(scored.length * 0.6)));
    const { w } = pickFrom[Math.floor(Math.random() * pickFrom.length)];
    const [cx, cy] = w.spawnCells[Math.floor(Math.random() * w.spawnCells.length)];
    return [cx + 0.3 + Math.random() * 0.4, cy + 0.3 + Math.random() * 0.4];
  }

  findDogSpot() {
    const cands = [];
    for (let y = 0; y < this.map.h; y++)
      for (let x = 0; x < this.map.w; x++) {
        if (cellAt(x, y, this.map) !== T.FLOOR || !this.activeZones.has(zoneAt(x, y, this.map))) continue;
        const d = this.dist[y * this.map.w + x];
        if (d >= 8 && d <= 18) cands.push([x + 0.5, y + 0.5]);
      }
    if (!cands.length) return this.findWindowSpawn();
    return cands[Math.floor(Math.random() * cands.length)];
  }

  respawnStuck(z) {
    const spot = z.type === 1 ? this.findDogSpot() : this.findWindowSpawn();
    if (!spot) return;
    [z.x, z.z] = spot;
    z.y = 0; z.vx = 0; z.vz = 0;
    z.state = 'rise';
    z.t = 1.0;
    z.stuckT = 0;
    z.lastX = z.x; z.lastZ = z.z;
  }

  updateZombies(dt) {
    const targets = this.targets();
    const zs = [...this.zombies.values()];
    for (const z of zs) {
      z.attackCd -= dt;
      if (z.state === 'rise') {
        z.t -= dt;
        if (z.t <= 0) { z.state = 'move'; }
        continue;
      }

      // nearest target
      let tgt = null, td = Infinity;
      for (const p of targets) {
        const d = Math.hypot(p.x - z.x, p.z - z.z);
        if (d < td) { td = d; tgt = p; }
      }

      if (z.state === 'attack') {
        z.t -= dt;
        z.vx *= 0.8; z.vz *= 0.8;
        if (z.t <= 0) {
          z.state = z.win >= 0 && this.boards[z.win] > 0 ? 'board' : 'move';
          if (tgt && td < (z.win >= 0 ? 2.2 : 1.75) && tgt.y < 1.9) this.hurtPlayer(tgt, z.type === 1 ? C.DOG_HIT : C.ZOMBIE_HIT, z);
        }
        continue;
      }

      const reach = z.state === 'board' ? 2.0 : z.crawler ? 1.1 : 1.25;
      if (tgt && td < reach && tgt.y < 1.9 && z.attackCd <= 0) {
        z.state = 'attack';
        z.t = z.type === 1 ? 0.3 : 0.45;
        z.attackCd = z.type === 1 ? 0.9 : 1.25;
        z.yaw = Math.atan2(tgt.x - z.x, tgt.z - z.z);
        continue;
      }

      const cx = Math.floor(z.x), cy = Math.floor(z.z);
      const ci = cy * this.map.w + cx;
      const cellType = cellAt(cx, cy, this.map);

      if (z.state === 'board') {
        const w = this.map.windows[z.win];
        if (!w || this.boards[w.id] <= 0) { z.state = 'move'; z.win = -1; }
        else {
          // stand just outside the window and rip boards off
          const sx = w.outside[0] + 0.5 - w.dir[0] * 0.25, sz = w.outside[1] + 0.5 - w.dir[1] * 0.25;
          z.x += (sx - z.x) * Math.min(1, dt * 4);
          z.z += (sz - z.z) * Math.min(1, dt * 4);
          z.yaw = Math.atan2(-w.dir[0], -w.dir[1]);
          z.vx = 0; z.vz = 0;
          this.tearCd[w.id] -= dt;
          if (this.tearCd[w.id] <= 0) {
            this.tearCd[w.id] = z.tier >= 2 ? 0.8 : 1.15;
            this.boards[w.id]--;
            this.broadcast({ t: 'board', w: w.id, n: this.boards[w.id] });
          }
          continue;
        }
      }

      let dirX = 0, dirZ = 0;
      const inWindow = cellType === T.WINDOW;
      const canDirect = tgt && td < 16 && cellType !== T.YARD && !inWindow && this.lineClear(z.x, z.z, tgt.x, tgt.z);
      if (canDirect) {
        dirX = tgt.x - z.x; dirZ = tgt.z - z.z;
      } else {
        let best = this.dist[ci], bx = -1, by = -1;
        for (const [dx, dy] of DIRS) {
          const nx = cx + dx, ny = cy + dy;
          if (!this.walkable(nx, ny)) continue;
          if (dx && dy && (!this.walkable(cx + dx, cy) || !this.walkable(cx, cy + dy))) continue;
          const d = this.dist[ny * this.map.w + nx];
          if (d < best - 0.01) { best = d; bx = nx; by = ny; }
        }
        if (bx >= 0) {
          if (cellAt(bx, by, this.map) === T.WINDOW && !inWindow) {
            const w = windowAtCell(bx, by, this.map);
            if (w && this.boards[w.id] > 0) {
              if (Math.hypot(z.x - (w.outside[0] + 0.5), z.z - (w.outside[1] + 0.5)) < 1.1) {
                z.state = 'board';
                z.win = w.id;
                if (this.tearCd[w.id] < 0.3) this.tearCd[w.id] = 0.6;
                continue;
              }
              bx = w.outside[0]; by = w.outside[1];
            }
          }
          dirX = bx + 0.5 - z.x; dirZ = by + 0.5 - z.z;
        } else if (tgt) {
          dirX = tgt.x - z.x; dirZ = tgt.z - z.z;
        }
        if (!Number.isFinite(this.dist[ci])) z.stuckT += dt;
      }

      const len = Math.hypot(dirX, dirZ);
      let speed = z.speed;
      if (inWindow) speed = Math.min(speed, 1.6);
      if (len > 0.001) { dirX /= len; dirZ /= len; }
      // separation from other zombies
      let sx = 0, sz = 0;
      for (const o of zs) {
        if (o === z || o.state === 'rise') continue;
        const ox = z.x - o.x, oz = z.z - o.z;
        const d2 = ox * ox + oz * oz;
        if (d2 < 0.5 && d2 > 1e-6) {
          const d = Math.sqrt(d2);
          sx += ox / d * (0.71 - d);
          sz += oz / d * (0.71 - d);
        }
      }
      const tvx = dirX * speed + sx * 4, tvz = dirZ * speed + sz * 4;
      const a = Math.min(1, dt * (z.type === 1 ? 10 : 7));
      z.vx += (tvx - z.vx) * a;
      z.vz += (tvz - z.vz) * a;
      z.x += z.vx * dt;
      z.z += z.vz * dt;
      this.collide(z, z.type === 1 ? 0.35 : 0.3);
      if (Math.hypot(z.vx, z.vz) > 0.3) {
        const want = Math.atan2(z.vx, z.vz);
        let dy = want - z.yaw;
        while (dy > Math.PI) dy -= Math.PI * 2;
        while (dy < -Math.PI) dy += Math.PI * 2;
        z.yaw += dy * Math.min(1, dt * 10);
      }
      // window vault height
      const ncx = Math.floor(z.x), ncy = Math.floor(z.z);
      if (cellAt(ncx, ncy, this.map) === T.WINDOW) {
        const w = windowAtCell(ncx, ncy, this.map);
        const along = w.dir[0] !== 0 ? z.x - ncx : z.z - ncy;
        z.y = WINDOW_SILL * Math.sin(Math.PI * Math.min(1, Math.max(0, along)));
        z.state = 'climb';
      } else {
        z.y = 0;
        if (z.state === 'climb') z.state = 'move';
      }

      // stuck detection
      z.checkT += dt;
      if (z.checkT > 4) {
        const moved = Math.hypot(z.x - z.lastX, z.z - z.lastZ);
        if (moved < 0.8 && td > 3) z.stuckT += z.checkT; else z.stuckT = Math.max(0, z.stuckT - 4);
        z.checkT = 0; z.lastX = z.x; z.lastZ = z.z;
      }
      if (z.stuckT > 14) this.respawnStuck(z);
    }
  }

  collide(z, r) {
    for (let iter = 0; iter < 2; iter++) {
      const cx = Math.floor(z.x), cy = Math.floor(z.z);
      for (let y = cy - 1; y <= cy + 1; y++)
        for (let x = cx - 1; x <= cx + 1; x++) {
          if (!this.zSolid(x, y)) continue;
          const px = Math.max(x, Math.min(z.x, x + 1));
          const pz = Math.max(y, Math.min(z.z, y + 1));
          let dx = z.x - px, dz = z.z - pz;
          const d = Math.hypot(dx, dz);
          if (d >= r) continue;
          if (d < 1e-5) {
            // centre inside the cell: push out along shortest axis
            const l = z.x - x, rr = x + 1 - z.x, t = z.z - y, b = y + 1 - z.z;
            const m = Math.min(l, rr, t, b);
            if (m === l) z.x = x - r; else if (m === rr) z.x = x + 1 + r; else if (m === t) z.z = y - r; else z.z = y + 1 + r;
          } else {
            z.x += dx / d * (r - d);
            z.z += dz / d * (r - d);
          }
        }
    }
  }

  // ---------------------------------------------------------------- main loop
  tick() {
    const dt = DT;
    if (this.players.size === 0) {
      if (this.emptySince && nowS() - this.emptySince > 60) this.onEmpty(this);
      return;
    }
    this.time += dt;

    if (this.state === 'playing') {
      this.fieldTimer -= dt;
      if (this.fieldTimer <= 0) { this.computeField(); this.fieldTimer = 0.25; }

      if (this.roundState === 'pre' || this.roundState === 'break') {
        this.roundTimer -= dt;
        if (this.roundTimer <= 0) this.startRound();
      } else if (this.roundState === 'active') {
        const n = Math.max(1, this.activePlayers().length);
        this.spawnTimer -= dt;
        if (this.toSpawn > 0 && this.spawnTimer <= 0 && this.zombies.size < C.maxAlive(n)) {
          if (this.spawnZombie()) this.toSpawn--;
          this.spawnTimer = this.dogRound ? 0.6 + Math.random() * 0.8 : C.spawnInterval(this.round) * (0.6 + Math.random() * 0.8) / Math.sqrt(n);
        }
        if (this.toSpawn <= 0 && this.zombies.size === 0) this.endRound();
      }

      this.updateZombies(dt);
      this.updatePlayers(dt);
      this.updatePowerups();
      this.updateBox(dt);
      this.checkGameOver();
    }

    this.statsTimer -= dt;
    if (this.statsTimer <= 0) { this.statsTimer = 1; this.sendStats(); }
    this.sendSnapshot();
  }

  sendSnapshot() {
    const P = [];
    for (const p of this.players.values()) {
      if (!p.spawned) continue;
      const flags = (p.flags & 0b11100) | (p.downed ? 1 : 0) | (p.dead ? 2 : 0) | (p.reviveBy ? 64 : 0) | (p.selfRevive > 0 ? 128 : 0);
      const w = p.weapons[p.cur];
      P.push([p.id, r2(p.x), r2(p.y), r2(p.z), r2(p.yaw), r2(p.pitch), flags, w ? w.id : '', w && w.pap ? 1 : 0, Math.round(p.hp),
        p.downed ? Math.round(p.selfRevive > 0 ? p.selfRevive : p.bleed) : 0, p.reviveT ? r2(p.reviveT) : 0]);
    }
    const Z = [];
    const sc = { move: 0, attack: 1, board: 2, rise: 3, climb: 4 };
    for (const z of this.zombies.values()) {
      Z.push([z.id, z.type, r2(z.x), r2(z.y), r2(z.z), r2(z.yaw), sc[z.state] ?? 0, z.tier, z.lost]);
    }
    this.broadcast({
      t: 's', ts: Date.now(), st: this.state, rs: this.roundState, r: this.round,
      left: this.toSpawn + this.zombies.size, P, Z,
      ins: this.insta > this.time ? r2(this.insta - this.time) : 0,
      dbl: this.double > this.time ? r2(this.double - this.time) : 0,
      bx: this.box.state, bl: this.box.loc,
    });
  }
}
