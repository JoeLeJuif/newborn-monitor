// MIDI module — wraps Web MIDI API
// Provides: initMidi, getInputList, selectInput, disconnectMidi

const NOTE_NAMES = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];

/** Convert a MIDI note number (0-127) to a Tone.js note string, e.g. 60 → "C4" */
export function midiNoteToName(midiNote) {
  const octave = Math.floor(midiNote / 12) - 1;
  return `${NOTE_NAMES[midiNote % 12]}${octave}`;
}

let midiAccess  = null;
let activeInput = null;
let cbs = { onNoteOn: null, onNoteOff: null, onDeviceChange: null };

/**
 * Request MIDI access and register callbacks.
 * Returns { supported, granted, inputs }.
 * Safe to call even if Web MIDI is unavailable — never throws.
 */
export async function initMidi({ onNoteOn, onNoteOff, onDeviceChange }) {
  cbs = { onNoteOn, onNoteOff, onDeviceChange };

  if (!navigator.requestMIDIAccess) {
    return { supported: false, granted: false, inputs: [] };
  }

  try {
    midiAccess = await navigator.requestMIDIAccess();

    midiAccess.onstatechange = () => {
      const list = getInputList();
      cbs.onDeviceChange?.(list);

      // Re-attach listener if the active device reconnected
      if (activeInput) {
        const input = midiAccess.inputs.get(activeInput.id);
        if (input && input.state === "connected") {
          activeInput = input;
          activeInput.onmidimessage = handleMessage;
        }
      }
    };

    return { supported: true, granted: true, inputs: getInputList() };
  } catch {
    return { supported: true, granted: false, inputs: [] };
  }
}

/** Returns array of { id, name } for all connected MIDI inputs */
export function getInputList() {
  if (!midiAccess) return [];
  return [...midiAccess.inputs.values()].map((i) => ({ id: i.id, name: i.name }));
}

/** Attach message listener to the given input id. Pass "" to deselect. */
export function selectInput(id) {
  if (activeInput) { activeInput.onmidimessage = null; }
  activeInput = null;
  if (!id || !midiAccess) return;
  activeInput = midiAccess.inputs.get(id) ?? null;
  if (activeInput) activeInput.onmidimessage = handleMessage;
}

/** Clean up all MIDI listeners. Call on component unmount. */
export function disconnectMidi() {
  if (activeInput) { activeInput.onmidimessage = null; activeInput = null; }
  if (midiAccess)  { midiAccess.onstatechange = null; midiAccess = null; }
}

function handleMessage(event) {
  const [status, note, velocity] = event.data;
  const cmd = status & 0xf0;

  if (cmd === 0x90 && velocity > 0) {
    // Note On — velocity 1-127 normalised to 0-1
    cbs.onNoteOn?.(midiNoteToName(note), velocity / 127);
  } else if (cmd === 0x80 || (cmd === 0x90 && velocity === 0)) {
    // Note Off (0x80) or Note On with velocity 0 (running status convention)
    cbs.onNoteOff?.(midiNoteToName(note));
  }
}
