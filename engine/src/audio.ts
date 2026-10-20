// Game audio on starhermit:audio's Web Audio graph. Two layers: the
// authored clips (sfx/*.opus,
// bound by event id through sfx/manifest.json and decoded by the engine
// into graph buffers) and a synthesiser that plays whenever an event has no
// decoded clip. The crowd bed, the stadium "reverb" (two feedback delays)
// and the excitement level are always synthesised. UI clicks play on the
// player's interface bus; volumes and the concurrent-sound limit are the
// runtime's own Options. The game's mute is its `muted` setting.
//
// The host graph is bounded (nodes, connections, render cost), so every
// short-lived chain releases its nodes when its source ends, and a sound
// that does not fit is dropped rather than failing the game.
import { lowOnFuel, nextFrame } from "./tasks.ts";
import { context } from "starhermit:audio";
import type { AudioBuffer, AudioBusNode, AudioNode, BiquadFilterNode, GainNode, OscillatorNode } from "starhermit:audio";
import { settings } from "starhermit:storage";
import { files } from "starhermit:engine";
import { clamp01, rand } from "./logic/math.ts";

/** The per-player game setting (device + account). */
const MUTE_KEY = "muted";

export interface Audio {
  resume(): void;
  setMuted(muted: boolean): void;
  isMuted(): boolean;
  kick(power: number): void;
  bounce(power: number): void;
  tackle(): void;
  injury(): void;
  footstep(): void;
  whistle(kind: "short" | "long"): void;
  /** The goalkeeper's dive (its own clip; the tackle sound stands in). */
  dive(): void;
  /** The coin flip at the centre circle. */
  coin(): void;
  ui(): void;
  crowd: {
    setExcitement(level: number): void;
    matchStart(): void;
    cheer(strength: number): void;
    gasp(): void;
    ooh(): void;
    boo(strength?: number): void;
    goal(isHome: boolean): void;
    anticipation(): void;
  };
}

interface NoiseOpts {
  freq: number;
  freqEnd?: number;
  q?: number;
  type?: "bandpass" | "lowpass" | "highpass";
  gain: number;
  dur: number;
  attack?: number;
  rate?: number;
  pan?: number;
}

interface ToneOpts {
  wave?: "sine" | "square" | "sawtooth" | "triangle";
  freq: number;
  freqEnd?: number;
  glide?: number;
  detune?: number;
  gain: number;
  dur: number;
  attack?: number;
  pan?: number;
}

function readMuted(): boolean {
  try {
    return settings.get(MUTE_KEY) === true;
  } catch {
    return false; // settings unavailable — ignore
  }
}

/** Frees every node of a finished chain at once (AudioNode.release). */
function release(nodes: readonly AudioNode[]): void {
  for (const n of nodes) {
    try {
      n.release();
    } catch {
      // already freed
    }
  }
}

interface ClipOpts {
  rate?: number;
  gain?: number;
  pan?: number;
}

