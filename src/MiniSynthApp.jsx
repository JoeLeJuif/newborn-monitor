import { useState, useEffect, useCallback, useRef } from "react";
import PianoKeyboard from "./components/PianoKeyboard";
import Controls from "./components/Controls";
import PresetPanel from "./components/PresetPanel";
import LFOControls from "./components/LFOControls";
import EffectsControls from "./components/EffectsControls";
import StepSequencer from "./components/StepSequencer";
import MidiPanel from "./components/MidiPanel";
import {
  startAudio, triggerAttack, triggerRelease, releaseAll,
  setEnvelope, setFilterCutoff, setFilterResonance, setMasterVolume,
  setLFO1Rate, setLFO1Depth, setLFO1Waveform, setLFO1Target, setLFO1Enabled,
  setLFO2Rate, setLFO2Depth, setLFO2Waveform, setLFO2Target, setLFO2Enabled,
  setDelayWet, setDelayFeedback, setDelayTime, setReverbWet, setReverbRoom,
  setOsc1Waveform, setOsc1Level,
  setOsc2Enabled, setOsc2Waveform, setOsc2Level, setOsc2Detune,
} from "./audio/synthEngine";
import { initMidi, selectInput, disconnectMidi } from "./audio/midi";
import { KEY_TO_NOTE, OCTAVE_DOWN_KEY, OCTAVE_UP_KEY } from "./audio/keyMap";

const DEFAULT_ENVELOPE = { attack: 0.02, decay: 0.1, sustain: 0.7, release: 0.5 };
const DEFAULT_LFO1     = { enabled: false, rate: 2,   depth: 1000, waveform: "sine",     target: "filterCutoff" };
const DEFAULT_LFO2     = { enabled: false, rate: 0.5, depth: 3,    waveform: "sine",     target: "masterVolume" };
const DEFAULT_EFFECTS  = {
  delay:  { enabled: false, wet: 0.3, feedback: 0.3, time: 0.25 },
  reverb: { enabled: false, wet: 0.4, room: 0.7 },
};
const DEFAULT_OSC1 = { waveform: "sawtooth", level: 1 };
const DEFAULT_OSC2 = { enabled: false, waveform: "sawtooth", level: 0.7, detune: 0 };

