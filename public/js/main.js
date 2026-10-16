import * as THREE from 'three';
import { MAP, setMap, MAP_LIST, BOARDS_PER_WINDOW } from '/shared/map.js';
import { PERKS, POWERUP_NAMES, BOX_COST, PAP_COST, PAP_AMMO_COST, REVIVE_TIME, REVIVE_TIME_QR, BLEEDOUT_TIME, SOLO_QR_TIME } from '/shared/config.js';
import { WEAPONS, weaponStats } from '/shared/weapons.js';
import { World } from './world.js';
import { FX } from './fx.js';
import { Net } from './net.js';
import { LocalPlayer } from './player.js';
import { Weapons } from './weapons.js';
import { Zombies, RemotePlayers, Powerups, goreCfg } from './entities.js';
import { HUD, esc } from './hud.js';
import { audio } from './audio.js';
import { PostFX, QUALITY } from './post.js';
import { loadGunModels } from './assets.js';
import { loadArms } from './arms.js';
import { loadRig } from './rig.js';
import { GamepadControls, TouchControls, isTouchDevice } from './controls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const $ = (id) => document.getElementById(id);

// ------------------------------------------------------------------ settings
const settings = { sens: 1, padSens: 1, touchSens: 1, aimAssist: true, vibration: true, adsSens: 0.8, fov: 85, vol: 0.7, music: 0.5, gfx: 'high', dynres: true, showFps: true, invertY: false, toggleAds: false, gore: 'extreme', crosshair: '#ffffff', rockMusic: true };
const isSafari = /Safari/.test(navigator.userAgent) && !/Chrome|Chromium|Edg|Firefox/.test(navigator.userAgent);
// Safari's WebGL is slower, so it starts on Medium unless the player picked something
if (isSafari) settings.gfx = 'medium';
const touchDevice = isTouchDevice();
if (touchDevice) { settings.gfx = 'low'; settings.sens = 1; }
try { Object.assign(settings, JSON.parse(localStorage.getItem('uo-settings') || '{}')); } catch { /* ignore */ }
const saveSettings = () => { try { localStorage.setItem('uo-settings', JSON.stringify(settings)); } catch { /* ignore */ } };
audio.setVolume(settings.vol);
audio.setMusicVolume(settings.music);

// ------------------------------------------------------------------ renderer
const quality = QUALITY[settings.gfx] || QUALITY.high;
const renderer = new THREE.WebGLRenderer({ antialias: !quality.post, powerPreference: 'high-performance' });
const maxPR = Math.min(window.devicePixelRatio, quality.pixelRatio);
const minPR = Math.min(maxPR, touchDevice ? 0.5 : 0.6);
let curPR = maxPR;
renderer.setPixelRatio(curPR);
renderer.shadowMap.enabled = quality.shadows;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.25;
const post = new PostFX(renderer, quality);
const envMap = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
$('game').appendChild(renderer.domElement);
const camera = new THREE.PerspectiveCamera(settings.fov, window.innerWidth / window.innerHeight, 0.05, 200);

const game = {
  renderer, camera, scene: null, world: null, fx: null, zombies: null, remotes: null, powerups: null, player: null, weapons: null,
  net: new Net(), hud: new HUD(),
  me: { id: 0, perks: [], grenades: 2, downed: false, dead: false, hp: 100, maxHp: 100, spawned: false, bleed: 0, selfRevive: false, reviveT: 0 },
  players: new Map(), hostId: 0, state: 'menu', round: 0, roomName: '',
  box: { state: 'idle', pid: 0, weapon: null }, papBusy: false, insta: 0, dbl: 0, lastThrow: 0,
  inputMode: 'kb',
};
window.__game = game;

// interactables of the current map
let INTER = [];
function buildInter() {
  INTER = [];
  for (const d of MAP.doors) {
    const x = d.cells.reduce((a, c) => a + c[0], 0) / d.cells.length + 0.5;
    const z = d.cells.reduce((a, c) => a + c[1], 0) / d.cells.length + 0.5;
    INTER.push({ kind: 'door', id: `door:${d.id}`, x, z, door: d, maxD: 2.3 });
  }
  for (const o of MAP.objects) INTER.push({ kind: o.type, id: o.id, x: o.x + 0.5, z: o.y + 0.5, o, maxD: o.type === 'pap' ? 2.3 : 1.8 });
  for (const w of MAP.windows) INTER.push({ kind: 'win', id: `win:${w.id}`, x: w.x + 0.5, z: w.y + 0.5, w, maxD: 2.0, hold: true });
}

// ------------------------------------------------------------------ screens
function showScreen(name) {
  for (const id of ['menu', 'lobby', 'clickToPlay', 'pauseMenu', 'gameOver', 'loading', 'createScreen', 'settingsScreen']) $(id).classList.toggle('hidden', id !== name);
}

function buildScene(ws) {
  if (game.weapons) game.weapons.clearNades();
  setMap(ws.map);
  game.mapId = MAP.id;
  audio.setRain(0);
  buildInter();
  const scene = new THREE.Scene();
  game.scene = scene;
  scene.environment = envMap;
  scene.environmentIntensity = 0.18;
  game.world = new World(scene, quality);
  game.fx = new FX(scene);
  game.fx.onCasingBounce = () => audio.casing();
  game.fx.onSplat = (p) => { if (game.gore !== 'off') game.fx.bloodSplat(p.clone().setY(0.02), new THREE.Vector3(0, 1, 0), 0.8); };
  game.zombies = new Zombies(scene, game.fx);
  game.remotes = new RemotePlayers(scene, game.fx);
  game.powerups = new Powerups(scene);
  game.player = new LocalPlayer(game.world);
  if (!game.weapons) {
    game.weapons = new Weapons(game);
    game.weapons.setAspect(window.innerWidth / window.innerHeight);
    game.weapons.viewScene.environment = envMap;
    game.weapons.viewScene.environmentIntensity = 0.55;
  }
  post.setup(scene, camera, game.weapons.viewScene, game.weapons.viewCam);
  const w = game.world;
  for (const id of ws.doors || []) w.setDoorOpen(id, false);
  (ws.boards || []).forEach((n, i) => w.setBoards(i, n, false));
  if (ws.power) { w.setPower(true, false); game.zombies.setPowered(true); }
  w.setBoxLoc(ws.box ? ws.box.loc : 0);
  if (ws.box && ws.box.state === 'away') w.boxGone();
  for (const u of ws.pus || []) game.powerups.add(u.id, u.kind, u.x, u.z);
  game.round = ws.round || 0;
  if (ws.roundState === 'active' && game.round > 0) audio.setMusicMode('combat', game.round); else audio.setMusicMode('calm');
  game.box = { state: 'idle', pid: 0, weapon: null };
  game.papBusy = false;
  game.hud.reset();
  game.hud.setRound(game.round);
  game.me.spawned = false;
  // overview camera until we spawn
  camera.position.set(MAP.w / 2, 20, MAP.h + 6);
  camera.lookAt(MAP.w / 2, 0, MAP.h / 2);
}

