/**
 * Procedural sound effects on the Web Audio API. No audio files: every cue is
 * synthesised, so the game stays a single small bundle and works offline.
 *
 * Mobile Safari only allows audio after a user gesture, so `unlock()` is
 * called from the first pointer event.
 */
export type Cue =
  | 'tap'
  | 'select'
  | 'inspect'
  | 'place'
  | 'remove'
  | 'error'
  | 'arm'
  | 'tick'
  | 'tickFinal'
  | 'detonate'
  | 'crumble'
  | 'impact'
  | 'topple'
  | 'settle'
  | 'reveal'
  | 'countTick'
  | 'bonus'
  | 'total'
  | 'fail'
  | 'unlock'
  | 'purchase'
  | 'lock'
  | 'armClick'
  | 'fuse'
  | 'warning'
  | 'heartbeat'
  | 'crack'
  | 'failMajor'
  | 'rumble'
  | 'heavyLanding'
  | 'settled'
  | 'cash'
  | 'newBest'
  | 'swing'
  | 'glass'
  | 'creak'
  | 'bite'
  | 'push'
  | 'engine'
  | 'thwack'
  | 'ping'
  | 'rustle'
  | 'seam'
  | 'thump'
  | 'snap'
  | 'meter'
  | 'earned'
  | 'special'
  | 'houseDown'
  | 'wind';

/** Flavour for cues that vary: a charge type or a material. */
export type Variant = 'small' | 'heavy' | 'directional' | 'shaped' | 'wood' | 'brick' | 'concrete' | 'steel';

/** Minimum seconds between two plays of the same cue. Anything not listed uses 0.02. */
const MIN_GAP: Partial<Record<Cue, number>> = {
  impact: 0.08,
  crumble: 0.09,
  push: 0.3,
  engine: 0.18,
  crack: 0.06,
  glass: 0.08,
  ping: 0.035,
  thump: 0.045,
  rustle: 0.25,
  failMajor: 0.22,
  heavyLanding: 0.2,
  rumble: 0.3,
  detonate: 0.08,
  creak: 0.6,
  snap: 0.12,
  meter: 0.07,
  swing: 0.1,
  thwack: 0.05,
  wind: 4,
};

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
/** Envelope peak: never zero (exponential ramps need a positive target) and never hot. */
const lvl = (v: number): number => clamp(v, 0.0002, 0.6);
/** A multiplier near 1, so repeats of a cue never sound identical. */
const jit = (amount = 0.06): number => 1 + (Math.random() * 2 - 1) * amount;

export class AudioEngine {
  enabled = true;
  private ctx?: AudioContext;
  private master?: GainNode;
  /** Soft-saturating bus for the low end: adds harmonics small speakers can reproduce. */
  private sat?: WaveShaperNode;
  private noiseBuffer?: AudioBuffer;
  private lastCue = new Map<Cue, number>();

  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    try {
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.95;
      // A compressor lets the booms hit hard without clipping when a collapse stacks sounds up.
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -16;
      comp.knee.value = 12;
      comp.ratio.value = 5;
      comp.attack.value = 0.004;
      comp.release.value = 0.22;
      this.master.connect(comp);
      comp.connect(this.ctx.destination);
      // Unity at about 0.6 in, gentle lift below that, soft ceiling above.
      const shaper = this.ctx.createWaveShaper();
      const curve = new Float32Array(1024);
      for (let i = 0; i < curve.length; i++) {
        const x = (i / (curve.length - 1)) * 2 - 1;
        curve[i] = Math.tanh(2 * x) / Math.tanh(2);
      }
      shaper.curve = curve;
      const satOut = this.ctx.createGain();
      satOut.gain.value = 0.7;
      shaper.connect(satOut);
      satOut.connect(this.master);
      this.sat = shaper;
      const seconds = 2;
      const buffer = this.ctx.createBuffer(1, this.ctx.sampleRate * seconds, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      this.noiseBuffer = buffer;
      if (this.ctx.state === 'suspended') void this.ctx.resume();
    } catch {
      this.ctx = undefined;
    }
  }

  private get ready(): boolean {
    return this.enabled && !!this.ctx && !!this.master && this.ctx.state === 'running';
  }

