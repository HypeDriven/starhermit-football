// StarHermit Football — game audio.
// Everything is synthesized with the Web Audio API; no audio files.
// Lazily created AudioContext: call resume() from a user gesture.

const MUTE_KEY = 'starhermit-football-muted';

function rand(min, max) {
  return min + Math.random() * (max - min);
}

function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

export function createAudio() {
  const AC =
    typeof window !== 'undefined'
      ? window.AudioContext || window.webkitAudioContext
      : null;

  let ctx = null;
  let master = null; // master gain -> destination
  let sfxBus = null; // dry bus for ball/player/ui sounds
  let crowdBus = null; // crowd sounds, feeds master + reverb send
  let crowdBedGain = null; // excitement-controlled gain for the looped bed
  let noiseBuffer = null;
  let built = false;
  let excitement = 0.35;

  let muted = false;
  try {
    muted = localStorage.getItem(MUTE_KEY) === '1';
  } catch (e) {
    /* localStorage unavailable — ignore */
  }

  function ready() {
    return !!ctx;
  }

  // ---------------------------------------------------------------------------
  // Graph construction (once, on first resume)
  // ---------------------------------------------------------------------------

  function buildNoiseBuffer() {
    const len = Math.floor(ctx.sampleRate * 2);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const data = buf.getChannelData(ch);
      // White noise with a mild 1/f tilt so raw loops feel less harsh.
      let last = 0;
      for (let i = 0; i < len; i++) {
        const white = Math.random() * 2 - 1;
        last = last * 0.94 + white * 0.06;
        data[i] = (white * 0.55 + last * 3.2) * 0.5;
      }
    }
    return buf;
  }

  // Reverb-ish stadium feel: two feedback delays in parallel.
  function buildReverb() {
    const send = ctx.createGain();
    send.gain.value = 1;
    const wet = ctx.createGain();
    wet.gain.value = 0.35;
    wet.connect(master);

    const mkTap = (time, feedback, freq) => {
      const delay = ctx.createDelay(0.5);
      delay.delayTime.value = time;
      const fb = ctx.createGain();
      fb.gain.value = feedback;
      const damp = ctx.createBiquadFilter();
      damp.type = 'lowpass';
      damp.frequency.value = freq;
      send.connect(delay);
      delay.connect(damp);
      damp.connect(fb);
      fb.connect(delay);
      damp.connect(wet);
    };
    mkTap(0.11, 0.42, 2600);
    mkTap(0.19, 0.34, 1700);
    return send;
  }

  // Crowd bed: several looped noise sources at different band-passes panned
  // across the stereo field, with slow drifting LFOs on filter freq and gain.
  function buildCrowdBed() {
    crowdBedGain = ctx.createGain();
    crowdBedGain.gain.value = 0;
    crowdBedGain.connect(crowdBus);

    const voices = [
      { freq: 320, q: 0.7, gain: 0.5, pan: -0.7 },
      { freq: 520, q: 0.9, gain: 0.62, pan: -0.25 },
      { freq: 700, q: 1.1, gain: 0.58, pan: 0.25 },
      { freq: 950, q: 0.8, gain: 0.42, pan: 0.7 },
      { freq: 1400, q: 0.6, gain: 0.22, pan: 0 },
      { freq: 210, q: 0.5, gain: 0.35, pan: 0.05 },
    ];

    for (const v of voices) {
      const src = ctx.createBufferSource();
      src.buffer = noiseBuffer;
      src.loop = true;
      src.playbackRate.value = rand(0.85, 1.15);

      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = v.freq * rand(0.92, 1.08);
      bp.Q.value = v.q;

      const g = ctx.createGain();
      g.gain.value = v.gain;

      src.connect(bp);
      bp.connect(g);
      let tail = g;
      if (typeof ctx.createStereoPanner === 'function') {
        const p = ctx.createStereoPanner();
        p.pan.value = v.pan;
        g.connect(p);
        tail = p;
      }
      tail.connect(crowdBedGain);

      // Slow LFO on filter frequency.
      const lfoF = ctx.createOscillator();
      lfoF.type = 'sine';
      lfoF.frequency.value = rand(0.04, 0.11);
      const lfoFG = ctx.createGain();
      lfoFG.gain.value = v.freq * rand(0.12, 0.3);
      lfoF.connect(lfoFG);
      lfoFG.connect(bp.frequency);
      lfoF.start();

      // Slow LFO on gain, different rate, so the bed breathes.
      const lfoG = ctx.createOscillator();
      lfoG.type = 'sine';
      lfoG.frequency.value = rand(0.03, 0.09);
      const lfoGG = ctx.createGain();
      lfoGG.gain.value = v.gain * rand(0.25, 0.45);
      lfoG.connect(lfoGG);
      lfoGG.connect(g.gain);
      lfoG.start();

      src.start();
    }
  }

  function build() {
    if (built || !AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 1;
    master.connect(ctx.destination);

    sfxBus = ctx.createGain();
    sfxBus.gain.value = 0.9;
    sfxBus.connect(master);

    const reverbSend = buildReverb();

    crowdBus = ctx.createGain();
    crowdBus.gain.value = 0.8;
    crowdBus.connect(master);
    crowdBus.connect(reverbSend);

    noiseBuffer = buildNoiseBuffer();
    buildCrowdBed();
    applyExcitement(ctx.currentTime);
    built = true;
  }

  function applyExcitement(t) {
    if (!crowdBedGain) return;
    // Excitement 0..1 mapped to a usable bed level (never fully silent curves).
    const target = Math.pow(clamp01(excitement), 1.4) * 0.5;
    crowdBedGain.gain.cancelScheduledValues(t);
    crowdBedGain.gain.setTargetAtTime(target, t, 0.4);
  }

  // ---------------------------------------------------------------------------
  // Synthesis helpers — short-lived nodes, collected after they stop.
  // ---------------------------------------------------------------------------

  function chainTail(node, dest, pan) {
    let tail = node;
    if (pan && typeof ctx.createStereoPanner === 'function') {
      const p = ctx.createStereoPanner();
      p.pan.value = pan;
      node.connect(p);
      tail = p;
    }
    tail.connect(dest);
  }

  // Enveloped noise burst through a filter.
  function noiseBurst(dest, t, o) {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer;
    src.playbackRate.value = o.rate || 1;

    const f = ctx.createBiquadFilter();
    f.type = o.type || 'bandpass';
    f.frequency.setValueAtTime(o.freq, t);
    if (o.freqEnd) f.frequency.exponentialRampToValueAtTime(o.freqEnd, t + o.dur);
    f.Q.value = o.q || 1;

    const g = ctx.createGain();
    const a = o.attack || 0.004;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, o.gain), t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);

    src.connect(f);
    f.connect(g);
    chainTail(g, dest, o.pan || 0);
    src.start(t, rand(0, 1.5));
    src.stop(t + o.dur + 0.05);
  }

  // Enveloped oscillator tone with optional pitch glide.
  function tone(dest, t, o) {
    const osc = ctx.createOscillator();
    osc.type = o.wave || 'sine';
    osc.frequency.setValueAtTime(o.freq, t);
    if (o.freqEnd)
      osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.freqEnd), t + (o.glide || o.dur));
    if (o.detune) osc.detune.value = o.detune;

    const g = ctx.createGain();
    const a = o.attack || 0.005;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, o.gain), t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);

    osc.connect(g);
    chainTail(g, dest, o.pan || 0);
    osc.start(t);
    osc.stop(t + o.dur + 0.05);
    return osc;
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  return {
    resume() {
      if (!AC) return;
      if (!built) build();
      if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
    },

    setMuted(m) {
      muted = !!m;
      try {
        localStorage.setItem(MUTE_KEY, muted ? '1' : '0');
      } catch (e) {
        /* ignore */
      }
      if (ready()) {
        const t = ctx.currentTime;
        master.gain.cancelScheduledValues(t);
        master.gain.setTargetAtTime(muted ? 0 : 1, t, 0.03);
      }
    },

    isMuted() {
      return muted;
    },

    kick(power) {
      if (!ready()) return;
      const p = clamp01(power);
      const t = ctx.currentTime + 0.001;
      const det = rand(0.92, 1.1); // per-call detune
      const pan = rand(-0.15, 0.15);

      // Band-passed noise slap.
      noiseBurst(sfxBus, t, {
        freq: (900 + p * 900) * det,
        q: 1.2,
        gain: 0.22 + p * 0.5,
        dur: 0.06 + p * 0.04,
        attack: 0.002,
        rate: rand(0.9, 1.15),
        pan,
      });
      // Low sine thud, pitch drops as it decays.
      tone(sfxBus, t, {
        freq: (120 + p * 90) * det,
        freqEnd: 45,
        glide: 0.09,
        gain: 0.35 + p * 0.55,
        dur: 0.12 + p * 0.1,
        attack: 0.002,
        pan,
      });
    },

    bounce(power) {
      if (!ready()) return;
      const p = clamp01(power);
      const t = ctx.currentTime + 0.001;
      const det = rand(0.9, 1.12);

      noiseBurst(sfxBus, t, {
        freq: 500 * det + p * 300,
        q: 1.6,
        gain: 0.08 + p * 0.22,
        dur: 0.05 + p * 0.04,
        attack: 0.002,
        rate: rand(0.85, 1.1),
        pan: rand(-0.2, 0.2),
      });
      tone(sfxBus, t, {
        freq: (85 + p * 40) * det,
        freqEnd: 40,
        gain: 0.12 + p * 0.25,
        dur: 0.08 + p * 0.06,
        attack: 0.002,
      });
    },

    tackle() {
      if (!ready()) return;
      const t = ctx.currentTime + 0.001;
      // Body/grass scuff: band-swept noise swish.
      noiseBurst(sfxBus, t, {
        freq: rand(1400, 2200),
        freqEnd: rand(250, 450),
        q: rand(0.8, 1.4),
        gain: rand(0.2, 0.32),
        dur: rand(0.22, 0.34),
        attack: 0.01,
        rate: rand(0.8, 1.2),
        pan: rand(-0.25, 0.25),
      });
      // Soft impact under the scuff.
      tone(sfxBus, t, {
        freq: rand(95, 130),
        freqEnd: 50,
        gain: rand(0.12, 0.2),
        dur: 0.12,
        attack: 0.003,
      });
    },

    footstep() {
      if (!ready()) return;
      const t = ctx.currentTime + 0.001;
      noiseBurst(sfxBus, t, {
        freq: rand(700, 1300),
        freqEnd: rand(300, 500),
        q: rand(0.7, 1.2),
        gain: rand(0.03, 0.065),
        dur: rand(0.05, 0.09),
        attack: 0.003,
        rate: rand(0.85, 1.25),
        pan: rand(-0.2, 0.2),
      });
    },

    whistle(kind) {
      if (!ready()) return;
      const blasts = kind === 'long' ? 3 : 1;
      const base = rand(2180, 2260);
      const vibRate = rand(24, 34);
      const pan = rand(-0.1, 0.1);

      let t = ctx.currentTime + 0.001;
      for (let i = 0; i < blasts; i++) {
        const blastDur = (kind === 'long' ? rand(0.3, 0.42) : rand(0.35, 0.5)) * 1;
        for (const off of [-9, 8]) {
          const osc = ctx.createOscillator();
          osc.type = 'square';
          osc.frequency.value = base + off;
          const vib = ctx.createOscillator();
          vib.type = 'sine';
          vib.frequency.value = vibRate;
          const vibG = ctx.createGain();
          vibG.gain.value = rand(18, 30);
          vib.connect(vibG);
          vibG.connect(osc.frequency);

          const bp = ctx.createBiquadFilter();
          bp.type = 'bandpass';
          bp.frequency.value = base;
          bp.Q.value = 4;

          const g = ctx.createGain();
          const peak = rand(0.1, 0.16);
          g.gain.setValueAtTime(0.0001, t);
          g.gain.exponentialRampToValueAtTime(peak, t + 0.015);
          g.gain.setValueAtTime(peak, t + blastDur - 0.03);
          g.gain.exponentialRampToValueAtTime(0.0001, t + blastDur);

          osc.connect(bp);
          bp.connect(g);
          chainTail(g, sfxBus, pan);
          osc.start(t);
          vib.start(t);
          osc.stop(t + blastDur + 0.05);
          vib.stop(t + blastDur + 0.05);
        }
        t += blastDur + (blasts > 1 ? rand(0.09, 0.16) : 0);
      }
    },

    crowd: {
      setExcitement(level) {
        excitement = clamp01(level);
        if (ready()) applyExcitement(ctx.currentTime);
      },

      cheer(strength) {
        if (!ready()) return;
        const s = clamp01(strength);
        const t = ctx.currentTime + 0.001;
        const dur = rand(0.8, 1.7) + s * 0.8;
        const pan = rand(-0.3, 0.3);

        // Rising filtered-noise swell.
        noiseBurst(crowdBus, t, {
          freq: rand(600, 900),
          freqEnd: rand(1100, 1600),
          q: 0.6,
          gain: 0.25 + s * 0.6,
          dur,
          attack: rand(0.08, 0.25),
          rate: rand(0.8, 1.2),
          pan,
        });
        // Whistle-ish partials inside the cheer.
        const partials = 2 + Math.floor(rand(0, 2) + s * 2);
        for (let i = 0; i < partials; i++) {
          tone(crowdBus, t + rand(0, dur * 0.4), {
            wave: 'sine',
            freq: rand(1400, 2600),
            freqEnd: rand(1600, 2800),
            gain: rand(0.02, 0.05) * (0.4 + s),
            dur: rand(0.2, 0.6),
            attack: 0.05,
            pan: rand(-0.6, 0.6),
          });
        }
      },

      gasp() {
        if (!ready()) return;
        const t = ctx.currentTime + 0.001;
        // Sharp inhale: fast attack, band sweeping down quickly.
        noiseBurst(crowdBus, t, {
          freq: rand(1400, 1900),
          freqEnd: rand(500, 750),
          q: rand(1.2, 2),
          gain: rand(0.3, 0.45),
          dur: rand(0.3, 0.45),
          attack: rand(0.015, 0.035),
          rate: rand(0.85, 1.15),
          pan: rand(-0.2, 0.2),
        });
      },

      ooh() {
        if (!ready()) return;
        const t = ctx.currentTime + 0.001;
        const dur = rand(0.9, 1.4);
        // Falling 'oooh': lowpassed sawtooth cluster gliding down.
        const startF = rand(210, 250);
        for (const det of [-14, 0, 13]) {
          const osc = ctx.createOscillator();
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(startF + rand(-6, 6), t);
          osc.frequency.exponentialRampToValueAtTime(rand(120, 150), t + dur * 0.85);
          osc.detune.value = det;

          const lp = ctx.createBiquadFilter();
          lp.type = 'lowpass';
          lp.frequency.setValueAtTime(rand(800, 1100), t);
          lp.frequency.exponentialRampToValueAtTime(350, t + dur);

          const g = ctx.createGain();
          const peak = rand(0.05, 0.09);
          g.gain.setValueAtTime(0.0001, t);
          g.gain.exponentialRampToValueAtTime(peak, t + rand(0.05, 0.12));
          g.gain.exponentialRampToValueAtTime(0.0001, t + dur);

          osc.connect(lp);
          lp.connect(g);
          chainTail(g, crowdBus, rand(-0.3, 0.3));
          osc.start(t);
          osc.stop(t + dur + 0.05);
        }
        // Crowd noise riding under the vowel.
        noiseBurst(crowdBus, t, {
          freq: rand(700, 1000),
          freqEnd: rand(400, 600),
          q: 0.8,
          gain: rand(0.15, 0.25),
          dur,
          attack: 0.06,
          rate: rand(0.85, 1.1),
        });
      },

      goal(isHome) {
        if (!ready()) return;
        const t = ctx.currentTime + 0.001;
        const big = isHome ? 1.15 : 0.95; // home crowd roars a touch harder

        // Main roar swell with ~4s decay.
        noiseBurst(crowdBus, t, {
          freq: rand(500, 750),
          freqEnd: rand(900, 1300),
          q: 0.5,
          gain: rand(0.7, 0.9) * big,
          dur: rand(3.6, 4.4),
          attack: rand(0.05, 0.15),
          rate: rand(0.75, 1.0),
          pan: rand(-0.15, 0.15),
        });

        // Air-horn-ish detuned partial stack.
        const hornBase = (isHome ? rand(220, 240) : rand(196, 216)) * 1;
        for (const mult of [1, 1.26, 1.5]) {
          for (const det of [-8, 7]) {
            tone(crowdBus, t + rand(0, 0.12), {
              wave: 'sawtooth',
              freq: hornBase * mult,
              detune: det,
              gain: rand(0.05, 0.09) * big,
              dur: rand(1.2, 2.0),
              attack: 0.03,
              pan: rand(-0.4, 0.4),
            });
          }
        }

        // Scattered whistle pops over the roar.
        const pops = 6 + Math.floor(rand(0, 5));
        for (let i = 0; i < pops; i++) {
          const pt = t + rand(0.15, 3.2);
          tone(crowdBus, pt, {
            wave: 'square',
            freq: rand(2100, 2500),
            gain: rand(0.015, 0.045),
            dur: rand(0.08, 0.22),
            attack: 0.01,
            pan: rand(-0.7, 0.7),
          });
        }
      },

      anticipation() {
        if (!ready()) return;
        const t = ctx.currentTime + 0.001;
        // Rising murmur swell: slow attack, then releases.
        noiseBurst(crowdBus, t, {
          freq: rand(380, 520),
          freqEnd: rand(700, 950),
          q: 0.7,
          gain: rand(0.22, 0.34),
          dur: rand(1.4, 2.0),
          attack: rand(0.5, 0.8),
          rate: rand(0.8, 1.05),
          pan: rand(-0.15, 0.15),
        });
      },
    },

    ui() {
      if (!ready()) return;
      const t = ctx.currentTime + 0.001;
      tone(sfxBus, t, {
        freq: rand(700, 900),
        freqEnd: rand(400, 550),
        gain: rand(0.06, 0.1),
        dur: 0.05,
        attack: 0.002,
      });
      noiseBurst(sfxBus, t, {
        freq: rand(2400, 3200),
        q: 2,
        gain: rand(0.02, 0.045),
        dur: 0.03,
        attack: 0.001,
      });
    },
  };
}
