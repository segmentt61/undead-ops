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
        if (down(10)) this.sprint = !this.sprint;
        if (Math.hypot(lx, ly) < 0.3) this.sprint = false;
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
        out = { move: [lx, -ly], look: [rx, ry], jump: btn[0], crouch: this.crouch, sprint: this.sprint };
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
const BUTTONS = [
  // id, label, css class
  ['fire', 'FIRE', 'big'],
  ['ads', 'AIM', ''],
  ['jump', 'JUMP', ''],
  ['crouch', 'CROUCH', 'small'],
  ['reload', 'RELOAD', 'small'],
  ['nade', 'NADE', 'small'],
  ['knife', 'KNIFE', 'small'],
  ['swap', 'SWAP', 'small'],
  ['use', 'USE', 'use'],
];

export class TouchControls {
  constructor(actions) {
    this.a = actions;
    this.move = [0, 0];
    this.lookDX = 0;
    this.lookDY = 0;
    this.jump = false;
    this.crouch = false;
    this.pointers = new Map(); // pointerId -> role
    this.el = document.createElement('div');
    this.el.id = 'touchUI';
    this.el.className = 'hidden';
    this.el.innerHTML = `
      <div id="tLookZone"></div>
      <div id="tStick"><div id="tKnob"></div></div>
      <div id="tButtons">${BUTTONS.map(([id, label, cls]) => `<button class="tbtn ${cls}" data-b="${id}">${label}</button>`).join('')}</div>
      <button class="tbtn tiny" id="tPause" data-b="pause">II</button>
      <button class="tbtn tiny" id="tScore" data-b="score">&#9776;</button>`;
    document.body.appendChild(this.el);
    this.stick = this.el.querySelector('#tStick');
    this.knob = this.el.querySelector('#tKnob');
    this.useBtn = this.el.querySelector('[data-b=use]');
    this.el.addEventListener('pointerdown', (e) => this.down(e));
    window.addEventListener('pointermove', (e) => this.moveEvt(e), { passive: false });
    window.addEventListener('pointerup', (e) => this.up(e));
    window.addEventListener('pointercancel', (e) => this.up(e));
    this.el.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  show(on) { this.el.classList.toggle('hidden', !on); }
  setUse(text) {
    this.useBtn.classList.toggle('ready', !!text);
  }

  down(e) {
    if (e.pointerType === 'mouse') return;
    e.preventDefault();
    this.a.setMode('touch');
    const b = e.target.closest('[data-b]');
    if (b) {
      const id = b.dataset.b;
      b.classList.add('on');
      this.pointers.set(e.pointerId, { role: 'btn', id, el: b, x: e.clientX, y: e.clientY });
      this.press(id, true);
      return;
    }
    if (e.clientX < window.innerWidth * 0.4) {
      // floating joystick wherever the left thumb lands
      this.pointers.set(e.pointerId, { role: 'stick', cx: e.clientX, cy: e.clientY });
      this.stick.style.left = `${e.clientX - 60}px`;
      this.stick.style.top = `${e.clientY - 60}px`;
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
      const m = Math.hypot(dx, dy), max = 55;
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
      case 'fire': a.trigger(on); break;
      case 'ads': if (on) a.adsToggle(); break;
      case 'jump': this.jump = on; break;
      case 'crouch': if (on) this.crouch = !this.crouch; break;
      case 'reload': if (on) a.reload(); break;
      case 'nade': if (on) a.grenade(); break;
      case 'knife': if (on) a.knife(); break;
      case 'swap': if (on) a.swap(); break;
      case 'use': a.useOrReload(on, true); break;
      case 'pause': if (on) a.pause(); break;
      case 'score': a.scoreboard(on); break;
    }
  }

  /** Analog state for this frame. */
  poll() {
    const look = [this.lookDX, this.lookDY];
    this.lookDX = 0; this.lookDY = 0;
    const m = Math.hypot(this.move[0], this.move[1]);
    return { move: this.move, lookPx: look, jump: this.jump, crouch: this.crouch, sprint: m > 0.92 && this.move[1] > 0.5 };
  }

  reset() {
    this.pointers.clear();
    this.move = [0, 0];
    this.jump = false;
    this.el.querySelectorAll('.on').forEach((b) => b.classList.remove('on'));
    this.stick.classList.remove('on');
  }
}

export const isTouchDevice = () => matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