  play(cue: Cue, strength = 1, variant?: Variant): void {
    if (!this.ready) return;
    const ctx = this.ctx as AudioContext;
    const now = ctx.currentTime;
    // Rate-limit noisy cues so a big collapse does not clip.
    const last = this.lastCue.get(cue) ?? -1;
    const minGap = MIN_GAP[cue] ?? 0.02;
    if (now - last < minGap) return;
    this.lastCue.set(cue, now);
    const s = clamp(strength, 0, 1.25);
    switch (cue) {
      case 'tap':
        this.blip(880, 0.04, 0.12);
        break;
      case 'select':
        this.blip(660, 0.06, 0.16);
        this.blip(990, 0.06, 0.12, 0.05);
        break;
      case 'inspect':
        this.blip(520, 0.08, 0.14);
        break;
      case 'place':
        // Heavy body landing on the member, then the strap cinching.
        this.thud(variant === 'heavy' ? 95 : 140, 0.16, variant === 'heavy' ? 0.6 : 0.45);
        this.noise(0.05, 0.25, 2600, 'bandpass', 0.02);
        break;
      case 'lock':
        this.noise(0.03, 0.35, 5200, 'highpass');
        this.blip(1760, 0.04, 0.09, 0.01, 'square');
        this.blip(2350, 0.05, 0.06, 0.05, 'triangle');
        break;
      case 'remove':
        this.noise(0.04, 0.25, 3800, 'highpass');
        this.blip(620, 0.07, 0.12, 0.01, 'triangle');
        this.blip(380, 0.09, 0.1, 0.06, 'triangle');
        break;
      case 'error':
        this.blip(220, 0.12, 0.18, 0, 'square');
        this.blip(180, 0.16, 0.14, 0.1, 'square');
        break;
      case 'arm':
        this.blip(440, 0.12, 0.2);
        this.blip(660, 0.12, 0.2, 0.12);
        this.blip(880, 0.3, 0.22, 0.24);
        break;
      case 'armClick':
        // Each charge going live: relay clack plus a rising confirmation beep.
        this.noise(0.025, 0.4, 4000, 'highpass');
        this.blip(700 + strength * 500, 0.08, 0.14, 0.02, 'square');
        break;
      case 'fuse':
        this.noise(0.9, 0.08, 3200, 'bandpass');
        break;
      case 'warning':
        this.blip(880, 0.22, 0.14, 0, 'sawtooth');
        this.blip(660, 0.22, 0.14, 0.24, 'sawtooth');
        break;
      case 'heartbeat':
        this.thud(55, 0.16, 0.35 + strength * 0.35);
        this.thud(50, 0.14, 0.25 + strength * 0.3, 0.16);
        break;
      case 'tick':
        // Strength 0..1 is countdown tension: pitch climbs toward zero.
        this.blip(900 + strength * 500, 0.07, 0.2 + strength * 0.08, 0, 'square');
        break;
      case 'tickFinal':
        this.blip(1500, 0.14, 0.3, 0, 'square');
        this.blip(2000, 0.12, 0.2, 0.05, 'square');
        break;
      case 'detonate':
        this.boom(strength, variant);
        break;
      case 'crumble':
        this.crumble(variant, s);
        break;
      case 'crack':
        this.crack(variant, s);
        break;
      case 'failMajor':
        // A member letting go: its own crack, then the load dropping through.
        this.crack(variant, 0.6 + s * 0.4);
        this.sub(44, 0.8 + s * 0.4, 0.35 + s * 0.25);
        this.bed(1 + s * 0.8, 0.18 + s * 0.18, 700, 180, 0.04);
        break;
      case 'rumble':
        // Sub body, a second lump a beat later, a darkening noise bed and loose rubble on top.
        this.sub(34, 1.3 + s * 0.5, 0.3 + s * 0.28);
        this.sub(58 * jit(0.1), 0.7 + s * 0.3, 0.14 + s * 0.14, 0.09);
        this.bed(1.8 + s * 1.2, 0.2 + s * 0.25, 500, 110);
        this.grains(1 + s * 0.8, 0.14 + s * 0.16, 'bandpass', 250, 900, 2, 0.1, 2.2);
        break;
      case 'heavyLanding':
        // Deep hit, an upper thump phones can reproduce, the slap of the face landing, then dust.
        this.sub(38, 1 + s * 0.5, 0.4 + s * 0.2);
        this.sub(80 * jit(0.08), 0.3, 0.2 + s * 0.12);
        this.hit(0.09, 0.3 + s * 0.2, 2200, 'lowpass');
        this.bed(1.6 + s * 0.9, 0.25 + s * 0.2, 600, 130, 0.03);
        break;
      case 'settled':
        // Dust hiss, stray pebbles, then quiet.
        this.noise(2.8, 0.1, 1800, 'bandpass');
        this.blip(2400, 0.03, 0.05, 0.35, 'triangle');
        this.blip(1900, 0.03, 0.04, 0.8, 'triangle');
        break;
      case 'impact':
        // Weight behind the hit, then the material answering.
        this.sub(62 + s * 26, 0.3 + s * 0.25, 0.32 + s * 0.28);
        this.knock(variant, s, 0.8 + s * 0.5);
        break;
      case 'topple':
        this.noise(1.2, 0.12, 400, 'lowpass');
        this.thud(50, 0.6, 0.35);
        break;
      case 'settle':
        // The last heavy piece finds the ground under a sheet of dust.
        this.thud(40, 0.9, 0.55);
        this.noise(2.5, 0.16, 500, 'lowpass');
        break;
      case 'reveal':
        this.blip(740, 0.08, 0.16);
        this.blip(1110, 0.1, 0.12, 0.06);
        break;
      case 'countTick':
        this.blip(1400 + strength * 900, 0.03, 0.08, 0, 'square');
        break;
      case 'bonus':
        this.blip(880, 0.1, 0.2);
        this.blip(1174, 0.12, 0.2, 0.08);
        this.blip(1568, 0.2, 0.22, 0.16);
        break;
      case 'total':
        this.chord([523, 659, 784, 1046], 0.9, 0.24);
        this.thud(80, 0.5, 0.6);
        break;
      case 'fail':
        this.blip(392, 0.25, 0.2, 0, 'sawtooth');
        this.blip(311, 0.35, 0.2, 0.22, 'sawtooth');
        this.blip(233, 0.5, 0.2, 0.44, 'sawtooth');
        break;
      case 'unlock':
        this.chord([659, 880, 1318], 0.6, 0.2);
        break;
      case 'purchase':
        this.blip(988, 0.08, 0.18);
        this.blip(1318, 0.16, 0.18, 0.09);
        break;
      case 'cash':
        this.noise(0.05, 0.3, 5000, 'highpass');
        this.blip(1568, 0.09, 0.18, 0.03, 'triangle');
        this.blip(2093, 0.3, 0.2, 0.1, 'triangle');
        break;
      case 'swing':
        // Club whoosh that peaks at the strike, then the air closing behind the ball.
        this.sweepNoise(0.2 + s * 0.08, 0.14 + s * 0.2, 500, 2400 + s * 1200, 0.4, 2.2);
        this.sweepNoise(0.8 + s * 0.4, 0.05 + s * 0.08, 400, 1400 + s * 800, 0.35, 1.2, 0.06);
        break;
      case 'glass':
        // The pane letting go, a few detuned pings, and shards tinkling down.
        this.grains(0.4 + s * 0.25, 0.2 + s * 0.2, 'highpass', 4500, 9000, 2.5, 0, 1, true);
        for (let i = 0; i < 3; i++) {
          this.tone(2600 + Math.random() * 4200, 0.07 + Math.random() * 0.16, 0.04 + s * 0.04, i * 0.012 + Math.random() * 0.03, i % 2 ? 'triangle' : 'sine');
        }
        break;
      case 'creak':
        this.groan(0.7 + s * 0.6, 0.15 + s * 0.24);
        break;
      case 'bite':
        // Crusher jaws: a hydraulic hiss, then the crunch.
        this.noise(0.12, 0.12, 2600, 'bandpass');
        this.thud(70, 0.25, 0.35 + strength * 0.35, 0.08);
        this.crack('concrete', 0.3 + strength * 0.5);
        break;
      case 'push':
        // Rubble grinding along in front of a blade.
        this.noise(0.35, 0.05 + strength * 0.12, 500 + strength * 300, 'lowpass');
        break;
      case 'engine':
        // A diesel pulling under load.
        this.thud(48 + strength * 14, 0.22, 0.06 + strength * 0.08);
        break;
      case 'thwack':
        // Club face on ball: a hard click, the ball compressing, a pitched tick and a short knock.
        {
          const p = jit(0.05);
          this.hit(0.022, 0.38 + s * 0.18, 4800, 'highpass');
          this.hit(0.06, 0.22 + s * 0.12, 1900 * p, 'bandpass', 0.001, 1.6);
          this.tone(2300 * p, 0.045, 0.14 + s * 0.08, 0, 'triangle', 1500 * p);
          this.tone(330 * p, 0.09, 0.2 + s * 0.14, 0, 'sine', 150);
          this.sweepNoise(0.32 + s * 0.2, 0.04 + s * 0.06, 1200, 3200 + s * 1400, 0.25);
        }
        break;
      case 'ping':
        // Superball off a hard surface: a bright rising ping.
        this.blip(1300 + strength * 900, 0.09, 0.07 + strength * 0.07, 0, 'sine');
        this.blip(2600 + strength * 700, 0.05, 0.03 + strength * 0.03, 0.01, 'triangle');
        break;
      case 'rustle':
        this.noise(0.45, 0.12 + strength * 0.12, 3000, 'bandpass');
        this.noise(0.3, 0.06, 6000, 'highpass', 0.08);
        break;
      case 'seam':
        // Mortar joint giving way: two sharp cracks a beat apart, then a chime.
        this.crack('brick', 0.9);
        this.noise(0.03, 0.5, 4200, 'highpass', 0.05);
        this.blip(1568, 0.16, 0.12, 0.08, 'triangle');
        this.blip(2093, 0.22, 0.1, 0.13, 'triangle');
        break;
      case 'thump':
        this.knock(variant, s, 0.45 + s * 0.6);
        break;
      case 'snap':
        // A support letting go: the break itself, then the load dropping onto it.
        if (variant === 'wood' || variant === undefined) this.timber(0.6 + s * 0.4);
        else this.crack(variant, 1);
        this.sub(64, 0.4, 0.3 + s * 0.25, 0.05);
        break;
      case 'meter':
        // The reward meter filling: a soft tick that climbs with the fill.
        this.blip(520 + strength * 700, 0.05, 0.07, 0, 'triangle');
        break;
      case 'earned':
        // A special ball earned: a quick rising run that lands on a bright bell.
        [659, 784, 988, 1318].forEach((f, i) => this.blip(f, 0.12, 0.13, i * 0.06, 'triangle'));
        this.blip(2637, 0.5, 0.06, 0.26, 'sine');
        this.blip(1976, 0.6, 0.05, 0.27, 'sine');
        break;
      case 'special':
        // A special ball leaving the tee: a deeper thwack with a rising whoosh.
        this.noise(0.03, 0.6, 4800, 'highpass');
        this.thud(120, 0.18, 0.5);
        this.sweepNoise(0.7, 0.16, 500, 3600);
        this.blip(880, 0.08, 0.07, 0.02, 'square');
        break;
      case 'houseDown':
        // A house finished: a long rumble under a brass-like fanfare.
        this.thud(36, 1.6, 0.9);
        this.noise(2.4, 0.4, 260, 'lowpass');
        this.chord([392, 523, 659], 0.5, 0.26);
        window.setTimeout(() => this.chord([523, 659, 784, 1046], 1.1, 0.3), 260);
        break;
      case 'wind':
        // A few seconds of gusting air; retrigger about every 5 s so the fades overlap.
        this.wind(s);
        break;
      case 'newBest':
        this.chord([523, 659, 784], 0.4, 0.22);
        window.setTimeout(() => this.chord([698, 880, 1046, 1396], 0.9, 0.26), 180);
        break;
    }
  }

