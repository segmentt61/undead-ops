// Gamepad (PS4 / Xbox, standard mapping) and touch-screen controls.
// Both translate into the same game actions the keyboard and mouse use.

const DEAD = 0.16;
function stick(x, y) {
  const m = Math.hypot(x, y);
  if (m < DEAD) return [0, 0];
  const k = Math.min(1, (m - DEAD) / (1 - DEAD)) / m;
  return [x * k, y * k];
}

// Xbox button names; PlayStation names are swapped in when a Sony pad is detected
const XBOX = { use: 'X', jump: 'A', crouch: 'B', swap: 'Y' };
const PS = { use: '□', jump: '✕', crouch: '○', swap: '△' };

export class GamepadControls {
  constructor(actions) {
    this.a = actions;
    this.prev = [];
    this.connected = false;
    this.labels = XBOX;
    this.crouch = false;
    this.sprint = false;
    this.navRepeat = 0;
    this.gp = null;
    window.addEventListener('gamepadconnected', (e) => this.a.toast(`Controller connected: ${e.gamepad.id.split('(')[0].trim()}`));
    window.addEventListener('gamepaddisconnected', () => { this.connected = false; this.a.toast('Controller disconnected'); });
  }

  vibrate(strong, weak, ms) {
    const act = this.gp && this.gp.vibrationActuator;
    if (act && act.playEffect) act.playEffect('dual-rumble', { duration: ms, strongMagnitude: strong, weakMagnitude: weak }).catch(() => {});
  }

  /** Returns analog state for the frame, or null when no controller is in use. */
  poll(dt) {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    let gp = null;
    for (const p of pads) if (p && p.connected && p.buttons.length >= 16) { gp = p; break; }
    this.gp = gp;
    if (!gp) { this.connected = false; return null; }
    this.connected = true;
    this.labels = /054c|sony|playstation|dualshock|dualsense/i.test(gp.id) ? PS : XBOX;
    const btn = gp.buttons.map((b) => b.value > 0.5 || b.pressed);
    const down = (i) => btn[i] && !this.prev[i];
    const up = (i) => !btn[i] && this.prev[i];
    const [lx, ly] = stick(gp.axes[0] || 0, gp.axes[1] || 0);
    const [rx, ry] = stick(gp.axes[2] || 0, gp.axes[3] || 0);
    const any = btn.some(Boolean) || Math.abs(lx) + Math.abs(ly) + Math.abs(rx) + Math.abs(ry) > 0.3;
    if (any) this.a.setMode('pad');
    const a = this.a;
    let out = null;

    if (a.inGame()) {
      if (down(9)) a.pause();
      if (a.paused()) {
        if (down(1)) a.resume();
        this.menuNav(btn, down, ly);
      } else {
        if (down(1)) this.crouch = !this.crouch;
        if (down(10)) {
          if (this.sprint && !this.tac) this.tac = true; // second click while sprinting: tactical sprint
          else { this.sprint = !this.sprint; this.tac = false; }
        }
        if (Math.hypot(lx, ly) < 0.3) { this.sprint = false; this.tac = false; }
        if (down(2)) a.useOrReload(true);
        if (up(2)) a.useOrReload(false);
        if (down(3)) a.swap();
        if (down(14)) a.swap(0);
        if (down(15)) a.swap(1);
        if (down(4)) a.grenade();
        if (down(5) || down(11)) a.knife();
        a.trigger(gp.buttons[7].value > 0.3);
        a.ads(gp.buttons[6].value > 0.35);
        a.scoreboard(btn[8] || btn[12]);
        out = { move: [lx, -ly], look: [rx, ry], jump: btn[0], crouch: this.crouch, sprint: this.sprint, tac: this.tac };
      }
    } else {
      this.menuNav(btn, down, ly);
    }
    this.prev = btn;
    return out;
  }

  menuNav(btn, down, ly) {
    const a = this.a;
    this.navRepeat -= 1 / 60;
    const dir = btn[12] || ly < -0.6 ? -1 : btn[13] || ly > 0.6 ? 1 : 0;
    if (dir && (down(12) || down(13) || this.navRepeat <= 0)) { a.menuMove(dir); this.navRepeat = 0.22; }
    if (!dir) this.navRepeat = 0;
    if (down(14)) a.menuMove(-1, true);
    if (down(15)) a.menuMove(1, true);
    if (down(0)) a.menuClick();
    if (down(1)) a.menuBack();
  }
}