export function createAudio(): Audio {
  const ctx = context;
  let built = false;
  let master: GainNode | null = null; // master gain -> effects bus
  let sfxBus: GainNode | null = null; // dry bus for ball/player sounds
  let uiBus: GainNode | null = null; // menu clicks -> interface bus
  let crowdBus: GainNode | null = null; // crowd sounds, feeds master + reverb send
  let crowdBedGain: GainNode | null = null; // excitement-controlled bed level
  let bedTarget = NaN; // the level last scheduled on it
  let noiseBuffer: AudioBuffer | null = null;
  let excitement = 0.35;
  let muted = readMuted();
  const clips = new Map<string, AudioBuffer>(); // event id -> decoded clip

  const ready = (): boolean => built;

  // White noise with a mild 1/f tilt so raw loops feel less harsh; two
  // seconds of stereo samples, made a block at a time across frames.
  async function buildNoiseBuffer(): Promise<AudioBuffer> {
    const len = Math.floor(ctx.sampleRate * 2);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    const data = new Float32Array(len);
    for (let ch = 0; ch < 2; ch++) {
      let last = 0;
      for (let i = 0; i < len; i++) {
        const white = Math.random() * 2 - 1;
        last = last * 0.94 + white * 0.06;
        data[i] = (white * 0.55 + last * 3.2) * 0.5;
        if ((i & 4095) === 4095 && lowOnFuel()) await nextFrame();
      }
      buf.copyToChannel(data, ch);
    }
    return buf;
  }

  // Reverb-ish stadium feel: two feedback delays in parallel.
  function buildReverb(out: GainNode): GainNode {
    const send = ctx.createGain();
    send.gain.value = 1;
    const wet = ctx.createGain();
    wet.gain.value = 0.35;
    wet.connect(out);
    const tap = (time: number, feedback: number, freq: number): void => {
      const delay = ctx.createDelay(0.5);
      delay.delayTime.value = time;
      const fb = ctx.createGain();
      fb.gain.value = feedback;
      const damp = ctx.createBiquadFilter();
      damp.type = "lowpass";
      damp.frequency.value = freq;
      send.connect(delay);
      delay.connect(damp);
      damp.connect(fb);
      fb.connect(delay);
      damp.connect(wet);
    };
    tap(0.11, 0.42, 2600);
    tap(0.19, 0.34, 1700);
    return send;
  }

  // Crowd bed: looped noise at several band-passes panned across the field,
  // with slow drifting LFOs on filter frequency and gain.
  function buildCrowdBed(bus: GainNode, noise: AudioBuffer): void {
    const bed = ctx.createGain();
    bed.gain.value = 0;
    bed.connect(bus);
    crowdBedGain = bed;
    bedTarget = NaN;
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
      src.buffer = noise;
      src.loop = true;
      src.playbackRate.value = rand(0.85, 1.15);
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = v.freq * rand(0.92, 1.08);
      bp.Q.value = v.q;
      const g = ctx.createGain();
      g.gain.value = v.gain;
      const p = ctx.createStereoPanner();
      p.pan.value = v.pan;
      src.connect(bp);
      bp.connect(g);
      g.connect(p);
      p.connect(bed);

      // Slow LFO on filter frequency.
      const lfoF = ctx.createOscillator();
      lfoF.type = "sine";
      lfoF.frequency.value = rand(0.04, 0.11);
      const lfoFG = ctx.createGain();
      lfoFG.gain.value = v.freq * rand(0.12, 0.3);
      lfoF.connect(lfoFG);
      lfoFG.connect(bp.frequency);
      lfoF.start();

      // Slow LFO on gain, a different rate, so the bed breathes.
      const lfoG = ctx.createOscillator();
      lfoG.type = "sine";
      lfoG.frequency.value = rand(0.03, 0.09);
      const lfoGG = ctx.createGain();
      lfoGG.gain.value = v.gain * rand(0.25, 0.45);
      lfoG.connect(lfoGG);
      lfoGG.connect(g.gain);
      lfoG.start();

      src.start();
    }
  }

  let building = false;
  function build(): void {
    if (built || building) return;
    building = true;
    try {
      const m = ctx.createGain();
      m.gain.value = muted ? 0 : 1;
      m.connect(ctx.destination);
      master = m;

      const sfx = ctx.createGain();
      sfx.gain.value = 0.9;
      sfx.connect(m);
      sfxBus = sfx;

      // The player's interface volume for menu clicks; muting still applies.
      const uiMaster = ctx.createGain();
      uiMaster.gain.value = muted ? 0 : 1;
      uiMaster.connect(ctx.bus("interface"));
      uiBus = uiMaster;

      const reverbSend = buildReverb(m);
      const crowd = ctx.createGain();
      crowd.gain.value = 0.8;
      crowd.connect(m);
      crowd.connect(reverbSend);
      crowdBus = crowd;

      // sounds play once the noise (a few frames of work) and the crowd bed exist
      void buildNoiseBuffer()
        .then((noise) => {
          noiseBuffer = noise;
          buildCrowdBed(crowd, noise);
          built = true;
          applyExcitement(ctx.currentTime);
          loadClips();
        })
        .catch((e: unknown) => console.warn("audio: the synthesis graph could not be built:", String(e)));
    } catch (e) {
      console.warn("audio: the synthesis graph could not be built:", String(e));
    }
  }

  function applyExcitement(t: number): void {
    if (!crowdBedGain) return;
    // Excitement 0..1 mapped to a usable bed level. The match sets it every
    // frame as the excitement eases; the curve is scheduled again only when
    // the level moves by 0.002 (a fraction of a decibel), not every frame.
    const target = Math.pow(clamp01(excitement), 1.4) * 0.5;
    if (Math.abs(target - bedTarget) < 0.002) return;
    bedTarget = target;
    crowdBedGain.gain.cancelScheduledValues(t);
    crowdBedGain.gain.setTargetAtTime(target, t, 0.4);
  }

  // Authored clips: decode everything the manifest lists. Any failure (no
  // manifest, a missing or undecodable file) leaves that event on the
  // synth path.
  function loadClips(): void {
    let list: unknown;
    try {
      list = files.readJson("sfx/manifest.json");
    } catch {
      return; // no manifest — fully synthesised
    }
    if (!Array.isArray(list)) return;
    for (const e of list) {
      const entry = e as { event?: unknown; name?: unknown } | null;
      if (!entry || typeof entry.event !== "string" || typeof entry.name !== "string") continue;
      const event = entry.event;
      try {
        ctx.loadBuffer(`sfx/${entry.name}.opus`)
          .then((buf) => {
            clips.set(event, buf);
          })
          .catch(() => {
            // synth fallback for this event
          });
      } catch {
        // past the host's 128 waiting decodes: synth fallback for this event
      }
    }
  }

  /** Plays an event's clip; false when none is bound, so the caller falls
   * through to its synthesiser. */
  function playClip(event: string, dest: GainNode, o: ClipOpts = {}): boolean {
    const buf = clips.get(event);
    if (!buf) return false;
    const t = ctx.currentTime + 0.001;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = o.rate || 1;
    const g = ctx.createGain();
    g.gain.value = o.gain == null ? 1 : o.gain;
    const made: AudioNode[] = [src, g];
    src.connect(g);
    chainTail(g, dest, o.pan || 0, made);
    src.onended = () => release(made);
    src.start(t);
    return true;
  }

  /** Runs a sound's graph setup; a full graph drops the sound. */
  function play(f: () => void): void {
    if (!ready()) return;
    try {
      f();
    } catch (e) {
      if (!(e instanceof RangeError)) console.warn("audio:", String(e));
    }
  }

  // ---------------------------------------------------------------------------
  // Synthesis helpers — short-lived nodes, released when their source ends.
  // ---------------------------------------------------------------------------

  /** node -> [panner] -> dest; returns the nodes made. */
  function chainTail(node: AudioNode, dest: AudioNode | AudioBusNode, pan: number, made: AudioNode[]): void {
    if (pan) {
      const p = ctx.createStereoPanner();
      p.pan.value = pan;
      node.connect(p);
      p.connect(dest);
      made.push(p);
    } else {
      node.connect(dest);
    }
  }

  // Enveloped noise burst through a filter.
  function noiseBurst(dest: GainNode, t: number, o: NoiseOpts): void {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer;
    src.playbackRate.value = o.rate || 1;
    const f = ctx.createBiquadFilter();
    f.type = o.type || "bandpass";
    f.frequency.setValueAtTime(o.freq, t);
    if (o.freqEnd) f.frequency.exponentialRampToValueAtTime(o.freqEnd, t + o.dur);
    f.Q.value = o.q || 1;
    const g = ctx.createGain();
    const a = o.attack || 0.004;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, o.gain), t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
    const made: AudioNode[] = [src, f, g];
    src.connect(f);
    f.connect(g);
    chainTail(g, dest, o.pan || 0, made);
    src.onended = () => release(made);
    src.start(t, rand(0, 1.5));
    src.stop(t + o.dur + 0.05);
  }

  // Enveloped oscillator tone with an optional pitch glide.
  function tone(dest: GainNode, t: number, o: ToneOpts): void {
    const osc = ctx.createOscillator();
    osc.type = o.wave || "sine";
    osc.frequency.setValueAtTime(o.freq, t);
    if (o.freqEnd) osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.freqEnd), t + (o.glide || o.dur));
    if (o.detune) osc.detune.value = o.detune;
    const g = ctx.createGain();
    const a = o.attack || 0.005;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, o.gain), t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
    const made: AudioNode[] = [osc, g];
    osc.connect(g);
    chainTail(g, dest, o.pan || 0, made);
    osc.onended = () => release(made);
    osc.start(t);
    osc.stop(t + o.dur + 0.05);
  }

  // A filtered oscillator voice (yelps, oohs, boos): osc -> filter -> gain.
  function voice(dest: GainNode, t: number, setup: (osc: OscillatorNode, filter: BiquadFilterNode, g: GainNode) => void, pan: number, stopAt: number): void {
    const osc = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const g = ctx.createGain();
    setup(osc, filter, g);
    const made: AudioNode[] = [osc, filter, g];
    osc.connect(filter);
    filter.connect(g);
    chainTail(g, dest, pan, made);
    osc.onended = () => release(made);
    osc.start(t);
    osc.stop(stopAt);
  }

  return {
    resume(): void {
      if (!built) build();
      void ctx.resume().catch(() => {});
    },

    setMuted(m: boolean): void {
      muted = !!m;
      try {
        settings.set(MUTE_KEY, muted);
      } catch {
        // settings unavailable — ignore
      }
      if (ready()) {
        const t = ctx.currentTime;
        for (const bus of [master, uiBus]) {
          if (!bus) continue;
          bus.gain.cancelScheduledValues(t);
          bus.gain.setTargetAtTime(muted ? 0 : 1, t, 0.03);
        }
      }
    },

    isMuted: () => muted,

    kick(power: number): void {
      play(() => {
        const p = clamp01(power);
        const t = ctx.currentTime + 0.001;
        const det = rand(0.92, 1.1); // per-call detune
        const pan = rand(-0.15, 0.15);
        if (playClip(p >= 0.5 ? "kick.shot" : "kick.pass", sfxBus!, { rate: det, gain: 0.55 + p * 0.55, pan })) return;
        // Band-passed noise slap.
        noiseBurst(sfxBus!, t, {
          freq: (900 + p * 900) * det, q: 1.2, gain: 0.22 + p * 0.5,
          dur: 0.06 + p * 0.04, attack: 0.002, rate: rand(0.9, 1.15), pan,
        });
        // Low sine thud, pitch drops as it decays.
        tone(sfxBus!, t, {
          freq: (120 + p * 90) * det, freqEnd: 45, glide: 0.09,
          gain: 0.35 + p * 0.55, dur: 0.12 + p * 0.1, attack: 0.002, pan,
        });
      });
    },

    bounce(power: number): void {
      play(() => {
        const p = clamp01(power);
        const t = ctx.currentTime + 0.001;
        const det = rand(0.9, 1.12);
        if (playClip("bounce", sfxBus!, { rate: det, gain: 0.25 + p * 0.6, pan: rand(-0.2, 0.2) })) return;
        noiseBurst(sfxBus!, t, {
          freq: 500 * det + p * 300, q: 1.6, gain: 0.08 + p * 0.22,
          dur: 0.05 + p * 0.04, attack: 0.002, rate: rand(0.85, 1.1), pan: rand(-0.2, 0.2),
        });
        tone(sfxBus!, t, {
          freq: (85 + p * 40) * det, freqEnd: 40, gain: 0.12 + p * 0.25,
          dur: 0.08 + p * 0.06, attack: 0.002,
        });
      });
    },

    tackle(): void {
      play(() => {
        if (playClip("tackle", sfxBus!, { rate: rand(0.9, 1.1), gain: 0.85, pan: rand(-0.25, 0.25) })) return;
        const t = ctx.currentTime + 0.001;
        // Body/grass scuff: band-swept noise swish.
        noiseBurst(sfxBus!, t, {
          freq: rand(1400, 2200), freqEnd: rand(250, 450), q: rand(0.8, 1.4),
          gain: rand(0.2, 0.32), dur: rand(0.22, 0.34), attack: 0.01,
          rate: rand(0.8, 1.2), pan: rand(-0.25, 0.25),
        });
        // Soft impact under the scuff.
        tone(sfxBus!, t, { freq: rand(95, 130), freqEnd: 50, gain: rand(0.12, 0.2), dur: 0.12, attack: 0.003 });
      });
    },

    injury(): void {
      play(() => {
        const t = ctx.currentTime + 0.001;
        const pan = rand(-0.2, 0.2);
        if (playClip("injury", sfxBus!, { rate: rand(0.95, 1.05), gain: 0.8, pan })) return;
        // Human-ish yelp: band-passed sawtooth, pitch drops as the cry dies.
        for (const det of [-7, 5]) {
          voice(sfxBus!, t, (osc, bp, g) => {
            osc.type = "sawtooth";
            osc.frequency.setValueAtTime(rand(520, 640), t);
            osc.frequency.exponentialRampToValueAtTime(rand(240, 300), t + 0.28);
            osc.detune.value = det;
            bp.type = "bandpass";
            bp.frequency.setValueAtTime(rand(900, 1200), t);
            bp.frequency.exponentialRampToValueAtTime(450, t + 0.3);
            bp.Q.value = 1.6;
            g.gain.setValueAtTime(0.0001, t);
            g.gain.exponentialRampToValueAtTime(rand(0.06, 0.1), t + 0.02);
            g.gain.exponentialRampToValueAtTime(0.0001, t + 0.32);
          }, pan, t + 0.4);
        }
        // Soft thud as the player hits the turf.
        tone(sfxBus!, t + 0.05, { freq: rand(90, 110), freqEnd: 42, gain: rand(0.14, 0.2), dur: 0.14, attack: 0.003, pan });
        noiseBurst(sfxBus!, t + 0.05, {
          freq: rand(500, 800), freqEnd: 220, q: 1, gain: rand(0.06, 0.1),
          dur: 0.12, attack: 0.004, rate: rand(0.85, 1.1), pan,
        });
      });
    },

    footstep(): void {
      play(() => {
        const t = ctx.currentTime + 0.001;
        if (playClip("footstep", sfxBus!, { rate: rand(0.85, 1.2), gain: rand(0.18, 0.3), pan: rand(-0.2, 0.2) })) return;
        noiseBurst(sfxBus!, t, {
          freq: rand(700, 1300), freqEnd: rand(300, 500), q: rand(0.7, 1.2),
          gain: rand(0.03, 0.065), dur: rand(0.05, 0.09), attack: 0.003,
          rate: rand(0.85, 1.25), pan: rand(-0.2, 0.2),
        });
      });
    },

    whistle(kind: "short" | "long"): void {
      play(() => {
        if (playClip(kind === "long" ? "whistle.long" : "whistle.short", sfxBus!, { rate: rand(0.97, 1.03), gain: 0.7, pan: rand(-0.1, 0.1) })) return;
        const blasts = kind === "long" ? 3 : 1;
        const base = rand(2180, 2260);
        const vibRate = rand(24, 34);
        const pan = rand(-0.1, 0.1);
        let t = ctx.currentTime + 0.001;
        for (let i = 0; i < blasts; i++) {
          const blastDur = kind === "long" ? rand(0.3, 0.42) : rand(0.35, 0.5);
          for (const off of [-9, 8]) {
            const osc = ctx.createOscillator();
            osc.type = "square";
            osc.frequency.value = base + off;
            const vib = ctx.createOscillator();
            vib.type = "sine";
            vib.frequency.value = vibRate;
            const vibG = ctx.createGain();
            vibG.gain.value = rand(18, 30);
            vib.connect(vibG);
            vibG.connect(osc.frequency);
            const bp = ctx.createBiquadFilter();
            bp.type = "bandpass";
            bp.frequency.value = base;
            bp.Q.value = 4;
            const g = ctx.createGain();
            const peak = rand(0.1, 0.16);
            g.gain.setValueAtTime(0.0001, t);
            g.gain.exponentialRampToValueAtTime(peak, t + 0.015);
            g.gain.setValueAtTime(peak, t + blastDur - 0.03);
            g.gain.exponentialRampToValueAtTime(0.0001, t + blastDur);
            const made: AudioNode[] = [osc, vib, vibG, bp, g];
            osc.connect(bp);
            bp.connect(g);
            chainTail(g, sfxBus!, pan, made);
            osc.onended = () => release(made);
            osc.start(t);
            vib.start(t);
            osc.stop(t + blastDur + 0.05);
            vib.stop(t + blastDur + 0.05);
          }
          t += blastDur + (blasts > 1 ? rand(0.09, 0.16) : 0);
        }
      });
    },

    dive(): void {
      play(() => {
        if (playClip("dive", sfxBus!, { rate: rand(0.94, 1.06), gain: 0.9, pan: rand(-0.2, 0.2) })) return;
        this.tackle();
      });
    },

    // Coin flip at the centre circle: the authored clip, else a bright
    // metallic ping with a short shimmer.
    coin(): void {
      play(() => {
        if (playClip("coin", sfxBus!, { rate: rand(0.97, 1.03), gain: 0.6 })) return;
        const t = ctx.currentTime + 0.001;
        for (const f of [3120, 4680, 6240]) tone(sfxBus!, t, { freq: f * rand(0.99, 1.01), gain: 0.05, dur: rand(0.5, 0.8), attack: 0.002 });
        for (let i = 0; i < 5; i++) tone(sfxBus!, t + 0.35 + i * 0.09, { freq: 2600 + i * 180, gain: 0.02, dur: 0.05, attack: 0.002 });
      });
    },

    ui(): void {
      if (!ready()) return;
      try {
        if (playClip("ui", uiBus!, { gain: 0.5, rate: rand(0.96, 1.04) })) return;
        const t = ctx.currentTime + 0.001;
        tone(uiBus!, t, { freq: rand(700, 900), freqEnd: rand(400, 550), gain: rand(0.06, 0.1), dur: 0.05, attack: 0.002 });
        noiseBurst(uiBus!, t, { freq: rand(2400, 3200), q: 2, gain: rand(0.02, 0.045), dur: 0.03, attack: 0.001 });
      } catch {
        // a full graph drops the click
      }
    },

    crowd: {
      setExcitement(level: number): void {
        excitement = clamp01(level);
        if (ready()) applyExcitement(ctx.currentTime);
      },

      // A full-stadium roar for the instant matchmaking flips a lobby into a
      // match: broader, louder and longer than a normal cheer.
      matchStart(): void {
        play(() => {
          if (playClip("crowd.matchStart", crowdBus!, { gain: 1.1, rate: rand(0.96, 1.02) })) return;
          const t = ctx.currentTime + 0.001;
          noiseBurst(crowdBus!, t, {
            freq: rand(420, 620), freqEnd: rand(1050, 1450), q: 0.45,
            gain: rand(0.9, 1.08), dur: rand(3.2, 3.8), attack: 0.06,
            rate: rand(0.78, 0.96), pan: rand(-0.1, 0.1),
          });
          noiseBurst(crowdBus!, t + 0.08, {
            freq: rand(850, 1100), freqEnd: rand(1500, 2000), q: 0.7,
            gain: rand(0.42, 0.58), dur: rand(2.4, 3.1), attack: 0.12,
            rate: rand(0.9, 1.12), pan: rand(-0.25, 0.25),
          });
          for (let i = 0; i < 9; i++) {
            tone(crowdBus!, t + rand(0.05, 1.6), {
              wave: i % 3 === 0 ? "square" : "sine",
              freq: rand(1250, 2600), freqEnd: rand(1500, 2850),
              gain: rand(0.018, 0.045), dur: rand(0.25, 0.75), attack: 0.035,
              pan: rand(-0.75, 0.75),
            });
          }
        });
      },

      cheer(strength: number): void {
        play(() => {
          const s = clamp01(strength);
          const t = ctx.currentTime + 0.001;
          if (playClip("crowd.cheer", crowdBus!, { gain: 0.35 + s * 0.65, rate: rand(0.92, 1.08), pan: rand(-0.3, 0.3) })) return;
          const dur = rand(0.8, 1.7) + s * 0.8;
          const pan = rand(-0.3, 0.3);
          // Rising filtered-noise swell.
          noiseBurst(crowdBus!, t, {
            freq: rand(600, 900), freqEnd: rand(1100, 1600), q: 0.6,
            gain: 0.25 + s * 0.6, dur, attack: rand(0.08, 0.25), rate: rand(0.8, 1.2), pan,
          });
          // Whistle-ish partials inside the cheer.
          const partials = 2 + Math.floor(rand(0, 2) + s * 2);
          for (let i = 0; i < partials; i++) {
            tone(crowdBus!, t + rand(0, dur * 0.4), {
              wave: "sine", freq: rand(1400, 2600), freqEnd: rand(1600, 2800),
              gain: rand(0.02, 0.05) * (0.4 + s), dur: rand(0.2, 0.6), attack: 0.05,
              pan: rand(-0.6, 0.6),
            });
          }
        });
      },

      gasp(): void {
        play(() => {
          if (playClip("crowd.gasp", crowdBus!, { gain: 0.8, rate: rand(0.94, 1.08), pan: rand(-0.2, 0.2) })) return;
          const t = ctx.currentTime + 0.001;
          // Sharp inhale: fast attack, band sweeping down quickly.
          noiseBurst(crowdBus!, t, {
            freq: rand(1400, 1900), freqEnd: rand(500, 750), q: rand(1.2, 2),
            gain: rand(0.3, 0.45), dur: rand(0.3, 0.45), attack: rand(0.015, 0.035),
            rate: rand(0.85, 1.15), pan: rand(-0.2, 0.2),
          });
        });
      },

      ooh(): void {
        play(() => {
          if (playClip("crowd.ooh", crowdBus!, { gain: 0.8, rate: rand(0.94, 1.06), pan: rand(-0.3, 0.3) })) return;
          const t = ctx.currentTime + 0.001;
          const dur = rand(0.9, 1.4);
          // Falling 'oooh': lowpassed sawtooth cluster gliding down.
          const startF = rand(210, 250);
          for (const det of [-14, 0, 13]) {
            voice(crowdBus!, t, (osc, lp, g) => {
              osc.type = "sawtooth";
              osc.frequency.setValueAtTime(startF + rand(-6, 6), t);
              osc.frequency.exponentialRampToValueAtTime(rand(120, 150), t + dur * 0.85);
              osc.detune.value = det;
              lp.type = "lowpass";
              lp.frequency.setValueAtTime(rand(800, 1100), t);
              lp.frequency.exponentialRampToValueAtTime(350, t + dur);
              const peak = rand(0.05, 0.09);
              g.gain.setValueAtTime(0.0001, t);
              g.gain.exponentialRampToValueAtTime(peak, t + rand(0.05, 0.12));
              g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
            }, rand(-0.3, 0.3), t + dur + 0.05);
          }
          // Crowd noise riding under the vowel.
          noiseBurst(crowdBus!, t, {
            freq: rand(700, 1000), freqEnd: rand(400, 600), q: 0.8,
            gain: rand(0.15, 0.25), dur, attack: 0.06, rate: rand(0.85, 1.1),
          });
        });
      },

      boo(strength?: number): void {
        play(() => {
          const s = clamp01(strength == null ? 1 : strength);
          const t = ctx.currentTime + 0.001;
          if (playClip("crowd.boo", crowdBus!, { gain: 0.4 + s * 0.5, rate: rand(0.94, 1.04), pan: rand(-0.3, 0.3) })) return;
          const dur = rand(1.8, 2.3);
          // Descending 'booo': darker and quieter than the ooh.
          const startF = rand(150, 180);
          for (const det of [-16, -5, 6, 15]) {
            voice(crowdBus!, t, (osc, lp, g) => {
              osc.type = "sawtooth";
              osc.frequency.setValueAtTime(startF + rand(-5, 5), t);
              osc.frequency.exponentialRampToValueAtTime(rand(85, 105), t + dur * 0.9);
              osc.detune.value = det;
              lp.type = "lowpass";
              lp.frequency.setValueAtTime(rand(500, 700), t);
              lp.frequency.exponentialRampToValueAtTime(240, t + dur);
              const peak = rand(0.04, 0.07) * (0.5 + s * 0.5);
              g.gain.setValueAtTime(0.0001, t);
              g.gain.exponentialRampToValueAtTime(peak, t + rand(0.12, 0.25));
              g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
            }, rand(-0.35, 0.35), t + dur + 0.05);
          }
          // Low rumbling discontent under the vowel.
          noiseBurst(crowdBus!, t, {
            freq: rand(350, 500), freqEnd: rand(220, 320), q: 0.8,
            gain: rand(0.12, 0.2) * (0.5 + s * 0.5), dur, attack: 0.15, rate: rand(0.7, 0.9),
          });
        });
      },

      goal(isHome: boolean): void {
        play(() => {
          const t = ctx.currentTime + 0.001;
          const big = isHome ? 1.15 : 0.95; // home crowd roars a touch harder
          if (playClip("crowd.goal", crowdBus!, { gain: big, rate: rand(0.95, 1.03), pan: rand(-0.15, 0.15) })) return;
          // Main roar swell with ~4 s decay.
          noiseBurst(crowdBus!, t, {
            freq: rand(500, 750), freqEnd: rand(900, 1300), q: 0.5,
            gain: rand(0.7, 0.9) * big, dur: rand(3.6, 4.4), attack: rand(0.05, 0.15),
            rate: rand(0.75, 1.0), pan: rand(-0.15, 0.15),
          });
          // Air-horn-ish detuned partial stack.
          const hornBase = isHome ? rand(220, 240) : rand(196, 216);
          for (const mult of [1, 1.26, 1.5]) {
            for (const det of [-8, 7]) {
              tone(crowdBus!, t + rand(0, 0.12), {
                wave: "sawtooth", freq: hornBase * mult, detune: det,
                gain: rand(0.05, 0.09) * big, dur: rand(1.2, 2.0), attack: 0.03, pan: rand(-0.4, 0.4),
              });
            }
          }
          // Scattered whistle pops over the roar.
          const pops = 6 + Math.floor(rand(0, 5));
          for (let i = 0; i < pops; i++) {
            tone(crowdBus!, t + rand(0.15, 3.2), {
              wave: "square", freq: rand(2100, 2500), gain: rand(0.015, 0.045),
              dur: rand(0.08, 0.22), attack: 0.01, pan: rand(-0.7, 0.7),
            });
          }
        });
      },

      anticipation(): void {
        play(() => {
          if (playClip("crowd.anticipation", crowdBus!, { gain: 0.7, rate: rand(0.94, 1.06) })) return;
          const t = ctx.currentTime + 0.001;
          // Rising murmur swell: slow attack, then releases.
          noiseBurst(crowdBus!, t, {
            freq: rand(380, 520), freqEnd: rand(700, 950), q: 0.7,
            gain: rand(0.22, 0.34), dur: rand(1.4, 2.0), attack: rand(0.5, 0.8),
            rate: rand(0.8, 1.05), pan: rand(-0.15, 0.15),
          });
        });
      },
    },
  };
}