function renderMapPicker(el) {
  const host = game.hostId === game.me.id;
  el.innerHTML = MAP_LIST.map((m) => `<button class="map-card${m.id === game.mapId ? ' sel' : ''}" data-map="${m.id}" ${host ? '' : 'disabled'}>
    <b>${esc(m.name)}</b><span>${esc(m.desc)}</span><i>${esc(m.difficulty)}</i></button>`).join('');
}
for (const id of ['lobbyMaps', 'goMaps']) {
  $(id).addEventListener('click', (e) => {
    const b = e.target.closest('button[data-map]');
    if (b && game.hostId === game.me.id) game.net.send({ t: 'map', id: b.dataset.map });
  });
}

function renderLobby() {
  renderMapPicker($('lobbyMaps'));
  renderMapPicker($('goMaps'));
  $('lobbyRoom').textContent = game.roomName + (game.roomPrivate ? ' (private)' : '');
  $('lobbyTitle').textContent = game.roomTitle || game.roomName;
  $('lobbyPlayers').innerHTML = [...game.players.values()].map((p) =>
    `<li><span style="color:${esc(p.color)}">${esc(p.name)}${p.id === game.me.id ? ' (you)' : ''}</span>${p.id === game.hostId ? '<span class="host">HOST</span>' : ''}</li>`).join('');
  const host = game.hostId === game.me.id;
  $('startBtn').classList.toggle('hidden', !host);
  $('lobbyWait').classList.toggle('hidden', host);
  $('restartBtn').classList.toggle('hidden', !host);
  $('goWait').classList.toggle('hidden', host);
}

function inviteLink() {
  return `${location.origin}/?room=${encodeURIComponent(game.roomName)}`;
}

function copyInvite(btn) {
  const link = inviteLink();
  const done = () => { const t = btn.textContent; btn.textContent = 'Copied!'; setTimeout(() => { btn.textContent = t; }, 1200); };
  if (navigator.clipboard) navigator.clipboard.writeText(link).then(done, () => prompt('Invite link:', link));
  else prompt('Invite link:', link);
}

// ------------------------------------------------------------------ menu
const params = new URLSearchParams(location.search);
$('nameInput').value = localStorage.getItem('uo-name') || '';
if (params.get('room')) $('roomInput').value = params.get('room');

function playerName() {
  const name = $('nameInput').value.trim() || `Survivor${Math.floor(Math.random() * 900 + 100)}`;
  localStorage.setItem('uo-name', name);
  return name;
}

let serverCache = [];
async function refreshRooms() {
  try {
    serverCache = await (await fetch('/api/rooms', { cache: 'no-store' })).json();
  } catch { serverCache = []; }
  const status = (r) => r.state === 'playing' ? `Round ${r.round || 1}` : r.state === 'gameover' ? 'Game over' : 'In lobby';
  $('serverList').innerHTML = serverCache.map((r) => `<tr>
      <td><b>${esc(r.title)}</b><small>host: ${esc(r.host)}</small></td>
      <td>${esc(r.mapName)}</td>
      <td>${r.players} / ${r.max}</td>
      <td><span class="status-dot ${r.state}"></span>${status(r)}</td>
      <td><button class="btn" data-join="${esc(r.code)}" ${r.players >= r.max ? 'disabled' : ''}>${r.players >= r.max ? 'FULL' : 'JOIN'}</button></td>
    </tr>`).join('');
  $('serverEmpty').classList.toggle('hidden', serverCache.length > 0);
}
$('serverList').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-join]');
  if (b) join(b.dataset.join);
});
$('refreshBtn').addEventListener('click', refreshRooms);
refreshRooms();
setInterval(() => { if (!$('menu').classList.contains('hidden')) refreshRooms(); }, 4000);

$('playBtn').addEventListener('click', () => join($('roomInput').value.trim().toLowerCase()));
$('roomInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') join($('roomInput').value.trim().toLowerCase()); });

// Quick play: busiest open public server, otherwise start a new one
$('quickBtn').addEventListener('click', async () => {
  await refreshRooms();
  const open = serverCache.filter((r) => r.players < r.max && r.state !== 'gameover').sort((a, b) => b.players - a.players);
  if (open.length) join(open[0].code);
  else join('', { name: `${playerName()}'s server`, map: 'kino', max: 8, private: false });
});

// Create server screen
let createMap = 'kino';
function renderCreateMaps() {
  $('createMaps').innerHTML = MAP_LIST.map((m) => `<button class="map-card${m.id === createMap ? ' sel' : ''}" data-map="${m.id}"><b>${esc(m.name)}</b><span>${esc(m.desc)}</span><i>${esc(m.difficulty)}</i></button>`).join('');
}
$('createMaps').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-map]');
  if (b) { createMap = b.dataset.map; renderCreateMaps(); }
});
$('createBtn').addEventListener('click', () => {
  $('srvName').value = $('srvName').value || `${playerName()}'s server`;
  renderCreateMaps();
  showScreen('createScreen');
});
$('createBack').addEventListener('click', () => showScreen('menu'));
$('createGo').addEventListener('click', () => {
  join('', { name: $('srvName').value.trim() || `${playerName()}'s server`, map: createMap, max: +$('srvMax').value, private: $('srvPrivate').checked });
});

let assetsLoaded = false;
async function loadAssets() {
  if (assetsLoaded) return;
  const label = $('loading').querySelector('.ctp');
  let g = 0, a = 0, c = 0;
  const show = () => { label.textContent = `LOADING ${Math.round((g + a + c) * 33.3)}%`; };
  show();
  await Promise.all([
    loadGunModels((p) => { g = p; show(); }),
    audio.loadSamples((p) => { a = p; show(); }),
    loadArms().catch((e) => console.warn('arms failed', e)),
    loadRig().then(() => { c = 1; show(); }).catch((e) => console.warn('characters failed', e)),
  ]);
  label.textContent = 'CONNECTING…';
  assetsLoaded = true;
}

