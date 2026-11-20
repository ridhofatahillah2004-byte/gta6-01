// All sound in SOLMAR is synthesised with WebAudio — no audio files.
// Engine hum, sirens, gunshots, chimes and a soft ambient pad are built
// from oscillators and filtered noise, and stay silent until the player
// first interacts (browsers block audio before a gesture).
export class SoundBank {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.engineOsc = null;
    this.engineGain = null;
    this.engineFilter = null;
    this.sirenOsc = null;
    this.sirenGain = null;
    this.padOsc = null;
    this.noiseBuf = null;
  }

  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(this.ctx.destination);
    const len = this.ctx.sampleRate;
    this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = Math.random() * 2 - 1;
    this.startPad();
    this.startEngine();
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.5;
  }

  startPad() {
    const ctx = this.ctx;
    const g = ctx.createGain();
    g.gain.value = 0.018;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 420;
    const o1 = ctx.createOscillator();
    o1.type = 'triangle';
    o1.frequency.value = 110;
    const o2 = ctx.createOscillator();
    o2.type = 'triangle';
    o2.frequency.value = 164.81;
    o1.connect(f);
    o2.connect(f);
    f.connect(g);
    g.connect(this.master);
    o1.start();
    o2.start();
    this.padOsc = [o1, o2];
  }

  startEngine() {
    const ctx = this.ctx;
    this.engineOsc = ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 55;
    this.engineFilter = ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.value = 320;
    this.engineGain = ctx.createGain();
    this.engineGain.gain.value = 0;
    this.engineOsc.connect(this.engineFilter);
    this.engineFilter.connect(this.engineGain);
    this.engineGain.connect(this.master);
    this.engineOsc.start();
  }

  // speed01: 0..1 of the car's top speed. Call every frame while driving.
  engine(speed01, on) {
    if (!this.ctx || !this.engineOsc) return;
    const t = this.ctx.currentTime;
    this.engineOsc.frequency.setTargetAtTime(52 + speed01 * 130, t, 0.08);
    this.engineFilter.frequency.setTargetAtTime(280 + speed01 * 900, t, 0.08);
    this.engineGain.gain.setTargetAtTime(on ? 0.045 + speed01 * 0.05 : 0, t, 0.1);
  }

  siren(on) {
    if (!this.ctx) return;
    if (on && !this.sirenOsc) {
      const ctx = this.ctx;
      this.sirenOsc = ctx.createOscillator();
      this.sirenOsc.type = 'square';
      this.sirenOsc.frequency.value = 820;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.7;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 140;
      lfo.connect(lfoGain);
      lfoGain.connect(this.sirenOsc.frequency);
      this.sirenGain = ctx.createGain();
      this.sirenGain.gain.value = 0.028;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 1400;
      this.sirenOsc.connect(lp);
      lp.connect(this.sirenGain);
      this.sirenGain.connect(this.master);
      this.sirenOsc.start();
      lfo.start();
      this.sirenLfo = lfo;
    } else if (!on && this.sirenOsc) {
      try {
        this.sirenOsc.stop();
        this.sirenLfo.stop();
      } catch (e) { /* already stopped */ }
      this.sirenOsc = null;
      this.sirenLfo = null;
    }
  }

  blip(freq, dur, vol, type) {
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = type || 'sine';
    o.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    o.connect(g);
    g.connect(this.master);
    o.start();
    o.stop(ctx.currentTime + dur);
  }

  shot() {
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1700;
    bp.Q.value = 0.8;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.3, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.14);
    src.connect(bp);
    bp.connect(g);
    g.connect(this.master);
    src.start();
    src.stop(ctx.currentTime + 0.15);
    this.blip(160, 0.1, 0.18, 'square');
  }

  pickup() {
    this.blip(880, 0.12, 0.16);
    setTimeout(() => this.blip(1318, 0.16, 0.16), 90);
  }

  missionDone() {
    const notes = [523, 659, 784, 1046];
    notes.forEach((n, i) => setTimeout(() => this.blip(n, 0.22, 0.18), i * 95));
  }

  click() {
    this.blip(1200, 0.05, 0.1, 'square');
  }

  busted() {
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(300, ctx.currentTime);
    o.frequency.exponentialRampToValueAtTime(70, ctx.currentTime + 0.7);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.2, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.75);
    o.connect(g);
    g.connect(this.master);
    o.start();
    o.stop(ctx.currentTime + 0.8);
  }
}