  /** Material-specific structural failure: timber snaps, concrete cracks, steel groans, brick crumbles. */
  private crack(variant: Variant | undefined, strength: number): void {
    const v = 0.5 + clamp(strength, 0, 1.25) * 0.5;
    const p = jit(0.1);
    switch (variant) {
      case 'wood':
        this.timber(v);
        break;
      case 'steel':
        // A low strained groan with a thin inharmonic ring over it.
        this.resonant('sawtooth', 140 * p, 55, 0.6, 0.3 * v, 420, 3);
        this.tone(900 * p, 0.3, 0.05 * v, 0.02);
        this.tone(900 * p * 2.76, 0.2, 0.035 * v, 0.02);
        break;
      case 'brick':
        this.hit(0.025, 0.4 * v, 3200, 'highpass');
        this.grains(0.3, 0.3 * v, 'bandpass', 1000, 2800, 3, 0.01);
        break;
      default:
        // Dry concrete crack: a bright edge, a hard mid body and a short low knock.
        this.hit(0.02, 0.45 * v, 3800, 'highpass');
        this.hit(0.07, 0.35 * v, 1500 * p, 'bandpass', 0.002, 1.5);
        this.tone(180 * p, 0.09, 0.2 * v, 0, 'sine', 80);
    }
  }