async function join(room = '', create = null) {
  audio.init();
  if (touchDevice) {
    // Android and iPad support fullscreen; iPhone Safari doesn't (play from the home-screen icon instead)
    const el = document.documentElement;
    const fs = el.requestFullscreen || el.webkitRequestFullscreen;
    try {
      if (fs && !(document.fullscreenElement || document.webkitFullscreenElement)) await fs.call(el, { navigationUI: 'hide' });
      if (screen.orientation && screen.orientation.lock) await screen.orientation.lock('landscape');
    } catch { /* not supported */ }
    keepAwake();
  }
  const name = playerName();
  if (!room && !create) room = 'public';
  $('menuError').textContent = '';
  showScreen('loading');
  try {
    await document.fonts.load('30px "Permanent Marker"');
    await document.fonts.load('30px "Black Ops One"');
  } catch { /* fonts optional */ }
  await loadAssets();
  try {
    await game.net.connect(name, room, create);
  } catch (e) {
    showScreen('menu');
    $('menuError').textContent = e.message;
  }
}

function leave(msg = '') {
  game.net.close();
  game.state = 'menu';
  game.me.spawned = false;
  game.players.clear();
  game.hud.show(false);
  audio.setMusicMode('calm');
  if (document.pointerLockElement) document.exitPointerLock();
  showScreen('menu');
  $('menuError').textContent = msg;
  history.replaceState(null, '', '/');
  refreshRooms();
}

$('startBtn').addEventListener('click', () => { audio.init(); game.net.send({ t: 'start' }); });
$('restartBtn').addEventListener('click', () => game.net.send({ t: 'restart' }));
$('leaveBtn').addEventListener('click', () => leave());
$('quitBtn').addEventListener('click', () => leave());
$('goMenuBtn').addEventListener('click', () => leave());
$('copyLinkBtn').addEventListener('click', (e) => copyInvite(e.target));
$('copyLinkBtn2').addEventListener('click', (e) => copyInvite(e.target));
$('resumeBtn').addEventListener('click', resumeGame);
$('clickToPlay').addEventListener('click', lockPointer);
function resumeGame() {
  if (game.inputMode === 'kb') lockPointer();
  else showScreen(null);
}

// ------------------------------------------------------------------ settings screen
let settingsReturn = 'menu';
function openSettings(from) {
  settingsReturn = from;
  showScreen('settingsScreen');
}
$('settingsBtn').addEventListener('click', () => openSettings('menu'));
$('pauseSettingsBtn').addEventListener('click', () => openSettings('pauseMenu'));
$('settingsBack').addEventListener('click', () => showScreen(settingsReturn));

const fmtSetting = { padSens: (v) => v.toFixed(2), touchSens: (v) => v.toFixed(2), sens: (v) => v.toFixed(2), adsSens: (v) => v.toFixed(2), fov: (v) => v, vol: (v) => Math.round(v * 100) + '%', music: (v) => Math.round(v * 100) + '%' };
function applySetting(key) {
  if (key === 'vol') audio.setVolume(settings.vol);
  if (key === 'music') audio.setMusicVolume(settings.music);
  if (key === 'crosshair') document.documentElement.style.setProperty('--crosshair', settings.crosshair);
  if (key === 'showFps') $('netInfo').style.display = settings.showFps ? '' : 'none';
  if (key === 'gore') { game.gore = settings.gore; goreCfg.level = settings.gore; }
  if (key === 'rockMusic') audio.rockEnabled = settings.rockMusic;
  if (key === 'toggleAds' && game.weapons) game.weapons.adsHeld = false;
}
for (const el of document.querySelectorAll('[data-key]')) {
  const key = el.dataset.key;
  const label = document.querySelector(`[data-val="${key}"]`);
  if (el.type === 'checkbox') el.checked = !!settings[key];
  else el.value = settings[key];
  if (label) label.textContent = fmtSetting[key] ? fmtSetting[key](settings[key]) : settings[key];
  applySetting(key);
  el.addEventListener(el.type === 'range' ? 'input' : 'change', () => {
    settings[key] = el.type === 'checkbox' ? el.checked : el.type === 'range' ? parseFloat(el.value) : el.value;
    if (label) label.textContent = fmtSetting[key] ? fmtSetting[key](settings[key]) : settings[key];
    saveSettings();
    applySetting(key);
    if (key === 'gfx') {
      if (game.state === 'menu') location.reload();
      else $('gfxNote').textContent = '(applies next time you open the game)';
    }
  });
}

// ------------------------------------------------------------------ pointer lock
function lockPointer() {
  audio.init();
  if (!renderer.domElement.requestPointerLock) return; // iPhone: no pointer lock, touch controls instead
  const p = renderer.domElement.requestPointerLock();
  if (p && p.catch) p.catch(() => showScreen('clickToPlay'));
}

const locked = () => document.pointerLockElement === renderer.domElement;
document.addEventListener('pointerlockchange', () => {
  if (locked()) {
    game.inputMode = 'kb';
    showScreen(null);
  } else if (game.state === 'playing' && !chatOpen && game.inputMode === 'kb') {
    showScreen('pauseMenu');
    input.reset();
  }
});
// clicking the game view grabs the mouse again
renderer.domElement.addEventListener('click', () => {
  if (game.state === 'playing' && !locked() && !anyScreen() && game.inputMode !== 'touch') lockPointer();
});
const anyScreen = () => ['menu', 'lobby', 'clickToPlay', 'pauseMenu', 'gameOver', 'loading', 'createScreen', 'settingsScreen'].some((id) => !$(id).classList.contains('hidden'));
// mouse/keyboard, controller or touch: whichever was used last drives the game
const controlsOn = () => !chatOpen && (locked() || (game.inputMode !== 'kb' && !anyScreen()));
document.addEventListener('pointerlockerror', () => { if (game.state === 'playing') showScreen('clickToPlay'); });

// ------------------------------------------------------------------ input
const input = {
  keys: new Set(),
  reset() { this.keys.clear(); if (game.weapons) { game.weapons.trigger = false; game.weapons.adsHeld = false; } releaseHold(); },
  get f() { return (this.keys.has('KeyW') || this.keys.has('ArrowUp') ? 1 : 0) - (this.keys.has('KeyS') || this.keys.has('ArrowDown') ? 1 : 0); },
  get r() { return (this.keys.has('KeyD') || this.keys.has('ArrowRight') ? 1 : 0) - (this.keys.has('KeyA') || this.keys.has('ArrowLeft') ? 1 : 0); },
};
let chatOpen = false;
let holdingId = null;
let currentInteract = null;
let scoreboardOpen = false;

function openChat() {
  chatOpen = true;
  $('chatInput').classList.remove('hidden');
  $('chatLog').classList.add('open');
  $('chatInput').value = '';
  setTimeout(() => $('chatInput').focus(), 0);
  input.reset();
}
function closeChat(send) {
  const text = $('chatInput').value.trim();
  if (send && text) game.net.send({ t: 'chat', msg: text });
  chatOpen = false;
  $('chatInput').blur();
  $('chatInput').classList.add('hidden');
  $('chatLog').classList.remove('open');
}
$('chatInput').addEventListener('keydown', (e) => {
  e.stopPropagation();
  if (e.key === 'Enter') { closeChat(true); if (!locked() && game.state === 'playing') lockPointer(); }
  if (e.key === 'Escape') closeChat(false);
});

