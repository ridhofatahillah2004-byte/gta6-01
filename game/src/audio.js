// All sound is synthesised with WebAudio — no audio files, no network.
// Every effect is a few oscillators or a burst of filtered noise.
export class AudioSys {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.engineOsc = null;
    this.engineGain = null;
    this.sirenTimer = null;
    this.sirenOn = false;
  }

  /** Call from a user gesture; browsers block audio before one. */
  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.35;
    this.master.connect(this.ctx.destination);
    // Engine hum: a sawtooth whose pitch follows speed, kept quiet.
    this.engineOsc = this.ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 55;
    this.engineGain = this.ctx.createGain();
    this.engineGain.gain.value = 0;
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 320;
    this.engineOsc.connect(lp); lp.connect(this.engineGain); this.engineGain.connect(this.master);
    this.engineOsc.start();
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.35;
  }

  /** 0..1 speed while driving; 0 silences the engine. */
  engine(amount, on) {
    if (!this.ctx || !this.engineGain) return;
    const t = this.ctx.currentTime;
    this.engineGain.gain.setTargetAtTime(on ? 0.05 + amount * 0.06 : 0, t, 0.08);
    this.engineOsc.frequency.setTargetAtTime(55 + amount * 110, t, 0.1);
  }

  _tone(freq, dur, type, vol, when = 0) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime + when;
    const o = this.ctx.createOscillator();
    o.type = type; o.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.02);
  }

  _noise(dur, vol, filterFreq) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const len = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = filterFreq;
    const g = this.ctx.createGain();
    g.gain.value = vol;
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t);
  }

  shot() { this._noise(0.14, 0.5, 900); this._tone(90, 0.12, 'square', 0.25); }
  enemyShot() { this._noise(0.1, 0.22, 700); }
  pickup() { this._tone(660, 0.09, 'sine', 0.3); this._tone(990, 0.14, 'sine', 0.3, 0.09); }
  click() { this._tone(440, 0.05, 'square', 0.12); }
  denied() { this._tone(160, 0.15, 'square', 0.2); }
  missionDone() {
    [523, 659, 784, 1046].forEach((f, i) => this._tone(f, 0.22, 'triangle', 0.3, i * 0.11));
  }
  wasted() { [392, 330, 262, 196].forEach((f, i) => this._tone(f, 0.4, 'sawtooth', 0.2, i * 0.22)); }
  reload() { this._tone(300, 0.06, 'square', 0.15); this._tone(380, 0.06, 'square', 0.15, 0.12); }

  /** Two-tone police siren while wanted; call with false to stop it. */
  siren(on) {
    if (on === this.sirenOn) return;
    this.sirenOn = on;
    if (this.sirenTimer) { clearInterval(this.sirenTimer); this.sirenTimer = null; }
    if (!on || !this.ctx) return;
    let high = false;
    this.sirenTimer = setInterval(() => {
      if (this.muted || !this.ctx) return;
      this._tone(high ? 950 : 700, 0.42, 'sine', 0.06);
      high = !high;
    }, 450);
  }
}
