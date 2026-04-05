const STORAGE_KEY = "minisynth_user_presets";

export const DEFAULT_PRESETS = [
  {
    id: "init",
    name: "Init",
    waveform: "sawtooth",
    osc1: { waveform: "sawtooth", level: 1 },
    osc2: { enabled: false, waveform: "sawtooth", level: 0.7, detune: 0 },
    envelope: { attack: 0.02, decay: 0.1, sustain: 0.7, release: 0.5 },
    cutoff: 8000,
    resonance: 1,
    volume: -6,
    lfo: { enabled: false, rate: 2, depth: 1000, waveform: "sine" },
  },
  {
    id: "bass",
    name: "Bass",
    waveform: "sawtooth",
    osc1: { waveform: "sawtooth", level: 1 },
    osc2: { enabled: true, waveform: "square", level: 0.5, detune: -12 },
    envelope: { attack: 0.01, decay: 0.3, sustain: 0.4, release: 0.2 },
    cutoff: 600,
    resonance: 8,
    volume: -4,
    lfo: { enabled: false, rate: 0.5, depth: 200, waveform: "sine" },
  },
  {
    id: "lead",
    name: "Lead",
    waveform: "square",
    osc1: { waveform: "square", level: 1 },
    osc2: { enabled: true, waveform: "sawtooth", level: 0.4, detune: 7 },
    envelope: { attack: 0.01, decay: 0.1, sustain: 0.8, release: 0.3 },
    cutoff: 5000,
    resonance: 4,
    volume: -8,
    lfo: { enabled: true, rate: 5, depth: 800, waveform: "sine" },
  },
  {
    id: "pad",
    name: "Pad",
    waveform: "triangle",
    osc1: { waveform: "triangle", level: 1 },
    osc2: { enabled: true, waveform: "sine", level: 0.6, detune: 5 },
    envelope: { attack: 0.8, decay: 0.5, sustain: 0.9, release: 1.5 },
    cutoff: 3000,
    resonance: 2,
    volume: -10,
    lfo: { enabled: true, rate: 0.3, depth: 500, waveform: "triangle" },
  },
  {
    id: "pluck",
    name: "Pluck",
    waveform: "sine",
    osc1: { waveform: "sine", level: 1 },
    osc2: { enabled: false, waveform: "triangle", level: 0.5, detune: 0 },
    envelope: { attack: 0.001, decay: 0.4, sustain: 0.0, release: 0.3 },
    cutoff: 12000,
    resonance: 3,
    volume: -6,
    lfo: { enabled: false, rate: 4, depth: 300, waveform: "sine" },
  },
];

export function getUserPresets() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  } catch {
    return [];
  }
}

// Upserts by name. Returns the updated user preset array.
export function saveUserPreset(preset) {
  const list = getUserPresets();
  const idx = list.findIndex((p) => p.name === preset.name);
  if (idx >= 0) {
    list[idx] = preset;
  } else {
    list.push(preset);
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  return list;
}

export function deleteUserPreset(name) {
  const list = getUserPresets().filter((p) => p.name !== name);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  return list;
}