function releaseHold() {
  if (holdingId) { game.net.send({ t: 'hold', id: null }); holdingId = null; }
}

window.addEventListener('keydown', (e) => {
  if (locked()) game.inputMode = 'kb';
  if (game.state !== 'playing' || chatOpen) return;
  if (e.code === 'Tab') { e.preventDefault(); scoreboardOpen = true; return; }
  if ((e.code === 'KeyT' || e.code === 'Enter') && game.me.spawned) { e.preventDefault(); openChat(); return; }
  if (!locked()) return;
  if (e.repeat) return;
  input.keys.add(e.code);
  const w = game.weapons;
  if (!game.me.spawned || game.me.dead) return;
  switch (e.code) {
    case 'KeyR': w.reload(); break;
    case 'KeyV': w.knife(); break;
    case 'KeyG': if (w.canAct() && !game.me.downed && game.me.grenades > 0) { game.lastThrow = performance.now(); w.throwNade(); } break;
    case 'Digit1': w.swap(0); break;
    case 'Digit2': w.swap(1); break;
    case 'KeyQ': w.swap(); break;
    case 'KeyF':
    case 'KeyE':
      if (currentInteract && !game.me.downed) {
        if (currentInteract.hold) { holdingId = currentInteract.id; game.net.send({ t: 'hold', id: holdingId }); }
        else game.net.send({ t: 'use', id: currentInteract.id });
      }
      break;
  }
});
window.addEventListener('keyup', (e) => {
  if (e.code === 'Tab') { scoreboardOpen = false; return; }
  input.keys.delete(e.code);
  if (e.code === 'KeyF' || e.code === 'KeyE') releaseHold();
});
window.addEventListener('blur', () => input.reset());

renderer.domElement.addEventListener('mousedown', (e) => {
  if (!locked() || !game.me.spawned || game.me.dead) return;
  if (e.button === 0) { game.weapons.trigger = true; game.weapons.triggerFresh = true; }
  if (e.button === 2) game.weapons.adsHeld = settings.toggleAds ? !game.weapons.adsHeld : true;
});
window.addEventListener('mouseup', (e) => {
  if (!game.weapons) return;
  if (e.button === 0) game.weapons.trigger = false;
  if (e.button === 2 && !settings.toggleAds) game.weapons.adsHeld = false;
});
window.addEventListener('contextmenu', (e) => e.preventDefault());
window.addEventListener('wheel', (e) => { if (locked() && game.weapons && game.me.spawned) game.weapons.swap(); }, { passive: true });
document.addEventListener('mousemove', (e) => {
  if (!locked() || !game.player || game.me.dead) return;
  const ads = game.weapons.adsEase();
  const s = settings.sens * game.weapons.fovMult() * (1 - ads + ads * settings.adsSens);
  game.player.look(e.movementX, settings.invertY ? -e.movementY : e.movementY, s);
  game.weapons.lookDX += e.movementX;
  game.weapons.lookDY += e.movementY;
});

window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  post.setSize(window.innerWidth, window.innerHeight, curPR);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  if (game.weapons) game.weapons.setAspect(camera.aspect);
});

// ------------------------------------------------------------------ network handlers
const net = game.net;
const hud = game.hud;
const me = game.me;

function playerInfo(id) { return game.players.get(id); }
function nameOf(id) { return playerInfo(id)?.name || 'Someone'; }

net.on('welcome', (m) => {
  me.id = m.id;
  game.hostId = m.host;
  game.roomName = m.room;
  game.roomTitle = m.title;
  game.roomPrivate = m.isPrivate;
  game.state = m.state === 'playing' ? 'playing' : 'lobby';
  history.replaceState(null, '', `/?room=${encodeURIComponent(m.room)}`);
  buildScene(m);
  if (m.state === 'playing') { showScreen('loading'); }
  else { showScreen('lobby'); renderLobby(); }
});

net.on('full', () => leave('That room is full (8 players max).'));
net.on('close', () => { if (game.state !== 'menu') leave('Disconnected from the server.'); });

net.on('ps', (m) => {
  game.hostId = m.host;
  const ids = new Set();
  for (const p of m.p) {
    ids.add(p.id);
    const prev = game.players.get(p.id) || {};
    game.players.set(p.id, { ...prev, ...p });
    if (game.remotes) game.remotes.setInfo(p.id, p);
    if (p.id === me.id) {
      me.perks = p.perks;
      if (performance.now() - game.lastThrow > 1500) me.grenades = p.grenades;
    }
  }
  for (const id of [...game.players.keys()]) if (!ids.has(id)) game.players.delete(id);
  if (game.state === 'lobby' || game.state === 'gameover') renderLobby();
  hud.setPerks(me.perks);
  hud.setScores(game.players, me.id);
});

net.on('host', (m) => { game.hostId = m.id; renderLobby(); });
net.on('leave', (m) => { game.players.delete(m.id); if (game.remotes) game.remotes.remove(m.id); hud.setScores(game.players, me.id); });
net.on('join', () => {});

net.on('start', () => {
  game.state = 'playing';
  hud.reset();
  showScreen('loading');
});

net.on('reset', (m) => {
  buildScene(m);
  renderLobby();
});

net.on('spawn', (m) => {
  game.state = 'playing';
  me.spawned = true;
  me.dead = false;
  me.downed = false;
  me.hp = m.hp;
  me.maxHp = m.maxHp;
  me.grenades = m.grenades;
  me.perks = [];
  game.player.spawn(m.x, m.z, m.yaw);
  game.player.downed = false;
  game.weapons.setInventory(m.weapons, m.cur);
  hud.dead(false);
  hud.downed(false);
  hud.setPerks([]);
  hud.show(true);
  if (game.inputMode === 'kb' && !locked()) showScreen('clickToPlay');
  else if (game.inputMode !== 'kb') showScreen(null);
});

net.on('s', (m) => {
  if (!game.scene) return;
  game.round = m.r;
  if (m.r > 0) hud.setRound(m.r);
  game.insta = m.ins;
  game.dbl = m.dbl;
  hud.setActivePowerups(m.ins, m.dbl);
  game.remotes.onSnapshot(m.ts, m.P, me.id, game.players);
  game.zombies.onSnapshot(m.ts, m.Z);
  for (const row of m.P) {
    const info = game.players.get(row[0]);
    if (info) info.downed = !!(row[6] & 1);
    if (row[0] === me.id) {
      me.hp = row[9];
      me.bleed = row[10];
      me.reviveT = row[11];
      me.selfRevive = !!(row[6] & 128);
    }
  }
});

