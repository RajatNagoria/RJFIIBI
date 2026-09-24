// Procedural spatial audio: every sound is synthesized with the Web Audio API —
// no audio assets. Impacts are positioned in 3D via a pool of HRTF panners.
export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this._pool = [];
    this._poolIdx = 0;
    this._birdTimer = 3;
    this._stepTimer = 0;
  }

  // Must be called from a user gesture.
  resume() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.9;
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -18;
      comp.ratio.value = 6;
      this.master.connect(comp);
      comp.connect(this.ctx.destination);
      this._initPool();
      this._startWind();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  _initPool() {
    for (let i = 0; i < 10; i++) {
      const panner = this.ctx.createPanner();
      panner.panningModel = 'HRTF';
      panner.distanceModel = 'inverse';
      panner.refDistance = 3;
      panner.maxDistance = 250;
      panner.rolloffFactor = 1;
      const gain = this.ctx.createGain();
      gain.gain.value = 1;
      panner.connect(gain);
      gain.connect(this.master);
      this._pool.push({ panner, gain });
    }
  }

  _spatialNode(x, y, z) {
    const slot = this._pool[this._poolIdx];
    this._poolIdx = (this._poolIdx + 1) % this._pool.length;
    const p = slot.panner;
    if (p.positionX) {
      p.positionX.value = x; p.positionY.value = y; p.positionZ.value = z;
    } else {
      p.setPosition(x, y, z);
    }
    return slot.gain;
  }

  _noiseBuffer(seconds = 1) {
    const sr = this.ctx.sampleRate;
    const buf = this.ctx.createBuffer(1, sr * seconds, sr);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  updateListener(pos, fwd, up) {
    if (!this.ctx) return;
    const l = this.ctx.listener;
    if (l.positionX) {
      l.positionX.value = pos[0]; l.positionY.value = pos[1]; l.positionZ.value = pos[2];
      l.forwardX.value = fwd[0]; l.forwardY.value = fwd[1]; l.forwardZ.value = fwd[2];
      l.upX.value = up[0]; l.upY.value = up[1]; l.upZ.value = up[2];
    } else {
      l.setPosition(pos[0], pos[1], pos[2]);
      l.setOrientation(fwd[0], fwd[1], fwd[2], up[0], up[1], up[2]);
    }
  }

  playImpact(x, y, z, strength, metallic) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const out = this._spatialNode(x, y, z);
    const vol = Math.min(0.9, 0.08 + strength / 40);

    // body thump: decaying sine
    const osc = this.ctx.createOscillator();
    const og = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(metallic ? 320 : 130, t);
    osc.frequency.exponentialRampToValueAtTime(metallic ? 90 : 45, t + 0.12);
    og.gain.setValueAtTime(vol, t);
    og.gain.exponentialRampToValueAtTime(0.001, t + (metallic ? 0.3 : 0.18));
    osc.connect(og); og.connect(out);
    osc.start(t); osc.stop(t + 0.35);

    // contact noise burst
    const ns = this.ctx.createBufferSource();
    ns.buffer = this._noiseBuf || (this._noiseBuf = this._noiseBuffer(0.5));
    const nf = this.ctx.createBiquadFilter();
    nf.type = 'bandpass';
    nf.frequency.value = metallic ? 2400 : 900;
    nf.Q.value = 0.8;
    const ng = this.ctx.createGain();
    ng.gain.setValueAtTime(vol * 0.7, t);
    ng.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
    ns.connect(nf); nf.connect(ng); ng.connect(out);
    ns.start(t); ns.stop(t + 0.12);

    if (metallic) {
      const ping = this.ctx.createOscillator();
      const pg = this.ctx.createGain();
      ping.type = 'triangle';
      ping.frequency.value = 1400 + Math.random() * 1400;
      pg.gain.setValueAtTime(vol * 0.35, t);
      pg.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
      ping.connect(pg); pg.connect(out);
      ping.start(t); ping.stop(t + 0.5);
    }
  }

  playShoot() {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const og = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(260, t);
    osc.frequency.exponentialRampToValueAtTime(55, t + 0.14);
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(3000, t);
    lp.frequency.exponentialRampToValueAtTime(300, t + 0.15);
    og.gain.setValueAtTime(0.35, t);
    og.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
    osc.connect(lp); lp.connect(og); og.connect(this.master);
    osc.start(t); osc.stop(t + 0.2);

    const ns = this.ctx.createBufferSource();
    ns.buffer = this._noiseBuf || (this._noiseBuf = this._noiseBuffer(0.5));
    const ng = this.ctx.createGain();
    ng.gain.setValueAtTime(0.18, t);
    ng.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
    ns.connect(ng); ng.connect(this.master);
    ns.start(t); ns.stop(t + 0.12);
  }

  playFootstep(speed) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const ns = this.ctx.createBufferSource();
    ns.buffer = this._noiseBuf || (this._noiseBuf = this._noiseBuffer(0.5));
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 350 + speed * 30;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.10, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
    ns.connect(f); f.connect(g); g.connect(this.master);
    ns.start(t, Math.random() * 0.3); ns.stop(t + 0.09);
  }

  playJumpLand(hard) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const og = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(hard ? 140 : 100, t);
    osc.frequency.exponentialRampToValueAtTime(40, t + 0.1);
    og.gain.setValueAtTime(hard ? 0.4 : 0.15, t);
    og.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
    osc.connect(og); og.connect(this.master);
    osc.start(t); osc.stop(t + 0.18);
  }

  // ambient wind: looped filtered noise with slow LFO on the gain
  _startWind() {
    const ns = this.ctx.createBufferSource();
    ns.buffer = this._noiseBuffer(4);
    ns.loop = true;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 320;
    bp.Q.value = 0.45;
    const g = this.ctx.createGain();
    g.gain.value = 0.055;
    const lfo = this.ctx.createOscillator();
    lfo.frequency.value = 0.09;
    const lfoGain = this.ctx.createGain();
    lfoGain.gain.value = 0.028;
    lfo.connect(lfoGain); lfoGain.connect(g.gain);
    ns.connect(bp); bp.connect(g); g.connect(this.master);
    ns.start();
    lfo.start();
  }

  // occasional distant bird chirps, placed in 3D space around the player
  _birdChirp(playerPos) {
    const t = this.ctx.currentTime;
    const ang = Math.random() * Math.PI * 2;
    const dist = 15 + Math.random() * 40;
    const out = this._spatialNode(
      playerPos[0] + Math.cos(ang) * dist,
      playerPos[1] + 4 + Math.random() * 10,
      playerPos[2] + Math.sin(ang) * dist);
    for (let i = 0; i < 3; i++) {
      const t0 = t + i * (0.09 + Math.random() * 0.05);
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = 'sine';
      const f0 = 2400 + Math.random() * 1200;
      osc.frequency.setValueAtTime(f0, t0);
      osc.frequency.exponentialRampToValueAtTime(f0 * (1.1 + Math.random() * 0.3), t0 + 0.04);
      osc.frequency.exponentialRampToValueAtTime(f0 * 0.85, t0 + 0.08);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.16, t0 + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.09);
      osc.connect(g); g.connect(out);
      osc.start(t0); osc.stop(t0 + 0.12);
    }
  }

  // called each frame
  update(dt, camera, playerSpeed, grounded) {
    if (!this.ctx || this.muted) return;
    this.updateListener(camera.position, camera.forward, camera.up);

    // footsteps
    if (grounded && playerSpeed > 1.2) {
      this._stepTimer -= dt;
      if (this._stepTimer <= 0) {
        this._stepTimer = Math.max(0.26, 0.55 - playerSpeed * 0.035);
        this.playFootstep(playerSpeed);
      }
    } else {
      this._stepTimer = 0.1;
    }

    // birds
    this._birdTimer -= dt;
    if (this._birdTimer <= 0) {
      this._birdTimer = 5 + Math.random() * 8;
      if (Math.random() < 0.65) this._birdChirp(camera.position);
    }
  }

  toggleMute() {
    if (!this.ctx) return false;
    this.muted = !this.muted;
    this.master.gain.value = this.muted ? 0 : 0.9;
    return this.muted;
  }
}

