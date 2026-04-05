// Maps keyboard keys to note names (octave appended in App.jsx)
// White keys: A S D F G H J K
// Black keys: W E T Y U
export const KEY_TO_NOTE = {
  a: "C",
  w: "C#",
  s: "D",
  e: "D#",
  d: "E",
  f: "F",
  t: "F#",
  g: "G",
  y: "G#",
  h: "A",
  u: "A#",
  j: "B",
  // K plays C of the next octave — handled specially in App.jsx
  k: "C+1",
};

export const OCTAVE_DOWN_KEY = "z";
export const OCTAVE_UP_KEY = "x";

// All notes in one octave, in order (used to render the keyboard)
export const NOTES_IN_OCTAVE = [
  { note: "C", black: false },
  { note: "C#", black: true },
  { note: "D", black: false },
  { note: "D#", black: true },
  { note: "E", black: false },
  { note: "F", black: false },
  { note: "F#", black: true },
  { note: "G", black: false },
  { note: "G#", black: true },
  { note: "A", black: false },
  { note: "A#", black: true },
  { note: "B", black: false },
];