net.on('pts', (m) => {
  const p = game.players.get(m.id);
  if (p) p.points = m.total;
  hud.setScores(game.players, me.id);
  hud.floatPoints(m.id, m.n);
  if (m.id === me.id && m.n < 0) audio.buy();
});

net.on('deny', (m) => {
  audio.deny();
  hud.subnotice(m.reason === 'power' ? 'You must turn on the power first!' : 'Not enough points!', 1600);
});

net.on('door', (m) => {
  game.world.setDoorOpen(m.id);
  const it = INTER.find((i) => i.id === `door:${m.id}`);
  if (it) {
    audio.door(it.x, it.z);
    game.fx.burst(new THREE.Vector3(it.x, 1.5, it.z), 30, { speed: 3, colors: ['#5a4a3a', '#7a6a58', '#3a3028'], size: 0.15, life: 1.5, gravity: 3, spread: 2 });
  }
  if (m.by !== me.id) hud.subnotice(`${nameOf(m.by)} opened a door`, 1500);
});

net.on('board', (m) => {
  game.world.setBoards(m.w, m.n);
  const w = MAP.windows[m.w];
  if (m.add) audio.boardAdd(w.x + 0.5, w.y + 0.5);
  else {
    audio.boardTear(w.x + 0.5, w.y + 0.5);
    game.fx.burst(new THREE.Vector3(w.x + 0.5, 1.5, w.y + 0.5), 6, { speed: 2, colors: ['#7a5532', '#5a3d22'], size: 0.06, life: 0.8 });
  }
});

net.on('boards', (m) => { m.b.forEach((n, i) => game.world.setBoards(i, n)); });

net.on('power', (m) => {
  game.world.setPower(true);
  game.zombies.setPowered(true);
  audio.power();
  hud.notice('POWER ON', `${nameOf(m.by)} turned on the power`, 3000);
});

net.on('give', (m) => {
  if (m.pid === me.id) {
    game.weapons.give(m.slot, m.id, m.pap);
    hud.subnotice(weaponStats(m.id, m.pap).name, 1500);
  }
});

net.on('ammo', (m) => { if (m.pid === me.id) game.weapons.refill(m.id); });
net.on('maxammo', () => { game.weapons.refillAll(); me.grenades = 4; });

net.on('perk', (m) => {
  if (m.pid === me.id) {
    if (!me.perks.includes(m.perk)) me.perks.push(m.perk);
    hud.setPerks(me.perks);
    game.weapons.drink(m.perk);
    hud.subnotice(PERKS[m.perk].desc, 2500);
  }
});

net.on('pap', (m) => {
  const it = INTER.find((i) => i.kind === 'pap');
  if (m.s === 'start') {
    game.papBusy = true;
    if (it) audio.papWhirr(it.x, it.z);
    if (m.pid === me.id) game.weapons.removeSlot(m.slot);
  } else {
    game.papBusy = false;
  }
});

net.on('box', (m) => {
  const w = game.world;
  const bp = w.boxWorldPos();
  switch (m.s) {
    case 'spin':
      game.box = { state: 'spin', pid: m.pid, weapon: m.w };
      w.boxSpin(m.w, m.teddy);
      audio.musicBox(bp.x, bp.z);
      break;
    case 'offer':
      game.box = { state: 'offer', pid: m.pid, weapon: m.w };
      w.boxOffer();
      break;
    case 'take':
    case 'close':
      game.box = { state: 'idle', pid: 0, weapon: null };
      w.boxClose();
      break;
    case 'teddy':
      game.box = { state: 'leaving', pid: 0, weapon: null };
      w.boxTeddy();
      audio.teddyLaugh(bp.x, bp.z);
      hud.subnotice('Bye bye! The Mystery Box is moving…', 3000);
      break;
    case 'gone':
      game.box.state = 'away';
      w.boxGone();
      break;
    case 'move':
      game.box = { state: 'idle', pid: 0, weapon: null };
      w.boxMove(m.loc);
      break;
  }
});

net.on('pu', (m) => game.powerups.add(m.id, m.kind, m.x, m.z));
net.on('pug', (m) => {
  const u = game.powerups.remove(m.id);
  if (!m.by) return;
  audio.powerupGrab();
  audio.say(POWERUP_NAMES[m.kind]);
  hud.notice(POWERUP_NAMES[m.kind], m.by === me.id ? '' : `picked up by ${nameOf(m.by)}`, 2200);
  if (m.kind === 'nuke') { hud.nukeFlash(); audio.explosion(game.player.pos.x, game.player.pos.z, 1.5); }
  if (u && m.kind === 'nuke') game.fx.explosion(u.sp.position.clone().setY(0.5), '#ffffff', 2);
});

net.on('round', (m) => {
  hud.setRound(m.n, true);
  audio.roundStart(m.dog);
  setTimeout(() => audio.setMusicMode('combat', m.n, m.dog), 2200);
  if (m.dog) {
    hud.notice('HELLHOUNDS!', 'Fetch me their souls!', 3500);
    setTimeout(() => audio.say('Fetch me their souls!', 0.1), 800);
  } else if (m.n === 1) hud.subnotice('Survive. Earn points. Buy your way out.', 4000);
});
net.on('roundEnd', () => { audio.roundEnd(); audio.setMusicMode('calm'); });

net.on('zdie', (m) => {
  const pos = game.zombies.kill(m.id, m.k, m.f, m.p, m.o, m.d);
  if (m.by === me.id && pos) {
    hud.hitmarker(true);
    audio.hit(m.k === 'head', true);
  }
});

net.on('zlimb', (m) => game.zombies.limb(m.id, m.l, m.d));

net.on('hurt', (m) => {
  me.hp = m.hp;
  hurtFx = 1;
  rumble(0.9, 0.5, 220);
  audio.hurt();
  game.player.shake = Math.max(game.player.shake, 0.025);
  const p = game.player;
  const dx = m.from[0] - p.pos.x, dz = m.from[1] - p.pos.z;
  const ang = Math.atan2(-Math.sin(p.yaw), -Math.cos(p.yaw)) - Math.atan2(dx, dz);
  hud.hurt(ang);
});

net.on('down', (m) => {
  const info = game.players.get(m.id);
  if (info) info.downed = true;
  if (m.id === me.id) {
    me.downed = true;
    me.perks = [];
    hud.setPerks([]);
    game.player.downed = true;
    game.weapons.setDowned(true);
    releaseHold();
    audio.downed();
  } else {
    hud.subnotice(`${nameOf(m.id)} is down! Revive them!`, 2500);
  }
  hud.setScores(game.players, me.id);
});

