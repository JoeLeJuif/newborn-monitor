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

const osc1Vol = new Tone.Volume(0).connect(filter);
const osc2Vol = new Tone.Volume(-Infinity).connect(filter);

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

// ─── Dual LFO — GainNode matrix ───────────────────────────────────────────
//
// Each LFO fans out to one GainNode per target. All GainNodes are wired at
// startup and never disconnected. Bypass = gain 0 (mathematically exact zero,
// no residual, no timing issues). Target switching = zero old gate, open new.
//
// Effective param value = param.value (user setting)
//                       + lfo1_gate[target] * lfo1_out
//                       + lfo2_gate[target] * lfo2_out
//
// Because the user's .value is the AudioParam intrinsic value (never touched
// by connected sources), no "restore base value" logic is needed — disconnecting
// a source or setting its gain to 0 automatically reverts to the intrinsic value.

function makeLFO(targetParams) {
  // Normalized oscillator: always outputs −1 … +1
  const osc = new Tone.LFO({ type: "sine", frequency: 2, min: -1, max: 1 });

  // One permanently-wired GainNode per target
  const gates = {};
  for (const [key, param] of Object.entries(targetParams)) {
    const g = new Tone.Gain(0); // gain=0 → contributes nothing until enabled
    osc.connect(g);
    g.connect(param);
    gates[key] = g;
  }

  let active  = false;
  let depth   = 1000;
  let target  = Object.keys(targetParams)[0];
  let started = false;

  return {
    start() {
      if (!started) { osc.start(); started = true; }
    },
    setRate(hz)    { osc.frequency.value = hz; },
    setWaveform(t) { osc.type = t; },
    setDepth(d) {
      depth = d;
      if (active) gates[target].gain.value = d;
    },
    setTarget(t) {
      if (!gates[t] || t === target) return; // no-op if same or unknown
      if (active) gates[target].gain.value = 0; // zero old gate
      target = t;
      if (active) gates[target].gain.value = depth; // open new gate
    },
    setEnabled(en) {
      active = en;
      gates[target].gain.value = en ? depth : 0;
    },
  };
}

// Build target map after all audio nodes are defined
const LFO_TARGET_PARAMS = {
  filterCutoff:    filter.frequency,
  filterResonance: filter.Q,
  delayWet:        delay.wet,
  reverbWet:       reverb.wet,
  masterVolume:    masterVolume.volume,
};

const lfo1 = makeLFO(LFO_TARGET_PARAMS);
const lfo2 = makeLFO(LFO_TARGET_PARAMS);

let lfoStarted  = false;
let osc2Enabled = false;
let osc2Level   = 0.7;

function gainToDb(gain) {
  return gain <= 0 ? -Infinity : 20 * Math.log10(gain);
}

// ─── Core audio lifecycle ──────────────────────────────────────────────────

export async function startAudio() {
  await Tone.start();
  if (!lfoStarted) {
    lfo1.start();
    lfo2.start();
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

export function setWaveform(type) {
  synth.set({ oscillator: { type } });
}

export function setEnvelope({ attack, decay, sustain, release }) {
  synth.set({ envelope: { attack, decay, sustain, release } });
  synth2.set({ envelope: { attack, decay, sustain, release } });
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

// ─── Oscillator 1 ─────────────────────────────────────────────────────────

export function setOsc1Waveform(type) { synth.set({ oscillator: { type } }); }
export function setOsc1Level(gain)    { osc1Vol.volume.value = gainToDb(gain); }

// ─── Oscillator 2 ─────────────────────────────────────────────────────────

export function setOsc2Enabled(enabled) {
  osc2Enabled = enabled;
  osc2Vol.volume.value = enabled ? gainToDb(osc2Level) : -Infinity;
}
export function setOsc2Waveform(type) { synth2.set({ oscillator: { type } }); }
export function setOsc2Level(gain) {
  osc2Level = gain;
  osc2Vol.volume.value = osc2Enabled ? gainToDb(gain) : -Infinity;
}
export function setOsc2Detune(cents)  { synth2.set({ oscillator: { detune: cents } }); }

// ─── LFO 1 ────────────────────────────────────────────────────────────────

export function setLFO1Rate(hz)       { lfo1.setRate(hz); }
export function setLFO1Depth(depth)   { lfo1.setDepth(depth); }
export function setLFO1Waveform(type) { lfo1.setWaveform(type); }
export function setLFO1Target(target) { lfo1.setTarget(target); }
export function setLFO1Enabled(en)    { lfo1.setEnabled(en); }

// ─── LFO 2 ────────────────────────────────────────────────────────────────

export function setLFO2Rate(hz)       { lfo2.setRate(hz); }
export function setLFO2Depth(depth)   { lfo2.setDepth(depth); }
export function setLFO2Waveform(type) { lfo2.setWaveform(type); }
export function setLFO2Target(target) { lfo2.setTarget(target); }
export function setLFO2Enabled(en)    { lfo2.setEnabled(en); }

// ─── Delay ────────────────────────────────────────────────────────────────

export function setDelayWet(val)      { delay.wet.value = val; }
export function setDelayFeedback(val) { delay.feedback.value = val; }
export function setDelayTime(val)     { delay.delayTime.value = val; }

// ─── Reverb ───────────────────────────────────────────────────────────────

export function setReverbWet(val)  { reverb.wet.value = val; }
export function setReverbRoom(val) { reverb.roomSize.value = val; }