// ---------------------------------------------------------------- touch
// Few permanent buttons in an arc around FIRE (bottom-right), everything else only appears when it
// can be used (USE, RELOAD, KNIFE). Swapping weapons is the small button next to the ammo counter.
const ICON = {
  fire: '<circle cx="12" cy="12" r="6.5"/><path d="M12 1.5v5M12 17.5v5M1.5 12h5M17.5 12h5"/>',
  ads: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="1.6" fill="currentColor"/><path d="M12 3.5v3M12 17.5v3M3.5 12h3M17.5 12h3"/>',
  jump: '<path d="M5.5 13.5L12 7l6.5 6.5M5.5 19L12 12.5l6.5 6.5"/>',
  crouch: '<path d="M5.5 6.5L12 13l6.5-6.5"/><path d="M4.5 19h15"/>',
  nade: '<circle cx="12" cy="14" r="6.5"/><path d="M9.5 7.5h5l-1-2.5h-3zM14.5 6.5l3.5-3"/>',
  reload: '<path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3"/><path d="M19.5 3.5v5h-5"/>',
  knife: '<path d="M4 20l7.5-7.5"/><path d="M11.5 12.5L20 3l1 1-7.2 10.2z"/><path d="M8.5 13.5l2 2"/>',
  swap: '<path d="M4 8.5h14.5l-3.5-3.5M20 15.5H5.5L9 19"/>',
  pause: '<path d="M8.5 5.5v13M15.5 5.5v13"/>',
};
const svg = (k) => `<svg viewBox="0 0 24 24" aria-hidden="true">${ICON[k]}</svg>`;
// [angle in degrees around FIRE (0 = right, 90 = up), distance in rings, size px]
const RING = {
  fire: [0, 0, 84], jump: [96, 1, 56], nade: [131, 1, 50], crouch: [164, 1, 52], ads: [198, 1, 60],
  knife: [118, 1.78, 54], reload: [161, 1.8, 54],
};
const CONTEXT = ['use', 'reload', 'knife'];

