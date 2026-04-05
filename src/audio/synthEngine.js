import * as Tone from "tone";

// ─── Signal chain ──────────────────────────────────────────────────────────
// OSC1 → osc1Vol ─┐
//                  ├→ Filter → Delay → Reverb → Volume → Destination
// OSC2 → osc2Vol ─┘

const masterVolume = new Tone.Volume(-6).toDestination();

const reverb = new Tone.Freeverb({ roomSize: 0.7, dampening: 3000, wet: 0 })
  .connect(masterVolume);

const delay = new Tone.FeedbackDelay({ delayTime: 0.25, feedback: 0.3, wet: 0 })
  .connect(reverb);

const filter = new Tone.Filter({ type: "lowpass", frequency: 8000, Q: 1 })
  .connect(delay);

// Per-oscillator gain nodes (both feed into the same filter)
const osc1Vol = new Tone.Volume(0).connect(filter);
const osc2Vol = new Tone.Volume(-Infinity).connect(filter); // muted until enabled

const synth = new Tone.PolySynth(Tone.Synth, {
  maxPolyphony: 8,
  oscillator: { type: "sawtooth" },
  envelope: { attack: 0.02, decay: 0.1, sustain: 0.7, release: 0.5 },
}).connect(osc1Vol);

const synth2 = new Tone.PolySynth(Tone.Synth, {
  maxPolyphony: 8,
  oscillator: { type: "sawtooth", detune: 0 },
  envelope: { attack: 0.02, decay: 0.1, sustain: 0.7, release: 0.5 },
}).connect(osc2Vol);

// ─── LFO ──────────────────────────────────────────────────────────────────
// The LFO is always connected to filter.frequency and always running after
// startAudio(). Enable/disable is done by setting min/max to ±depth or 0/0.
// This avoids the dynamic connect/disconnect pattern, which fails silently in
// Tone.js v14 when called without a specific destination argument.
const lfo = new Tone.LFO({ type: "sine", frequency: 2, min: 0, max: 0 })
  .connect(filter.frequency);

let lfoActive   = false;
let lfoDepth    = 1000; // stored user value — applied only when LFO is enabled
let lfoStarted  = false;
let osc2Enabled = false;
let osc2Level   = 0.7;

// Tracks the user-set cutoff independently of any LFO modulation.
let baseCutoff = 8000;

function gainToDb(gain) {
  return gain <= 0 ? -Infinity : 20 * Math.log10(gain);
}

// ─── Core audio lifecycle ──────────────────────────────────────────────────

export async function startAudio() {
  await Tone.start();
  // Start LFO once — it runs indefinitely but outputs 0 until enabled.
  if (!lfoStarted) {
    lfo.start();
    lfoStarted = true;
  }
}

export function triggerAttack(note, velocity = 1) {
  const t = Tone.now();
  synth.triggerAttack(note, t, velocity);
  if (osc2Enabled) synth2.triggerAttack(note, t, velocity);
}

export function triggerRelease(note) {
  synth.triggerRelease(note);
  synth2.triggerRelease(note);
}

export function releaseAll() {
  synth.releaseAll();
  synth2.releaseAll();
}

export function triggerAttackRelease(note, duration, time, velocity = 0.8) {
  synth.triggerAttackRelease(note, duration, time, velocity);
  if (osc2Enabled) synth2.triggerAttackRelease(note, duration, time, velocity);
}

// ─── Synth parameters ─────────────────────────────────────────────────────

// Kept for backward compat (preset load paths that call setWaveform directly)
export function setWaveform(type) {
  synth.set({ oscillator: { type } });
}

export function setEnvelope({ attack, decay, sustain, release }) {
  synth.set({ envelope: { attack, decay, sustain, release } });
  synth2.set({ envelope: { attack, decay, sustain, release } });
}

export function setFilterCutoff(freq) {
  baseCutoff = freq;
  filter.frequency.value = freq;
}

export function setFilterResonance(q) {
  filter.Q.value = q;
}

export function setMasterVolume(db) {
  masterVolume.volume.value = db;
}

// ─── Oscillator 1 ─────────────────────────────────────────────────────────

export function setOsc1Waveform(type) {
  synth.set({ oscillator: { type } });
}

export function setOsc1Level(gain) {
  osc1Vol.volume.value = gainToDb(gain);
}

// ─── Oscillator 2 ─────────────────────────────────────────────────────────

export function setOsc2Enabled(enabled) {
  osc2Enabled = enabled;
  osc2Vol.volume.value = enabled ? gainToDb(osc2Level) : -Infinity;
}

export function setOsc2Waveform(type) {
  synth2.set({ oscillator: { type } });
}

export function setOsc2Level(gain) {
  osc2Level = gain;
  osc2Vol.volume.value = osc2Enabled ? gainToDb(gain) : -Infinity;
}

export function setOsc2Detune(cents) {
  synth2.set({ oscillator: { detune: cents } });
}

// ─── LFO ──────────────────────────────────────────────────────────────────

export function setLFORate(hz) {
  lfo.frequency.value = hz;
}

export function setLFODepth(depth) {
  lfoDepth = depth;
  // Only apply range if LFO is currently active.
  if (lfoActive) {
    lfo.min = -depth;
    lfo.max =  depth;
  }
}

export function setLFOWaveform(type) {
  lfo.type = type;
}

export function setLFOEnabled(enabled) {
  lfoActive = enabled;
  if (enabled) {
    // Apply stored depth and let the LFO modulate.
    lfo.min = -lfoDepth;
    lfo.max =  lfoDepth;
  } else {
    // Silence the LFO by zeroing its range, then restore the exact base cutoff.
    lfo.min = 0;
    lfo.max = 0;
    filter.frequency.value = baseCutoff;
  }
}

// ─── Delay ────────────────────────────────────────────────────────────────

export function setDelayWet(val)      { delay.wet.value = val; }
export function setDelayFeedback(val) { delay.feedback.value = val; }
export function setDelayTime(val)     { delay.delayTime.value = val; }

// ─── Reverb ───────────────────────────────────────────────────────────────

export function setReverbWet(val)  { reverb.wet.value = val; }
export function setReverbRoom(val) { reverb.roomSize.value = val; }