net.on('revived', (m) => {
  const info = game.players.get(m.id);
  if (info) info.downed = false;
  if (m.id === me.id) {
    me.downed = false;
    game.player.downed = false;
    game.weapons.setDowned(false);
    audio.revived();
    hud.subnotice(m.by ? `${nameOf(m.by)} revived you!` : 'You picked yourself up!', 2000);
  } else if (m.by === me.id) hud.subnotice(`You revived ${nameOf(m.id)}`, 1500);
  hud.setScores(game.players, me.id);
});

net.on('dead', (m) => {
  if (m.id === me.id) {
    me.dead = true;
    me.downed = false;
    game.player.downed = false;
    hud.downed(false);
    hud.dead(true);
  }
});

net.on('respawn', () => {});

net.on('gameover', (m) => {
  game.state = 'gameover';
  hud.gameOver(m.round, m.stats);
  renderLobby();
  input.reset();
  if (document.pointerLockElement) document.exitPointerLock();
  showScreen('gameOver');
  audio.roundEnd();
  audio.setMusicMode('calm');
});

net.on('chat', (m) => hud.chat(m.name, m.color, m.msg, m.id === 0));

net.on('nade', (m) => game.weapons.spawnNade(new THREE.Vector3(...m.o), new THREE.Vector3(...m.v), false));
net.on('fx', (m) => game.weapons.remoteFire(m, game.remotes.muzzlePos(m.pid)));

// ------------------------------------------------------------------ interactions
function computeInteract() {
  if (!me.spawned || me.dead || me.downed) return null;
  const p = game.player;
  const px = p.pos.x, pz = p.pos.z;
  const fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw);
  const world = game.world;
  let best = null, bestScore = Infinity;
  const consider = (item, x, z, maxD) => {
    const dx = x - px, dz = z - pz;
    const d = Math.hypot(dx, dz);
    if (d > maxD) return;
    const facing = d > 0.01 ? (dx * fx + dz * fz) / d : 1;
    const score = d - facing * 0.8;
    if (score < bestScore) { bestScore = score; best = item; }
  };
  for (const it of INTER) {
    if (it.kind === 'door' && world.openDoors.has(it.door.id)) continue;
    if (it.kind === 'power' && world.power) continue;
    if (it.kind === 'perk' && me.perks.includes(it.o.perk)) continue;
    if (it.kind === 'win' && world.boards[it.w.id] >= BOARDS_PER_WINDOW) continue;
    consider(it, it.x, it.z, it.maxD);
  }
  if (world.box.visible && (game.box.state === 'idle' || (game.box.state === 'offer' && game.box.pid === me.id))) {
    const bp = world.boxWorldPos();
    consider({ kind: 'box', id: 'box' }, bp.x, bp.z, 2.3);
  }
  for (const r of game.remotes.map.values()) {
    if ((r.flags & 1) && !(r.flags & 2)) consider({ kind: 'revive', id: `rev:${r.id}`, hold: true, target: r }, r.root.position.x, r.root.position.z, 2.2);
  }
  return best;
}

function useLabel() {
  if (game.inputMode === 'pad') return gamepad.labels.use;
  if (game.inputMode === 'touch') return 'USE';
  return 'F';
}

function interactText(it) {
  if (!it) return '';
  const F = `<b>${useLabel()}</b>`;
  const cost = (c) => ` [Cost: <b>${c}</b>]`;
  const power = game.world.power;
  const solo = [...game.players.values()].filter((p) => p.spawned).length <= 1;
  switch (it.kind) {
    case 'door': return `Press ${F} to open door${cost(it.door.cost)}`;
    case 'wall': {
      const wd = WEAPONS[it.o.weapon];
      const owned = game.weapons.slots.find((s) => s && s.id === it.o.weapon);
      if (owned) return `Press ${F} to buy ammo for ${esc(owned.stats.name)}${cost(owned.pap ? PAP_AMMO_COST : Math.floor(wd.cost / 2))}`;
      return `Press ${F} to buy ${esc(wd.name)}${cost(wd.cost)}`;
    }
    case 'perk': {
      const pk = PERKS[it.o.perk];
      if (pk.power && !power) return 'You must turn on the power first!';
      return `Press ${F} to buy ${esc(pk.name)}${cost(solo && pk.soloCost ? pk.soloCost : pk.cost)}`;
    }
    case 'power': return `Press ${F} to turn on the <b>Power</b>`;
    case 'pap': {
      if (!power) return 'You must turn on the power first!';
      if (game.papBusy) return 'Pack-a-Punch is in use…';
      const s = game.weapons.active();
      if (!s) return '';
      if (s.pap) return 'This weapon is already upgraded';
      return `Press ${F} to Pack-a-Punch${cost(PAP_COST)}`;
    }
    case 'box':
      if (game.box.state === 'offer') return `Press ${F} to take <b>${esc(WEAPONS[game.box.weapon].name)}</b>`;
      return `Press ${F} for a Random Weapon${cost(BOX_COST)}`;
    case 'win': return `Hold ${F} to Rebuild Barrier`;
    case 'revive': return `Hold ${F} to revive <b>${esc(nameOf(it.target.id))}</b>`;
  }
  return '';
}

// ------------------------------------------------------------------ main loop
const clock = new THREE.Clock();
let sendAcc = 0;
let fpsAcc = 0, fpsFrames = 0, fps = 0;
let heartT = 0;
let hurtFx = 0;
let wasPapBusy = false;

// Dynamic resolution: trade sharpness for a steady frame rate.
let lowStreak = 0, highStreak = 0;
function adaptResolution(f) {
  if (game.state !== 'playing' || document.hidden || !settings.dynres) return;
  if (f < 50) { lowStreak++; highStreak = 0; } else if (f >= 58) { highStreak++; lowStreak = 0; } else { lowStreak = 0; highStreak = 0; }
  let next = curPR;
  if (lowStreak >= 2 && curPR > minPR) { next = Math.max(minPR, curPR - 0.15); lowStreak = 0; }
  else if (highStreak >= 8 && curPR < maxPR) { next = Math.min(maxPR, curPR + 0.1); highStreak = 0; }
  if (next !== curPR) {
    curPR = next;
    renderer.setPixelRatio(curPR);
    renderer.setSize(window.innerWidth, window.innerHeight);
    post.setSize(window.innerWidth, window.innerHeight, curPR);
  }
}

function spectateCamera() {
  let target = null;
  for (const r of game.remotes.map.values()) if (!(r.flags & 3)) { target = r; break; }
  if (!target) for (const r of game.remotes.map.values()) { target = r; break; }
  if (!target) return;
  const p = target.root.position;
  const y = target.root.rotation.y;
  camera.position.lerp(new THREE.Vector3(p.x - Math.sin(y) * 3.5, p.y + 2.6, p.z - Math.cos(y) * 3.5), 0.15);
  camera.lookAt(p.x, p.y + 1.4, p.z);
}