  /** Timber breaking: a sharp broadband crack, then the fibres creaking as they part. */
  private timber(v: number): void {
    const p = jit(0.12);
    this.hit(0.03, 0.45 * v, 2400 * p, 'bandpass', 0, 0.8);
    this.resonant('sawtooth', 230 * p, 115 * p, 0.22, 0.5 * v, 700 * p, 5, 0.004);
  }

  /** Something landing on or striking a material. `g` is the overall level. */
  private knock(variant: Variant | undefined, s: number, g: number): void {
    const p = jit(0.08);
    switch (variant) {
      case 'wood':
        // Hollow knock: a low cavity note, a short overtone and a boxy tap.
        this.tone(210 * p, 0.11, 0.2 * g, 0, 'sine', 170 * p);
        this.tone(540 * p, 0.05, 0.1 * g, 0, 'triangle');
        this.hit(0.035, 0.22 * g, 1100 * p, 'bandpass', 0, 3);
        break;
      case 'brick':
        // Dry clack with almost no ring.
        this.hit(0.03, 0.3 * g, 2600 * p, 'bandpass', 0, 1.2);
        this.tone(680 * p, 0.035, 0.12 * g, 0, 'triangle', 420 * p);
        this.tone(130 * p, 0.07, 0.16 * g, 0, 'sine', 80);
        break;
      case 'steel': {
        // Ringing ping: free-bar partials, which are not harmonic.
        const f = (520 - s * 90) * p;
        this.tone(f, 0.45, 0.1 * g);
        this.tone(f * 2.76, 0.28, 0.07 * g);
        this.tone(f * 5.4, 0.14, 0.045 * g);
        this.hit(0.012, 0.25 * g, 5000, 'highpass');
        break;
      }
      case 'concrete':
        // Dull, dead thud.
        this.tone(95 * p, 0.14, 0.3 * g, 0, 'sine', 55);
        this.hit(0.07, 0.2 * g, 520 * p, 'lowpass');
        this.hit(0.012, 0.12 * g, 3000, 'highpass');
        break;
      default:
        this.tone(125 * p, 0.12, 0.26 * g, 0, 'sine', 65);
        this.hit(0.06 + s * 0.12, 0.18 * g, 1100 * p, 'lowpass');
        this.hit(0.014, 0.14 * g, 2600, 'highpass');
    }
  }