export class TouchControls {
  constructor(actions) {
    this.a = actions;
    this.move = [0, 0];
    this.lookDX = 0;
    this.lookDY = 0;
    this.jump = false;
    this.crouch = false;
    this.fireHeld = false;
    this.scale = 1;
    this.ctx = { use: false, reload: false, knife: false };
    this.shownAt = {};
    this.pointers = new Map(); // pointerId -> role
    this.el = document.createElement('div');
    this.el.id = 'touchUI';
    this.el.className = 'hidden';
    const btn = (id, extra = '') => `<button class="tbtn${CONTEXT.includes(id) ? ' ctx' : ''} ${extra}" data-b="${id}" aria-label="${id}">${svg(id)}<span>${id === 'ads' ? 'AIM' : id === 'nade' ? '' : id === 'fire' ? '' : ''}</span></button>`;
    this.el.innerHTML = `
      <div id="tLookZone"></div>
      <div id="tStick"><div id="tKnob"></div></div>
      ${Object.keys(RING).map((id) => btn(id, id === 'fire' ? 'big' : '')).join('')}
      <button class="tbtn use ctx" data-b="use"><span id="tUseText">USE</span></button>
      <button class="tbtn tiny" id="tSwap" data-b="swap" aria-label="swap weapon">${svg('swap')}</button>
      <button class="tbtn tiny" id="tPause" data-b="pause" aria-label="pause">${svg('pause')}</button>`;
    document.body.appendChild(this.el);
    this.stick = this.el.querySelector('#tStick');
    this.knob = this.el.querySelector('#tKnob');
    this.useBtn = this.el.querySelector('[data-b=use]');
    this.useText = this.el.querySelector('#tUseText');
    this.layout();
    this.el.addEventListener('pointerdown', (e) => this.down(e));
    window.addEventListener('pointermove', (e) => this.moveEvt(e), { passive: false });
    window.addEventListener('pointerup', (e) => this.up(e));
    window.addEventListener('pointercancel', (e) => this.up(e));
    this.el.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  /** Place the button arc; scale comes from the "touch button size" setting. */
  layout(scale = this.scale) {
    this.scale = scale;
    const cR = 72 * scale, cB = 80 * scale, r = 100 * scale;
    for (const [id, [deg, ring, size]] of Object.entries(RING)) {
      const b = this.el.querySelector(`[data-b=${id}]`);
      const a = (deg * Math.PI) / 180, s = size * scale;
      const right = cR - Math.cos(a) * r * ring - s / 2, bottom = cB + Math.sin(a) * r * ring - s / 2;
      b.style.width = b.style.height = `${s}px`;
      b.style.right = `calc(${right.toFixed(1)}px + var(--sr))`;
      b.style.bottom = `calc(${bottom.toFixed(1)}px + var(--sb))`;
    }
    this.useBtn.style.right = `calc(${(215 * scale).toFixed(1)}px + var(--sr))`;
    this.useBtn.style.bottom = `calc(${(235 * scale).toFixed(1)}px + var(--sb))`;
    this.useBtn.style.transform = `scale(${scale})`;
  }

  show(on) { this.el.classList.toggle('hidden', !on); }

  /** Contextual buttons: { use: 'Buy Juggernog — 2500' | '', reload: bool, knife: bool } */
  setContext(c) {
    const now = performance.now();
    for (const k of CONTEXT) {
      const on = !!c[k];
      if (on === this.ctx[k]) continue;
      this.ctx[k] = on;
      if (on) this.shownAt[k] = now;
      this.el.querySelector(`[data-b=${k}]`).classList.toggle('show', on);
    }
    if (c.use && this.useText.textContent !== c.use) this.useText.textContent = c.use;
  }
  setUse(text) { this.setContext({ ...this.ctx, use: text || '' }); }

  down(e) {
    if (e.pointerType === 'mouse') return;
    e.preventDefault();
    this.a.setMode('touch');
    const b = e.target.closest('[data-b]');
    if (b) {
      const id = b.dataset.b;
      // a button that just popped up under a moving thumb shouldn't fire by accident
      if (CONTEXT.includes(id) && (!this.ctx[id] || performance.now() - (this.shownAt[id] || 0) < 220)) {
        this.pointers.set(e.pointerId, { role: 'look', x: e.clientX, y: e.clientY });
        return;
      }
      b.classList.add('on');
      this.pointers.set(e.pointerId, { role: 'btn', id, el: b, x: e.clientX, y: e.clientY });
      this.press(id, true);
      return;
    }
    if (e.clientX < window.innerWidth * 0.42) {
      // floating joystick wherever the left thumb lands
      this.pointers.set(e.pointerId, { role: 'stick', cx: e.clientX, cy: e.clientY });
      const half = 60 * this.scale;
      this.stick.style.left = `${e.clientX - half}px`;
      this.stick.style.top = `${e.clientY - half}px`;
      this.stick.classList.add('on');
      this.knob.style.transform = 'translate(0px, 0px)';
    } else {
      this.pointers.set(e.pointerId, { role: 'look', x: e.clientX, y: e.clientY });
    }
  }

  moveEvt(e) {
    const p = this.pointers.get(e.pointerId);
    if (!p) return;
    e.preventDefault();
    if (p.role === 'stick') {
      let dx = e.clientX - p.cx, dy = e.clientY - p.cy;
      const m = Math.hypot(dx, dy), max = 55 * this.scale;
      if (m > max) { dx *= max / m; dy *= max / m; }
      this.knob.style.transform = `translate(${dx}px, ${dy}px)`;
      this.move = [dx / max, -dy / max];
    } else if (p.role === 'look' || (p.role === 'btn' && (p.id === 'fire' || p.id === 'ads'))) {
      // the fire and aim buttons also steer the camera while held, like mobile shooters
      this.lookDX += e.clientX - p.x;
      this.lookDY += e.clientY - p.y;
      p.x = e.clientX; p.y = e.clientY;
    }
  }

  up(e) {
    const p = this.pointers.get(e.pointerId);
    if (!p) return;
    this.pointers.delete(e.pointerId);
    if (p.role === 'stick') {
      this.move = [0, 0];
      this.stick.classList.remove('on');
    } else if (p.role === 'btn') {
      p.el.classList.remove('on');
      this.press(p.id, false);
    }
  }

  press(id, on) {
    const a = this.a;
    switch (id) {
      case 'fire': this.fireHeld = on; break; // the game decides when to shoot (see auto-fire)
      case 'ads': if (on) a.adsToggle(); break;
      case 'jump': this.jump = on; break;
      case 'crouch': if (on) this.crouch = !this.crouch; break;
      case 'reload': if (on) a.reload(); break;
      case 'nade': if (on) a.grenade(); break;
      case 'knife': if (on) a.knife(); break;
      case 'swap': if (on) a.swap(); break;
      case 'use': a.useOrReload(on, true); break;
      case 'pause': if (on) a.pause(); break;
    }
  }

  /** Analog state for this frame. */
  poll() {
    const look = [this.lookDX, this.lookDY];
    this.lookDX = 0; this.lookDY = 0;
    const m = Math.hypot(this.move[0], this.move[1]);
    return { move: this.move, lookPx: look, jump: this.jump, crouch: this.crouch, sprint: m > 0.92 && this.move[1] > 0.5, fireHeld: this.fireHeld };
  }

  reset() {
    this.pointers.clear();
    this.move = [0, 0];
    this.jump = false;
    this.fireHeld = false;
    this.el.querySelectorAll('.on').forEach((b) => b.classList.remove('on'));
    this.stick.classList.remove('on');
  }
}

export const isTouchDevice = () => matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
