import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { Room } from './room.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT) || 3000;

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.obj': 'text/plain; charset=utf-8', '.m4a': 'audio/mp4', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.glb': 'model/gltf-binary', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
};

// URL prefix -> directory on disk
const MOUNTS = [
  ['/shared/', path.join(ROOT, 'shared')],
  ['/lib/', path.join(ROOT, 'node_modules', 'three', 'build')],
  ['/jsm/', path.join(ROOT, 'node_modules', 'three', 'examples', 'jsm')],
  ['/', path.join(ROOT, 'public')],
];

function serveStatic(req, res) {
  let urlPath;
  try { urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch { res.writeHead(400).end(); return; }
  if (urlPath === '/') urlPath = '/index.html';
  for (const [prefix, dir] of MOUNTS) {
    if (!urlPath.startsWith(prefix)) continue;
    const file = path.resolve(dir, '.' + urlPath.slice(prefix.length - 1));
    if (!file.startsWith(dir + path.sep)) break;
    fs.stat(file, (err, st) => {
      if (err || !st.isFile()) { res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found'); return; }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': urlPath.startsWith('/assets/') || urlPath.startsWith('/lib/') ? 'public, max-age=3600' : 'no-cache' });
      fs.createReadStream(file).pipe(res);
    });
    return;
  }
  res.writeHead(404).end('Not found');
}

const rooms = new Map();

const server = http.createServer((req, res) => {
  // test-mode only: the page can upload a rendered frame for inspection
  if (process.env.DEV_POINTS && req.method === 'POST' && req.url.startsWith('/dev/shot')) {
    const shotName = (new URL(req.url, 'http://x').searchParams.get('name') || 'devshot').replace(/[^\w-]/g, '');
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const data = Buffer.concat(chunks).toString().replace(/^data:image\/\w+;base64,/, '');
      fs.writeFileSync(path.join(process.env.DEV_SHOT_DIR || ROOT, `${shotName}.jpg`), Buffer.from(data, 'base64'));
      res.writeHead(200).end('ok');
    });
    return;
  }
  if (req.url === '/healthz') { res.writeHead(200, { 'Content-Type': 'text/plain' }).end('ok'); return; }
  if (req.url === '/api/rooms') {
    const list = [...rooms.values()].filter((r) => !r.isPrivate && r.players.size > 0).map((r) => r.info());
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }).end(JSON.stringify(list));
    return;
  }
  serveStatic(req, res);
});

const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 64 * 1024 });

wss.on('connection', (ws) => {
  let room = null;
  let player = null;
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });

  ws.on('message', (data) => {
    let msg;
    try { msg = JSON.parse(data); } catch { return; }
    if (!msg || typeof msg.t !== 'string') return;
    if (!player) {
      if (msg.t !== 'join') return;
      const name = String(msg.name || 'Survivor').replace(/[<>]/g, '').trim().slice(0, 16) || 'Survivor';
      let roomName = String(msg.room || '').toLowerCase().replace(/[^a-z0-9-_]/g, '').slice(0, 24);
      const create = msg.create && typeof msg.create === 'object' ? msg.create : null;
      if (create) {
        // a new server from the "Create server" screen gets a fresh unique code
        const base = String(create.name || 'zombies').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 14) || 'server';
        do roomName = `${base}-${Math.random().toString(36).slice(2, 6)}`; while (rooms.has(roomName));
      }
      if (!roomName) roomName = 'public';
      room = rooms.get(roomName);
      if (!room) {
        room = new Room(roomName, (r) => { r.destroy(); rooms.delete(r.name); });
        if (create) room.configure(create);
        rooms.set(roomName, room);
      }
      player = room.addPlayer(ws, name);
      if (!player) { ws.send(JSON.stringify({ t: 'full' })); ws.close(); }
      return;
    }
    room.onMessage(player, msg);
  });

  ws.on('close', () => {
    if (room && player) room.removePlayer(player);
  });
});

setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) { ws.terminate(); continue; }
    ws.isAlive = false;
    ws.ping();
  }
}, 15000);

server.listen(PORT, () => {
  console.log(`\n  UNDEAD OPS server running:  http://localhost:${PORT}\n`);
});
