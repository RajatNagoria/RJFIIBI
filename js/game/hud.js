// DOM HUD: stats, crosshair, help, pointer-lock overlay.
export class Hud {
  constructor() {
    this.elStats = document.getElementById('stats');
    this.elOverlay = document.getElementById('overlay');
    this.elHelp = document.getElementById('help');
    this.elCrosshair = document.getElementById('crosshair');
    this.elToast = document.getElementById('toast');
    this._toastTimer = null;
    this._acc = 0;
    this._frames = 0;
    this.fps = 0;
  }

  setLocked(locked) {
    this.elOverlay.classList.toggle('hidden', locked);
    this.elCrosshair.classList.toggle('hidden', !locked);
  }

  toast(msg) {
    this.elToast.textContent = msg;
    this.elToast.classList.remove('hidden');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => this.elToast.classList.add('hidden'), 1800);
  }

  toggleHelp() {
    this.elHelp.classList.toggle('hidden');
  }

  // throttled to 4 Hz
  update(dt, info) {
    this._acc += dt;
    this._frames++;
    if (this._acc >= 0.25) {
      this.fps = Math.round(this._frames / this._acc);
      this._acc = 0;
      this._frames = 0;
      this.elStats.innerHTML =
        `<b>${this.fps}</b> fps &nbsp;·&nbsp; ${info.drawCalls} draws · ${(info.triangles / 1000).toFixed(0)}k tris<br>` +
        `${info.bodies} bodies (${info.asleep} asleep) · phys ${info.physMs.toFixed(1)} ms<br>` +
        `xyz ${info.pos.map(v => v.toFixed(1)).join(', ')}`;
    }
  }
}
