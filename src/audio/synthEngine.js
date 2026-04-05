import * as Tone from "tone";

// ─── Signal chain ──────────────────────────────────────────────────────────
// PolySynth → Filter → Delay → Reverb → Volume → Destination
//
// Both Delay and Reverb have wet=0 by default so they are transparent
// until the user enables them.

const masterVolume = new Tone.Volume(-6).toDestination();

const reverb = new Tone.Freeverb({ roomSize: 0.7, dampening: 3000, wet: 0 })
  .connect(masterVolume);

const delay = new Tone.FeedbackDelay({ delayTime: 0.25, feedback: 0.3, wet: 0 })
  .connect(reverb);

const filter = new Tone.Filter({ type: "lowpass", frequency: 8000, Q: 1 })
  .connect(delay);

const synth = new Tone.PolySynth(Tone.Synth, {
  maxPolyphony: 8,
  oscillator: { type: "sawtooth" },
  envelope: { attack: 0.02, decay: 0.1, sustain: 0.7, release: 0.5 },
}).connect(filter);

// ─── LFO ──────────────────────────────────────────────────────────────────
// Modulates filter cutoff via Web Audio additive summing (min/max are offsets)
const lfo = new Tone.LFO({ type: "sine", frequency: 2, min: -1000, max: 1000 });
let lfoActive = false;

// ─── Core audio lifecycle ──────────────────────────────────────────────────

// Must be called on the first user gesture (browser AudioContext policy)
export async function startAudio() {
  await Tone.start();
}

// velocity: 0–1, defaults to full velocity for keyboard/mouse play
export function triggerAttack(note, velocity = 1) {
  synth.triggerAttack(note, Tone.now(), velocity);
}

export function triggerRelease(note) {
  synth.triggerRelease(note);
}

export function releaseAll() {
  synth.releaseAll();
}

// Used by the step sequencer — fires a note at a pre-scheduled audio time
export function triggerAttackRelease(note, duration, time, velocity = 0.8) {
  synth.triggerAttackRelease(note, duration, time, velocity);
}

// ─── Synth parameters ─────────────────────────────────────────────────────

export function setWaveform(type) {
  synth.set({ oscillator: { type } });
}

export function setEnvelope({ attack, decay, sustain, release }) {
  synth.set({ envelope: { attack, decay, sustain, release } });
}

export function setFilterCutoff(freq) {
  filter.frequency.value = freq;
}

export function setFilterResonance(q) {
  filter.Q.value = q;
}

export function setMasterVolume(db) {
  masterVolume.volume.value = db;
}

// ─── LFO ──────────────────────────────────────────────────────────────────

export function setLFORate(hz) {
  lfo.frequency.value = hz;
}

export function setLFODepth(depth) {
  lfo.min = -depth;
  lfo.max = depth;
}

export function setLFOWaveform(type) {
  lfo.type = type;
}

export function setLFOEnabled(enabled) {
  if (enabled === lfoActive) return;
  lfoActive = enabled;
  if (enabled) {
    lfo.connect(filter.frequency);
    lfo.start();
  } else {
    lfo.stop();
    lfo.disconnect();
  }
}

// ─── Delay ────────────────────────────────────────────────────────────────

export function setDelayWet(val) {
  delay.wet.value = val;
}

export function setDelayFeedback(val) {
  delay.feedback.value = val;
}

export function setDelayTime(val) {
  delay.delayTime.value = val;
}

// ─── Reverb ───────────────────────────────────────────────────────────────

export function setReverbWet(val) {
  reverb.wet.value = val;
}

export function setReverbRoom(val) {
  reverb.roomSize.value = val;
}