  /** Masonry breaking up: many small pitched clacks, finer grit above them and a dusty body. */
  private crumble(variant: Variant | undefined, s: number): void {
    if (variant === 'concrete') {
      this.grains(0.5 + s * 0.4, 0.36 + s * 0.24, 'bandpass', 380, 1500, 2.5);
      this.grains(0.35 + s * 0.3, 0.1 + s * 0.08, 'highpass', 3000, 5500, 0.8, 0.02);
      this.hit(0.35 + s * 0.3, 0.14 + s * 0.14, 450, 'lowpass');
    } else {
      this.grains(0.45 + s * 0.35, 0.36 + s * 0.24, 'bandpass', 900, 3200, 3.5);
      this.grains(0.35 + s * 0.3, 0.12 + s * 0.1, 'highpass', 3500, 6000, 0.8, 0.02);
      this.hit(0.3 + s * 0.3, 0.1 + s * 0.12, 700, 'lowpass');
    }
  }

  /** Gusting wind: two slowly wandering bands of noise, a broad body and a thin whistle. */
  private wind(s: number): void {
    const duration = 6.5 + Math.random() * 1.5;
    const volume = 0.12 + s * 0.14;
    this.gust(duration, volume, 260, 900, 0.9);
    this.gust(duration, volume * 0.22, 1100, 2200, 5);
  }