function frame() {
  requestAnimationFrame(frame);
  step(Math.min(0.05, clock.getDelta()));
}

function step(dt) {
  fpsAcc += dt; fpsFrames++;
  if (fpsAcc > 0.5) { fps = Math.round(fpsFrames / fpsAcc); fpsAcc = 0; fpsFrames = 0; adaptResolution(fps); }

  if (!game.scene) { renderer.clear(); return; }
  const renderTs = net.serverNow() - 110;
  const w = game.weapons;
  const p = game.player;
  const active = game.state === 'playing' && me.spawned;

  const pad = gamepad.poll(dt);
  const touchState = touch.poll();
  touch.show(game.state === 'playing' && me.spawned && !me.dead && game.inputMode === 'touch' && !anyScreen());
  if (active && !me.dead) {
    const inputOn = controlsOn();
    const slot = w.active();
    const kbOn = inputOn && locked();
    const clamp1 = (v) => Math.max(-1, Math.min(1, v));
    let f = kbOn ? input.f : 0, r = kbOn ? input.r : 0;
    let jump = kbOn && input.keys.has('Space');
    let sprint = kbOn && (input.keys.has('ShiftLeft') || input.keys.has('ShiftRight'));
    let crouch = kbOn && (input.keys.has('KeyC') || input.keys.has('ControlLeft'));
    if (inputOn && pad) {
      f = clamp1(f + pad.move[1]); r = clamp1(r + pad.move[0]);
      jump = jump || pad.jump; sprint = sprint || pad.sprint; crouch = crouch || pad.crouch;
      // right stick: expo curve, slower while aiming, aim assist slows the turn over a zombie
      const curve = (v) => Math.sign(v) * Math.pow(Math.abs(v), 1.8);
      const ads = w.adsEase();
      let rate = 2.9 * settings.padSens * w.fovMult() * (1 - ads + ads * settings.adsSens);
      if (settings.aimAssist && aimOnTarget()) rate *= 0.42;
      const dx = curve(pad.look[0]) * rate * dt, dy = curve(pad.look[1]) * rate * dt;
      p.look(dx / 0.0022, (settings.invertY ? -dy : dy) / 0.0022, 1);
      w.lookDX += dx * 300; w.lookDY += dy * 300;
    }
    if (inputOn && game.inputMode === 'touch') {
      f = clamp1(f + touchState.move[1]); r = clamp1(r + touchState.move[0]);
      jump = jump || touchState.jump; sprint = sprint || touchState.sprint; crouch = crouch || touchState.crouch;
      const ads = w.adsEase();
      const k = 0.0042 * settings.touchSens * w.fovMult() * (1 - ads + ads * settings.adsSens) * (settings.aimAssist && aimOnTarget() ? 0.6 : 1);
      p.look(touchState.lookPx[0] * k / 0.0022, (settings.invertY ? -touchState.lookPx[1] : touchState.lookPx[1]) * k / 0.0022, 1);
      w.lookDX += touchState.lookPx[0]; w.lookDY += touchState.lookPx[1];
    }
    p.update(dt, { f, r, jump, sprint: sprint && !w.trigger, crouch }, w.adsT, slot ? slot.stats.move : 1);
    p.applyCamera(camera);
    w.update(dt);
    audio.setListener(p.pos.x, p.pos.z, p.yaw);
    if (MAP.theme.rain) audio.setRain(MAP.outdoorAt(Math.floor(p.pos.x), Math.floor(p.pos.z)) ? 1 : 0.35);

    sendAcc += dt;
    if (sendAcc >= 0.05) {
      sendAcc = 0;
      const flags = (p.crouch ? 4 : 0) | (p.sprinting ? 8 : 0) | (w.adsT > 0.5 ? 16 : 0);
      net.send({ t: 'st', p: [+p.pos.x.toFixed(2), +p.pos.y.toFixed(2), +p.pos.z.toFixed(2)], yaw: +p.yaw.toFixed(3), pitch: +p.pitch.toFixed(3), f: flags, w: w.cur });
    }

    // interaction prompt
    currentInteract = computeInteract();
    hud.prompt(interactText(currentInteract));
    touch.setUse(currentInteract ? 1 : 0);
    if (holdingId && holdingId.startsWith('rev:')) {
      const r = game.remotes.get(+holdingId.slice(4));
      const need = me.perks.includes('revive') ? REVIVE_TIME_QR : REVIVE_TIME;
      if (r && (r.flags & 1)) hud.progress(`Reviving ${nameOf(r.id)}…`, r.reviveT / need);
      else { hud.progress(null); releaseHold(); }
    } else if (me.downed && me.reviveT > 0) {
      hud.progress('Being revived…', me.reviveT / REVIVE_TIME);
    } else hud.progress(null);

    // HUD
    hud.setAmmo(w.active(), me.grenades);
    const s = w.active();
    if (s && s.mag === 0 && s.reserve > 0 && w.state !== 'reload') hud.reloadHint('Press R to reload');
    else if (s && s.mag === 0 && s.reserve === 0) hud.reloadHint('NO AMMO');
    else if (w.state === 'reload') hud.reloadHint('');
    else hud.reloadHint('');
    const fovNow = settings.fov * w.fovMult();
    if (Math.abs(camera.fov - fovNow) > 0.01) { camera.fov = fovNow; camera.updateProjectionMatrix(); }
    const gap = Math.tan(w.spreadDeg() * Math.PI / 180) / Math.tan(camera.fov * Math.PI / 360) * (window.innerHeight / 2) + 6;
    hud.crosshair(gap, w.adsT < 0.4 && !p.sprinting && !!s && w.state !== 'reload');
    hud.health(me.downed ? 0.15 : me.hp / Math.max(1, me.perks.includes('jugg') ? 250 : 100));
    hud.downed(me.downed, me.selfRevive ? me.bleed / SOLO_QR_TIME : me.bleed / BLEEDOUT_TIME, me.selfRevive);
    heartT -= dt;
    if ((me.downed || me.hp < 45) && heartT <= 0) { heartT = me.downed ? 1.2 : 0.85; audio.heartbeat(); }
  } else if (active && me.dead) {
    spectateCamera();
    hud.prompt('');
    hud.crosshair(0, false);
  }

  game.world.update(dt, game.papBusy, camera.position);
  game.zombies.update(dt, renderTs, game.player.pos);
  game.remotes.update(dt, renderTs);
  game.powerups.update(dt);
  game.fx.update(dt);
  if (scoreboardOpen && game.state === 'playing') hud.scoreboard(true, game.players, game.round);
  else hud.scoreboard(false);
  hud.netInfo(`${fps} FPS · ${Math.round(net.rtt)} ms · ${Math.round(curPR * 100)}% res`);

  hurtFx = Math.max(0, hurtFx - dt * 2.5);
  const lowHp = active && !me.dead && !me.downed ? Math.max(0, 1 - me.hp / Math.max(1, me.maxHp)) : 0;
  post.render(dt, active && !me.dead, { desat: me.downed ? 0.85 : me.dead ? 0.6 : lowHp * 0.5, hurt: Math.max(hurtFx, me.downed ? 0.5 : 0) });
}
window.__step = step;