export default function MiniSynthApp() {
  const [octave, setOctave]           = useState(4);
  const [activeNotes, setActiveNotes] = useState(new Set());
  const [lastNote, setLastNote]       = useState(null);

  const [osc1, setOsc1State]          = useState(DEFAULT_OSC1);
  const [osc2, setOsc2State]          = useState(DEFAULT_OSC2);
  const [envelope, setEnvelopeState]  = useState(DEFAULT_ENVELOPE);
  const [cutoff, setCutoff]           = useState(8000);
  const [resonance, setResonance]     = useState(1);
  const [volume, setVolume]           = useState(-6);
  const [lfo1, setLfo1State]          = useState(DEFAULT_LFO1);
  const [lfo2, setLfo2State]          = useState(DEFAULT_LFO2);
  const [effects, setEffectsState]    = useState(DEFAULT_EFFECTS);

  const [midiInfo, setMidiInfo] = useState({
    supported: null, granted: false, inputs: [], selectedId: "", lastNote: null,
  });

  // mirrors octave state — readable in stable keyboard callbacks without
  // adding `octave` to the effect dependency array.
  const octaveRef = useRef(4);

  // stores the exact note string played per key so keyup always
  // releases the correct note even if octave changed in between.
  const heldKeyNotes = useRef(new Map()); // key → note string

  // reference count per note across all sources (keyboard, mouse, MIDI).
  // triggerAttack fires only when count goes 0→1;
  // triggerRelease fires only when count goes 1→0.
  const noteCountRef = useRef(new Map()); // note → number

  const audioStarted = useRef(false);

  const ensureAudio = useCallback(async () => {
    if (!audioStarted.current) { await startAudio(); audioStarted.current = true; }
  }, []);

  // noteOn / noteOff are the single source of truth for audio + visual state.
  const noteOn = useCallback(async (note, velocity = 1) => {
    await ensureAudio();
    const count = (noteCountRef.current.get(note) ?? 0) + 1;
    noteCountRef.current.set(note, count);
    setActiveNotes((prev) => new Set(prev).add(note));
    setLastNote(note);
    if (count === 1) triggerAttack(note, velocity); // only first source triggers audio
  }, [ensureAudio]);

  const noteOff = useCallback((note) => {
    const count = Math.max(0, (noteCountRef.current.get(note) ?? 1) - 1);
    if (count === 0) {
      noteCountRef.current.delete(note);
      setActiveNotes((prev) => { const n = new Set(prev); n.delete(note); return n; });
      triggerRelease(note);
    } else {
      noteCountRef.current.set(note, count);
    }
  }, []);

  // keyboard effect no longer depends on `octave` — uses octaveRef instead.
  useEffect(() => {
    const down = async (e) => {
      if (e.repeat || e.ctrlKey || e.altKey || e.metaKey) return;
      const key = e.key.toLowerCase();
      if (key === OCTAVE_DOWN_KEY) {
        setOctave((o) => { const n = Math.max(0, o - 1); octaveRef.current = n; return n; });
        return;
      }
      if (key === OCTAVE_UP_KEY) {
        setOctave((o) => { const n = Math.min(8, o + 1); octaveRef.current = n; return n; });
        return;
      }
      const noteName = KEY_TO_NOTE[key];
      if (!noteName || heldKeyNotes.current.has(key)) return;
      const oct  = octaveRef.current;
      const note = noteName === "C+1" ? `C${oct + 1}` : `${noteName}${oct}`;
      heldKeyNotes.current.set(key, note); // remember exact note at press time
      await noteOn(note);
    };
    const up = (e) => {
      const key  = e.key.toLowerCase();
      const note = heldKeyNotes.current.get(key); // exact note stored at keydown
      heldKeyNotes.current.delete(key);
      if (note) noteOff(note);
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup",   up);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); };
  }, [noteOn, noteOff]); // `octave` removed — octaveRef handles it

  useEffect(() => {
    initMidi({
      onNoteOn: async (note, velocity) => {
        await ensureAudio();
        const count = (noteCountRef.current.get(note) ?? 0) + 1;
        noteCountRef.current.set(note, count);
        setActiveNotes((prev) => new Set(prev).add(note));
        setLastNote(note);
        if (count === 1) triggerAttack(note, velocity);
        setMidiInfo((prev) => ({ ...prev, lastNote: note }));
      },
      onNoteOff: (note) => {
        const count = Math.max(0, (noteCountRef.current.get(note) ?? 1) - 1);
        if (count === 0) {
          noteCountRef.current.delete(note);
          setActiveNotes((prev) => { const n = new Set(prev); n.delete(note); return n; });
          triggerRelease(note);
        } else {
          noteCountRef.current.set(note, count);
        }
      },
      // release all held MIDI notes when active device disconnects.
      onDisconnect: () => {
        releaseAll();
        noteCountRef.current.clear();
        setActiveNotes(new Set());
      },
      onDeviceChange: (inputs) => setMidiInfo((prev) => ({ ...prev, inputs })),
    }).then(({ supported, granted, inputs }) => {
      setMidiInfo((prev) => ({
        ...prev,
        supported: supported ?? false,
        granted:   granted  ?? false,
        inputs:    inputs   ?? [],
      }));
    });
    return () => disconnectMidi();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleMidiInputSelect = (id) => {
    selectInput(id);
    setMidiInfo((prev) => ({ ...prev, selectedId: id }));
  };

  const handleOscChange = ({ osc1: o1, osc2: o2 }) => {
    setOsc1State(o1); setOsc2State(o2);
    setOsc1Waveform(o1.waveform); setOsc1Level(o1.level);
    setOsc2Waveform(o2.waveform); setOsc2Level(o2.level);
    setOsc2Detune(o2.detune);     setOsc2Enabled(o2.enabled);
  };
  const handleEnvelopeChange  = (env) => { setEnvelopeState(env); setEnvelope(env); };
  const handleCutoffChange    = (f)   => { setCutoff(f); setFilterCutoff(f); };
  const handleResonanceChange = (q)   => { setResonance(q); setFilterResonance(q); };
  const handleVolumeChange    = (db)  => { setVolume(db); setMasterVolume(db); };

  const handleLFO1Change = (lfo) => {
    setLfo1State(lfo);
    setLFO1Rate(lfo.rate);
    setLFO1Waveform(lfo.waveform);
    setLFO1Target(lfo.target);
    setLFO1Depth(lfo.depth);
    setLFO1Enabled(lfo.enabled);
  };

  const handleLFO2Change = (lfo) => {
    setLfo2State(lfo);
    setLFO2Rate(lfo.rate);
    setLFO2Waveform(lfo.waveform);
    setLFO2Target(lfo.target);
    setLFO2Depth(lfo.depth);
    setLFO2Enabled(lfo.enabled);
  };

  const handleEffectsChange = (fx) => {
    setEffectsState(fx);
    setDelayWet(fx.delay.enabled ? fx.delay.wet : 0);
    setDelayFeedback(fx.delay.feedback); setDelayTime(fx.delay.time);
    setReverbWet(fx.reverb.enabled ? fx.reverb.wet : 0);
    setReverbRoom(fx.reverb.room);
  };

  const loadPreset = (preset) => {
    releaseAll();
    noteCountRef.current.clear();
    setActiveNotes(new Set());

    const loadedOsc1 = preset.osc1 ?? { waveform: preset.waveform ?? "sawtooth", level: 1 };
    const loadedOsc2 = preset.osc2 ?? DEFAULT_OSC2;
    handleOscChange({ osc1: loadedOsc1, osc2: loadedOsc2 });
    handleEnvelopeChange(preset.envelope);
    handleCutoffChange(preset.cutoff);
    handleResonanceChange(preset.resonance);
    handleVolumeChange(preset.volume);

    // Backward compat: old presets have a single `lfo` field
    const loadedLfo1 = preset.lfo1 ?? (preset.lfo
      ? { ...DEFAULT_LFO1, ...preset.lfo, target: "filterCutoff" }
      : DEFAULT_LFO1);
    const loadedLfo2 = preset.lfo2 ?? DEFAULT_LFO2;
    handleLFO1Change({ waveform: "sine", ...loadedLfo1 });
    handleLFO2Change({ waveform: "sine", ...loadedLfo2 });
  };

  const currentState = {
    waveform: osc1.waveform,
    osc1, osc2,
    envelope, cutoff, resonance, volume,
    lfo1, lfo2,
  };

  return (
    <div className="app">

      {/* ── Header ─────────────────────────────────────────── */}
      <header className="app-header">
        <div className="header-brand">
          <h1 className="app-title">SammysMiniSynth</h1>
          <span className="app-subtitle">Polyphonic Synthesizer</span>
        </div>
        <div className="header-status">
          <span className="status-chip">Oct {octave}</span>
          {lastNote && <span className="status-chip status-chip--note">♪ {lastNote}</span>}
          <span className={`status-chip status-chip--midi${midiInfo.granted ? " is-active" : ""}`}>
            <span className="status-dot" />
            MIDI
          </span>
          <span className="header-hint">Z/X oct · A–K notes</span>
        </div>
      </header>

      <main className="app-main">

        {/* ── Keyboard ───────────────────────────────────────── */}
        <PianoKeyboard
          octave={octave} activeNotes={activeNotes}
          onNoteOn={noteOn} onNoteOff={noteOff}
        />

        {/* ── Zone: Synthesizer ──────────────────────────────── */}
        <div className="zone">
          <div className="zone-header">
            <span className="zone-label">Synthesizer</span>
          </div>
          <Controls
            osc1={osc1} osc2={osc2} onOscChange={handleOscChange}
            envelope={envelope}   onEnvelopeChange={handleEnvelopeChange}
            cutoff={cutoff}       onCutoffChange={handleCutoffChange}
            resonance={resonance} onResonanceChange={handleResonanceChange}
            volume={volume}       onVolumeChange={handleVolumeChange}
          />
        </div>

        {/* ── Zone: Modulation · Effects · Utility ───────────── */}
        <div className="zone">
          <div className="zone-header">
            <span className="zone-label">Modulation · Effects · Utility</span>
          </div>
          <div className="controls">
            <LFOControls
              lfo1={lfo1} lfo2={lfo2}
              onChange1={handleLFO1Change} onChange2={handleLFO2Change}
            />
            <EffectsControls effects={effects} onChange={handleEffectsChange} />
            <PresetPanel currentState={currentState} onLoad={loadPreset} />
            <MidiPanel midi={midiInfo} onSelectInput={handleMidiInputSelect} />
          </div>
        </div>

        {/* ── Zone: Sequencer ────────────────────────────────── */}
        <StepSequencer />

      </main>
    </div>
  );
}