  private gust(duration: number, volume: number, fLo: number, fHi: number, q: number): void {
    const ctx = this.ctx as AudioContext;
    if (!this.noiseBuffer) return;
    const t0 = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;
    src.playbackRate.value = 0.6 + Math.random() * 0.3;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = q;
    const gain = ctx.createGain();
    const pick = (): number => fLo * Math.pow(fHi / fLo, Math.random());
    filter.frequency.setValueAtTime(pick(), t0);
    gain.gain.setValueAtTime(0.0001, t0);
    const steps = 5;
    for (let i = 1; i < steps; i++) {
      const t = t0 + (duration * (i + (Math.random() - 0.5) * 0.4)) / steps;
      filter.frequency.linearRampToValueAtTime(pick(), t);
      gain.gain.linearRampToValueAtTime(lvl(volume * (0.4 + Math.random() * 0.6)), t);
    }
    filter.frequency.linearRampToValueAtTime(pick(), t0 + duration);
    gain.gain.linearRampToValueAtTime(0.0001, t0 + duration);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.master as GainNode);
    src.start(t0, Math.random() * 1.5);
    src.stop(t0 + duration + 0.05);
    this.release(src, filter, gain);
  }

  /** Disconnect a finished voice so nothing lingers in the graph. */
  private release(src: AudioScheduledSourceNode, ...nodes: AudioNode[]): void {
    src.onended = () => {
      src.disconnect();
      for (const n of nodes) n.disconnect();
    };
  }

  /** A partial with an instant attack and exponential decay, optionally gliding in pitch. */
  private tone(freq: number, duration: number, volume: number, delay = 0, type: OscillatorType = 'sine', endFreq?: number): void {
    const ctx = this.ctx as AudioContext;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    const t0 = ctx.currentTime + delay;
    osc.frequency.setValueAtTime(freq, t0);
    if (endFreq) osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), t0 + duration);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.linearRampToValueAtTime(lvl(volume), t0 + 0.002);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    osc.connect(gain);
    gain.connect(this.master as GainNode);
    osc.start(t0);
    osc.stop(t0 + duration + 0.02);
    this.release(osc, gain);
  }

  /** A noise transient: instant attack, exponential decay, from a random spot in the buffer. */
  private hit(duration: number, volume: number, cutoff: number, type: BiquadFilterType, delay = 0, q = 0.7): void {
    const ctx = this.ctx as AudioContext;
    if (!this.noiseBuffer) return;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = cutoff;
    filter.Q.value = q;
    const gain = ctx.createGain();
    const t0 = ctx.currentTime + delay;
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.linearRampToValueAtTime(lvl(volume), t0 + 0.0015);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.master as GainNode);
    src.start(t0, Math.random() * 1.5);
    src.stop(t0 + duration + 0.03);
    this.release(src, filter, gain);
  }

  /**
   * One noise voice chopped into many short grains, each at its own filter pitch and level,
   * thinning out toward the end. Many clacks for the cost of three nodes.
   */
  private grains(duration: number, volume: number, type: BiquadFilterType, fLo: number, fHi: number, q: number, delay = 0, spacing = 1, lead = false): void {
    const ctx = this.ctx as AudioContext;
    if (!this.noiseBuffer) return;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.Q.value = q;
    const gain = ctx.createGain();
    const t0 = ctx.currentTime + delay;
    const end = t0 + duration;
    let t = t0;
    for (let n = 0; n < 26 && t < end; n++) {
      const k = (t - t0) / duration;
      const first = lead && n === 0;
      const len = 0.008 + Math.random() * 0.03 + (first ? 0.03 : 0);
      const peak = lvl(volume * (first ? 1 : (0.3 + Math.random() * 0.7) * (1 - 0.75 * k)));
      filter.frequency.setValueAtTime(fLo * Math.pow(fHi / fLo, Math.random()), t);
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.linearRampToValueAtTime(peak, t + 0.002);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + len);
      t += len + (0.004 + Math.random() * 0.035 * (1 + 3 * k)) * spacing;
    }
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.master as GainNode);
    src.start(t0, Math.random() * 1.5);
    src.stop(t + 0.05);
    this.release(src, filter, gain);
  }

  /** Sub-bass body with a fast downward pitch drop, sent through the saturator for weight. */
  private sub(freq: number, duration: number, volume: number, delay = 0): void {
    const ctx = this.ctx as AudioContext;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    const t0 = ctx.currentTime + delay;
    osc.frequency.setValueAtTime(freq * 1.9, t0);
    osc.frequency.exponentialRampToValueAtTime(freq, t0 + duration * 0.2);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, freq * 0.6), t0 + duration);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.linearRampToValueAtTime(lvl(volume), t0 + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    osc.connect(gain);
    gain.connect(this.sat ?? (this.master as GainNode));
    osc.start(t0);
    osc.stop(t0 + duration + 0.05);
    this.release(osc, gain);
  }

  /** Low-passed noise bed that darkens as it dies, with a second surge: the roll of a collapse. */
  private bed(duration: number, volume: number, from: number, to: number, delay = 0): void {
    const ctx = this.ctx as AudioContext;
    if (!this.noiseBuffer) return;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    const gain = ctx.createGain();
    const t0 = ctx.currentTime + delay;
    const v = lvl(volume);
    filter.frequency.setValueAtTime(from, t0);
    filter.frequency.exponentialRampToValueAtTime(to, t0 + duration);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.linearRampToValueAtTime(v, t0 + 0.05);
    gain.gain.exponentialRampToValueAtTime(v * 0.5, t0 + duration * 0.35);
    gain.gain.linearRampToValueAtTime(v * (0.55 + Math.random() * 0.15), t0 + duration * 0.5);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.master as GainNode);
    src.start(t0, Math.random() * 1.5);
    src.stop(t0 + duration + 0.05);
    this.release(src, filter, gain);
  }

  /** An oscillator gliding down through a resonant band: creaking fibres or straining steel. */
  private resonant(type: OscillatorType, from: number, to: number, duration: number, volume: number, centre: number, q: number, delay = 0): void {
    const ctx = this.ctx as AudioContext;
    const osc = ctx.createOscillator();
    osc.type = type;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = centre;
    filter.Q.value = q;
    const gain = ctx.createGain();
    const t0 = ctx.currentTime + delay;
    osc.frequency.setValueAtTime(from, t0);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), t0 + duration);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.linearRampToValueAtTime(lvl(volume), t0 + Math.min(0.02, duration * 0.1));
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.master as GainNode);
    osc.start(t0);
    osc.stop(t0 + duration + 0.03);
    this.release(osc, filter, gain);
  }

  /** Filtered noise whose cutoff sweeps up then down: air moving past something heavy. */
  private sweepNoise(duration: number, volume: number, from: number, to: number, peakAt = 0.5, q = 1.4, delay = 0): void {
    const ctx = this.ctx as AudioContext;
    if (!this.noiseBuffer) return;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = q;
    const t0 = ctx.currentTime + delay;
    filter.frequency.setValueAtTime(from, t0);
    filter.frequency.exponentialRampToValueAtTime(to, t0 + duration * Math.min(0.9, peakAt + 0.05));
    filter.frequency.exponentialRampToValueAtTime(from, t0 + duration);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(lvl(volume), t0 + duration * peakAt);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.master as GainNode);
    src.start(t0, Math.random() * 1.5);
    src.stop(t0 + duration + 0.05);
    this.release(src, filter, gain);
  }

  /** A structure taking more than it should: a narrow, wobbling, stick-slip groan. */
  private groan(duration: number, volume: number): void {
    const ctx = this.ctx as AudioContext;
    const t0 = ctx.currentTime;
    const f = 52 + Math.random() * 20;
    const centre = f * (4 + Math.random() * 3);
    const v = lvl(volume);
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = 5;
    filter.frequency.setValueAtTime(centre, t0);
    filter.frequency.linearRampToValueAtTime(centre * 1.25, t0 + duration * 0.5);
    filter.frequency.linearRampToValueAtTime(centre * 0.8, t0 + duration);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(v, t0 + duration * 0.25);
    gain.gain.exponentialRampToValueAtTime(v * 0.4, t0 + duration * 0.5);
    gain.gain.exponentialRampToValueAtTime(v * 0.9, t0 + duration * 0.7);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    // One slow LFO wobbles the pitch of both oscillators.
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 4 + Math.random() * 5;
    const depth = ctx.createGain();
    depth.gain.value = f * 0.06;
    lfo.connect(depth);
    const end = t0 + duration + 0.05;
    const oscs: OscillatorNode[] = [];
    for (const detune of [0, 7]) {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(f + detune, t0);
      osc.frequency.linearRampToValueAtTime((f + detune) * 0.84, t0 + duration);
      depth.connect(osc.frequency);
      osc.connect(filter);
      osc.start(t0);
      osc.stop(end);
      oscs.push(osc);
    }
    filter.connect(gain);
    gain.connect(this.master as GainNode);
    lfo.start(t0);
    lfo.stop(end);
    this.release(lfo, depth, filter, gain, ...oscs);
  }

  private blip(freq: number, duration: number, volume: number, delay = 0, type: OscillatorType = 'sine'): void {
    const ctx = this.ctx as AudioContext;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    const t0 = ctx.currentTime + delay;
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(volume, t0 + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    osc.connect(gain);
    gain.connect(this.master as GainNode);
    osc.start(t0);
    osc.stop(t0 + duration + 0.02);
    this.release(osc, gain);
  }

  private chord(freqs: number[], duration: number, volume: number): void {
    freqs.forEach((f, i) => this.blip(f, duration, volume / freqs.length, i * 0.04, 'triangle'));
  }

  private thud(freq: number, duration: number, volume: number, delay = 0): void {
    const ctx = this.ctx as AudioContext;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    const t0 = ctx.currentTime + delay;
    osc.frequency.setValueAtTime(freq * 2, t0);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, freq * 0.5), t0 + duration);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(Math.min(1, volume), t0 + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    osc.connect(gain);
    gain.connect(this.master as GainNode);
    osc.start(t0);
    osc.stop(t0 + duration + 0.05);
    this.release(osc, gain);
  }

  private noise(duration: number, volume: number, cutoff: number, type: BiquadFilterType, delay = 0): void {
    const ctx = this.ctx as AudioContext;
    if (!this.noiseBuffer) return;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = cutoff;
    const gain = ctx.createGain();
    const t0 = ctx.currentTime + delay;
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(Math.min(1, volume), t0 + Math.min(0.03, duration / 3));
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.master as GainNode);
    src.start(t0, Math.random() * 1.5);
    src.stop(t0 + duration + 0.05);
    this.release(src, filter, gain);
  }

  private boom(strength: number, variant?: Variant): void {
    const ctx = this.ctx as AudioContext;
    const t0 = ctx.currentTime;
    const sweep = (from: number, to: number, dur: number, vol: number, type: OscillatorType): void => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(from, t0);
      osc.frequency.exponentialRampToValueAtTime(to, t0 + dur);
      gain.gain.setValueAtTime(vol, t0);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur + 0.1);
      osc.connect(gain);
      gain.connect(this.master as GainNode);
      osc.start(t0);
      osc.stop(t0 + dur + 0.15);
      this.release(osc, gain);
    };
    switch (variant) {
      case 'small':
        // Short and punchy.
        this.thud(70, 0.6, 1);
        this.noise(0.08, 0.9, 5000, 'highpass');
        this.noise(0.9, 0.5, 1100, 'lowpass');
        break;
      case 'heavy':
        // Gas bottle: sharp crack, deep boom, a long roll and debris pattering back down.
        this.blast(1 + strength * 0.2);
        break;
      case 'directional':
        // A forced jet: whoosh into the bang.
        this.noise(0.35, 0.55, 2400, 'bandpass');
        this.thud(55, 1.1, 0.95);
        this.noise(0.1, 0.8, 5500, 'highpass', 0.02);
        this.noise(1.5, 0.5, 800, 'lowpass', 0.03);
        break;
      case 'shaped':
        // A razor crack and a metallic zing, very little rumble.
        this.noise(0.05, 1, 7000, 'highpass');
        sweep(3200, 400, 0.25, 0.18, 'sawtooth');
        this.thud(90, 0.5, 0.8);
        this.noise(0.6, 0.3, 1400, 'lowpass', 0.02);
        break;
      default:
        this.blast(0.75 + strength * 0.2);
    }
  }

  /** Crack, saturated low boom, rolling bed and a debris-hiss tail. `size` is about 0.75 to 1.2. */
  private blast(size: number): void {
    const z = clamp(size, 0.5, 1.25);
    const p = jit(0.06);
    this.hit(0.03, 0.6, 5200, 'highpass');
    this.hit(0.12 * z, 0.5, 1800 * p, 'bandpass', 0.004, 0.7);
    this.sub(42 / z, 1.5 * z, 0.6);
    this.sub(95 * p, 0.5, 0.45, 0.01);
    this.bed(2.2 * z, 0.5, 1400, 160, 0.02);
    this.grains(1.2 * z, 0.2, 'highpass', 2500, 7000, 1, 0.25, 1.6);
  }
}

export const audio = new AudioEngine();