// keep phones from dimming the screen mid-round (re-requested when the app comes back)
let wakeLock = null;
async function keepAwake() {
  try { if (navigator.wakeLock && !wakeLock) { wakeLock = await navigator.wakeLock.request('screen'); wakeLock.addEventListener('release', () => { wakeLock = null; }); } } catch { /* not allowed */ }
}
document.addEventListener('visibilitychange', () => { if (!document.hidden && touchDevice && game.state === 'playing') keepAwake(); });

// iOS ignores user-scalable=no, so block pinch-zoom gestures directly
for (const ev of ['gesturestart', 'gesturechange']) document.addEventListener(ev, (e) => e.preventDefault(), { passive: false });

// iPhone Safari can't go fullscreen from a web page; suggest the home-screen install once
const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const standalone = navigator.standalone === true || matchMedia('(display-mode: standalone), (display-mode: fullscreen)').matches;
if (isIOS && !standalone && !localStorage.getItem('uo-ios-hint')) {
  $('iosHint').classList.remove('hidden');
  $('iosHintClose').addEventListener('click', () => { $('iosHint').classList.add('hidden'); try { localStorage.setItem('uo-ios-hint', '1'); } catch { /* ignore */ } });
}
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('/sw.js').catch(() => {});

// ------------------------------------------------------------------ controller & touch actions
function rumble(strong, weak, ms) {
  if (settings.vibration && game.inputMode === 'pad') gamepad.vibrate(strong, weak, ms);
}
game.rumble = rumble;
let aimCheckT = 0, aimHit = false;
function aimOnTarget() {
  const now = performance.now();
  if (now - aimCheckT < 50) return aimHit;
  aimCheckT = now;
  const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
  const hits = game.zombies ? game.zombies.raycast(camera.position, dir, 40) : [];
  aimHit = hits.length > 0;
  return aimHit;
}
let toastTimer = null;
function focusables() {
  const screen = ['settingsScreen', 'createScreen', 'pauseMenu', 'gameOver', 'lobby', 'clickToPlay', 'menu'].map((id) => $(id)).find((el) => !el.classList.contains('hidden'));
  if (!screen) return [];
  return [...screen.querySelectorAll('button:not([disabled]), input, select, summary')].filter((el) => el.offsetParent !== null);
}
const actions = {
  setMode(mode) {
    if (game.inputMode === mode) return;
    game.inputMode = mode;
    document.body.classList.toggle('touch', mode === 'touch');
    if (mode !== 'kb' && document.pointerLockElement) document.exitPointerLock();
    if (mode !== 'kb' && game.state === 'playing' && !$('clickToPlay').classList.contains('hidden')) showScreen(null);
  },
  inGame: () => game.state === 'playing' && me.spawned,
  paused: () => !$('pauseMenu').classList.contains('hidden') || !$('settingsScreen').classList.contains('hidden'),
  pause() {
    if (actions.paused()) return resumeGame();
    input.reset();
    showScreen('pauseMenu');
    const f = focusables(); if (f[0]) f[0].focus();
  },
  resume: () => resumeGame(),
  useOrReload(down, onlyUse = false) {
    const w = game.weapons;
    if (!w || me.dead) return;
    if (down) {
      if (currentInteract && !me.downed) {
        if (currentInteract.hold) { holdingId = currentInteract.id; net.send({ t: 'hold', id: holdingId }); }
        else net.send({ t: 'use', id: currentInteract.id });
      } else if (!onlyUse) w.reload();
    } else releaseHold();
  },
  reload: () => game.weapons && game.weapons.reload(),
  swap: (slot) => game.weapons && game.weapons.swap(slot),
  grenade() {
    const w = game.weapons;
    if (w && w.canAct() && !me.downed && me.grenades > 0) { game.lastThrow = performance.now(); w.throwNade(); }
  },
  knife: () => game.weapons && game.weapons.knife(),
  trigger(on) {
    const w = game.weapons;
    if (!w || me.dead) return;
    if (on && !w.trigger) w.triggerFresh = true;
    w.trigger = on;
  },
  ads(on) { if (game.weapons) game.weapons.adsHeld = on; },
  adsToggle() { if (game.weapons) game.weapons.adsHeld = !game.weapons.adsHeld; },
  scoreboard(on) { scoreboardOpen = on; },
  menuMove(dir, horizontal = false) {
    const el = document.activeElement;
    if (horizontal && el && el.tagName === 'SELECT') {
      el.selectedIndex = Math.max(0, Math.min(el.options.length - 1, el.selectedIndex + dir));
      el.dispatchEvent(new Event('change'));
      return;
    }
    if (horizontal && el && el.type === 'range') {
      el.value = +el.value + dir * (+el.step || 0.1) * 2;
      el.dispatchEvent(new Event('input'));
      return;
    }
    const list = focusables();
    if (!list.length) return;
    const i = list.indexOf(el);
    const next = list[(i + (horizontal ? dir : dir) + list.length) % list.length] || list[0];
    next.focus();
    next.scrollIntoView({ block: 'nearest' });
  },
  menuClick() {
    const el = document.activeElement;
    if (!$('clickToPlay').classList.contains('hidden')) { showScreen(null); return; }
    if (el && el !== document.body && focusables().includes(el)) el.click();
    else { const f = focusables(); if (f[0]) f[0].focus(); }
  },
  menuBack() {
    if (!$('settingsScreen').classList.contains('hidden')) $('settingsBack').click();
    else if (!$('createScreen').classList.contains('hidden')) $('createBack').click();
    else if (!$('pauseMenu').classList.contains('hidden')) resumeGame();
  },
  toast(text) {
    if (game.state === 'playing') hud.subnotice(text, 2500);
    else { $('menuError').textContent = text; clearTimeout(toastTimer); toastTimer = setTimeout(() => { $('menuError').textContent = ''; }, 3000); }
  },
};
const gamepad = new GamepadControls(actions);
const touch = new TouchControls(actions);
if (touchDevice) actions.setMode('touch');
window.__buildScene = buildScene;
frame();

showScreen('menu');
