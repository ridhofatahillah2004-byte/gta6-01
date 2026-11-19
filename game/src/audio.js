// All sound is synthesised with WebAudio — engine hum, sirens, gunshots,
// pickups, mission jingles and a bassline loop. No audio files, no network.
// Everything guards against a missing AudioContext (headless screenshots).
export function createAudio() {
  let ctx = null;
  let master = null;
  let engineOsc = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let sirenTimer = null;
  let musicTimer = null;
  let musicStep = 0;
  let muted = false;

  function ensure() {
    if (ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
      return true;
    } catch {
      return false;
    }
  }

  function resume() {
    if (ensure() && ctx.state === 'suspended') ctx.resume().catch(() => {});
  }

  function tone(freq, dur, type, gain, when = 0, slideTo = null) {
    if (!ensure() || muted) return;
    const t0 = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(g);
    g.connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  function noise(dur, gain, lowpass = 1200) {
    if (!ensure() || muted) return;
    const t0 = ctx.currentTime;
    const len = Math.floor(ctx.sampleRate * dur);
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = lowpass;
    const g = ctx.createGain();
    g.gain.value = gain;
    src.connect(filter);
    filter.connect(g);
    g.connect(master);
    src.start(t0);
  }

  return {
    resume,
    setMuted(value) {
      muted = value;
      if (master) master.gain.value = muted ? 0 : 0.5;
    },
    isMuted() {
      return muted;
    },
    click() {
      tone(660, 0.07, 'square', 0.12);
    },
    shot(enemy) {
      noise(0.14, enemy ? 0.25 : 0.5, enemy ? 900 : 2400);
      tone(enemy ? 160 : 110, 0.1, 'sine', 0.3, 0, 55);
    },
    reload() {
      tone(300, 0.06, 'square', 0.12);
      tone(420, 0.06, 'square', 0.12, 0.12);
    },
    thud() {
      noise(0.12, 0.3, 300);
      tone(70, 0.12, 'sine', 0.3, 0, 40);
    },
    explosion() {
      noise(0.7, 0.7, 500);
      tone(60, 0.6, 'sine', 0.5, 0, 30);
    },
    pickup() {
      tone(880, 0.09, 'sine', 0.2);
      tone(1318, 0.12, 'sine', 0.2, 0.08);
    },
    missionComplete() {
      [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.16, 'triangle', 0.22, i * 0.11));
    },
    missionFail() {
      [392, 330, 262].forEach((f, i) => tone(f, 0.2, 'sawtooth', 0.14, i * 0.13));
    },
    sirenBurst() {
      tone(700, 0.35, 'square', 0.1, 0, 950);
      tone(950, 0.35, 'square', 0.1, 0.35, 700);
    },
    setSiren(on) {
      if (!ensure()) return;
      if (on && !sirenOsc) {
        sirenOsc = ctx.createOscillator();
        sirenGain = ctx.createGain();
        sirenOsc.type = 'triangle';
        sirenOsc.frequency.value = 750;
        sirenGain.gain.value = 0.045;
        sirenOsc.connect(sirenGain);
        sirenGain.connect(master);
        sirenOsc.start();
        let high = false;
        sirenTimer = window.setInterval(() => {
          if (!sirenOsc) return;
          high = !high;
          sirenOsc.frequency.setTargetAtTime(high ? 950 : 700, ctx.currentTime, 0.05);
        }, 420);
      } else if (!on && sirenOsc) {
        window.clearInterval(sirenTimer);
        sirenTimer = null;
        try {
          sirenOsc.stop();
        } catch {
          // Already stopped.
        }
        sirenOsc.disconnect();
        sirenOsc = null;
      }
    },
    setEngine(on, speedRatio) {
      if (!ensure()) return;
      if (on && !engineOsc) {
        engineOsc = ctx.createOscillator();
        engineGain = ctx.createGain();
        engineOsc.type = 'sawtooth';
        engineOsc.frequency.value = 60;
        engineGain.gain.value = 0.05;
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 500;
        engineOsc.connect(filter);
        filter.connect(engineGain);
        engineGain.connect(master);
        engineOsc.start();
      } else if (!on && engineOsc) {
        try {
          engineOsc.stop();
        } catch {
          // Already stopped.
        }
        engineOsc.disconnect();
        engineOsc = null;
      }
      if (engineOsc) {
        engineOsc.frequency.setTargetAtTime(55 + speedRatio * 140, ctx.currentTime, 0.08);
        engineGain.gain.setTargetAtTime(0.03 + speedRatio * 0.05, ctx.currentTime, 0.1);
      }
    },
    startMusic() {
      if (!ensure() || musicTimer) return;
      // A lazy bassline loop: A minor groove, 112 BPM.
      const bass = [55, 0, 55, 65.41, 0, 55, 49, 61.74];
      const stepSeconds = 60 / 112 / 2;
      musicTimer = window.setInterval(() => {
        if (muted) return;
        const f = bass[musicStep % bass.length];
        if (f) tone(f, stepSeconds * 0.9, 'triangle', 0.16);
        if (musicStep % 2 === 0) noise(0.03, 0.05, 6000);
        musicStep += 1;
      }, stepSeconds * 1000);
    },
    stopMusic() {
      if (musicTimer) {
        window.clearInterval(musicTimer);
        musicTimer = null;
      }
    },
  };
}
