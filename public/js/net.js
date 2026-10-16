// WebSocket connection + server clock estimation.

export class Net {
  constructor() {
    this.ws = null;
    this.handlers = new Map();
    this.offset = 0;      // serverTime - Date.now()
    this.rtt = 0;
    this.haveOffset = false;
    this.pingTimer = null;
  }

  on(type, fn) { this.handlers.set(type, fn); }

  connect(name, room, create = null) {
    return new Promise((resolve, reject) => {
      const proto = location.protocol === 'https:' ? 'wss' : 'ws';
      const ws = new WebSocket(`${proto}://${location.host}/ws`);
      this.ws = ws;
      let opened = false;
      ws.onopen = () => {
        opened = true;
        this.send({ t: 'join', name, room, create });
        this.ping();
        this.pingTimer = setInterval(() => this.ping(), 2000);
        resolve();
      };
      ws.onerror = () => { if (!opened) reject(new Error('Could not connect to the server')); };
      ws.onclose = () => {
        clearInterval(this.pingTimer);
        const h = this.handlers.get('close');
        if (h && opened) h();
      };
      ws.onmessage = (ev) => {
        let msg;
        try { msg = JSON.parse(ev.data); } catch { return; }
        if (msg.t === 'pong') {
          const now = Date.now();
          this.rtt = now - msg.c;
          const est = msg.s + this.rtt / 2 - now;
          this.offset = this.haveOffset ? this.offset * 0.8 + est * 0.2 : est;
          this.haveOffset = true;
          return;
        }
        if (msg.t === 's' && !this.haveOffset) { this.offset = msg.ts - Date.now(); this.haveOffset = true; }
        const h = this.handlers.get(msg.t);
        if (h) h(msg);
      };
    });
  }

  ping() { this.send({ t: 'ping', c: Date.now(), rtt: this.rtt }); }

  serverNow() { return Date.now() + this.offset; }

  send(msg) {
    if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(msg));
  }

  close() {
    clearInterval(this.pingTimer);
    if (this.ws) { this.ws.onclose = null; this.ws.close(); }
    this.ws = null;
  }
}
