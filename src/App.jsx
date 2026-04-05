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
  setWaveform, setEnvelope, setFilterCutoff, setFilterResonance, setMasterVolume,
  setLFORate, setLFODepth, setLFOWaveform, setLFOEnabled,
  setDelayWet, setDelayFeedback, setDelayTime, setReverbWet, setReverbRoom,
} from "./audio/synthEngine";
import { initMidi, selectInput, disconnectMidi } from "./audio/midi";
import { KEY_TO_NOTE, OCTAVE_DOWN_KEY, OCTAVE_UP_KEY } from "./audio/keyMap";
import "./App.css";

const DEFAULT_ENVELOPE = { attack: 0.02, decay: 0.1, sustain: 0.7, release: 0.5 };
const DEFAULT_LFO      = { enabled: false, rate: 2, depth: 1000, waveform: "sine" };
const DEFAULT_EFFECTS  = {
  delay:  { enabled: false, wet: 0.3, feedback: 0.3, time: 0.25 },
  reverb: { enabled: false, wet: 0.4, room: 0.7 },
};

export default function App() {
  /* ── Password gate ─────────────────────────────────────────── */
  const [unlocked, setUnlocked] = useState(
    () => sessionStorage.getItem("minisynth_unlocked") === "1"
  );
  const [pwInput, setPwInput] = useState("");
  const [pwError, setPwError] = useState(false);

  const handleUnlock = (e) => {
    e.preventDefault();
    if (pwInput === import.meta.env.VITE_APP_PASSWORD) {
      sessionStorage.setItem("minisynth_unlocked", "1");
      setUnlocked(true);
    } else {
      setPwError(true);
      setPwInput("");
    }
  };

  if (!unlocked) {
    return (
      <div className="gate">
        <div className="gate-box">
          <h1 className="gate-title">SammysMiniSynth</h1>
          <p className="gate-subtitle">Polyphonic Synthesizer</p>
          <form className="gate-form" onSubmit={handleUnlock}>
            <input
              className={`gate-input${pwError ? " gate-input--error" : ""}`}
              type="password"
              placeholder="Password"
              value={pwInput}
              autoFocus
              onChange={(e) => { setPwInput(e.target.value); setPwError(false); }}
            />
            <button className="gate-btn" type="submit">Enter</button>
          </form>
          {pwError && <p className="gate-error">Incorrect password.</p>}
        </div>
      </div>
    );
  }

  /* ── Synth app ─────────────────────────────────────────────── */
  const [octave, setOctave]           = useState(4);
  const [activeNotes, setActiveNotes] = useState(new Set());
  const [lastNote, setLastNote]       = useState(null);

  const [waveform, setWaveformState]  = useState("sawtooth");
  const [envelope, setEnvelopeState]  = useState(DEFAULT_ENVELOPE);
  const [cutoff, setCutoff]           = useState(8000);
  const [resonance, setResonance]     = useState(1);
  const [volume, setVolume]           = useState(-6);
  const [lfo, setLfoState]            = useState(DEFAULT_LFO);
  const [effects, setEffectsState]    = useState(DEFAULT_EFFECTS);

  const [midiInfo, setMidiInfo] = useState({
    supported: null, granted: false, inputs: [], selectedId: "", lastNote: null,
  });

  const heldKeys     = useRef(new Set());
  const audioStarted = useRef(false);

  const ensureAudio = useCallback(async () => {
    if (!audioStarted.current) { await startAudio(); audioStarted.current = true; }
  }, []);

  const noteOn = useCallback(async (note, velocity = 1) => {
    await ensureAudio();
    setActiveNotes((prev) => new Set(prev).add(note));
    setLastNote(note);
    triggerAttack(note, velocity);
  }, [ensureAudio]);

  const noteOff = useCallback((note) => {
    setActiveNotes((prev) => { const n = new Set(prev); n.delete(note); return n; });
    triggerRelease(note);
  }, []);

  useEffect(() => {
    const down = async (e) => {
      if (e.repeat || e.ctrlKey || e.altKey || e.metaKey) return;
      const key = e.key.toLowerCase();
      if (key === OCTAVE_DOWN_KEY) { setOctave((o) => Math.max(0, o - 1)); return; }
      if (key === OCTAVE_UP_KEY)   { setOctave((o) => Math.min(8, o + 1)); return; }
      const noteName = KEY_TO_NOTE[key];
      if (!noteName || heldKeys.current.has(key)) return;
      heldKeys.current.add(key);
      await noteOn(noteName === "C+1" ? `C${octave + 1}` : `${noteName}${octave}`);
    };
    const up = (e) => {
      const key = e.key.toLowerCase();
      heldKeys.current.delete(key);
      const noteName = KEY_TO_NOTE[key];
      if (!noteName) return;
      noteOff(noteName === "C+1" ? `C${octave + 1}` : `${noteName}${octave}`);
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup",   up);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); };
  }, [octave, noteOn, noteOff]);

  useEffect(() => {
    initMidi({
      onNoteOn: async (note, velocity) => {
        await ensureAudio();
        setActiveNotes((prev) => new Set(prev).add(note));
        setLastNote(note);
        triggerAttack(note, velocity);
        setMidiInfo((prev) => ({ ...prev, lastNote: note }));
      },
      onNoteOff: (note) => {
        setActiveNotes((prev) => { const n = new Set(prev); n.delete(note); return n; });
        triggerRelease(note);
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

  const handleWaveformChange  = (w)   => { setWaveformState(w); setWaveform(w); };
  const handleEnvelopeChange  = (env) => { setEnvelopeState(env); setEnvelope(env); };
  const handleCutoffChange    = (f)   => { setCutoff(f); setFilterCutoff(f); };
  const handleResonanceChange = (q)   => { setResonance(q); setFilterResonance(q); };
  const handleVolumeChange    = (db)  => { setVolume(db); setMasterVolume(db); };

  const handleLFOChange = (lfo) => {
    setLfoState(lfo);
    setLFORate(lfo.rate); setLFODepth(lfo.depth);
    setLFOWaveform(lfo.waveform); setLFOEnabled(lfo.enabled);
  };

  const handleEffectsChange = (fx) => {
    setEffectsState(fx);
    setDelayWet(fx.delay.enabled ? fx.delay.wet : 0);
    setDelayFeedback(fx.delay.feedback); setDelayTime(fx.delay.time);
    setReverbWet(fx.reverb.enabled ? fx.reverb.wet : 0);
    setReverbRoom(fx.reverb.room);
  };

  const loadPreset = (preset) => {
    releaseAll(); setActiveNotes(new Set());
    handleWaveformChange(preset.waveform);
    handleEnvelopeChange(preset.envelope);
    handleCutoffChange(preset.cutoff);
    handleResonanceChange(preset.resonance);
    handleVolumeChange(preset.volume);
    handleLFOChange({ waveform: "sine", ...preset.lfo });
  };

  const currentState = { waveform, envelope, cutoff, resonance, volume, lfo };

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
            waveform={waveform}   onWaveformChange={handleWaveformChange}
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
            <LFOControls lfo={lfo} onChange={handleLFOChange} />
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
