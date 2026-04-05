import { useState, useEffect, useRef, useCallback } from "react";
import * as Tone from "tone";
import { triggerAttackRelease, releaseAll } from "../audio/synthEngine";
import "./StepSequencer.css";

const NUM_STEPS = 16;

const NOTE_LENGTHS = [
  { value: "32n", label: "1/32" },
  { value: "16n", label: "1/16" },
  { value: "8n",  label: "1/8"  },
  { value: "4n",  label: "1/4"  },
];

// Chromatic notes C2–B5
const SEQUENCER_NOTES = [];
for (let oct = 2; oct <= 5; oct++) {
  for (const n of ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"]) {
    SEQUENCER_NOTES.push(`${n}${oct}`);
  }
}

const DEFAULT_STEPS = Array(NUM_STEPS).fill(null).map((_, i) => ({
  active:   [0, 4, 8, 12].includes(i),
  note:     "C4",
  velocity: 0.8,
  length:   "8n",
}));

export default function StepSequencer() {
  const [steps, setSteps]           = useState(DEFAULT_STEPS);
  const [bpm, setBpm]               = useState(120);
  const [isPlaying, setIsPlaying]   = useState(false);
  const [currentStep, setCurrentStep] = useState(-1);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const stepsRef = useRef(steps);
  useEffect(() => { stepsRef.current = steps; }, [steps]);

  const seqRef = useRef(null);

  useEffect(() => {
    Tone.getTransport().bpm.value = bpm;
  }, [bpm]);

  const stopSequencer = useCallback(() => {
    if (seqRef.current) {
      seqRef.current.dispose();
      seqRef.current = null;
    }
    Tone.getTransport().stop();
    releaseAll();
    setIsPlaying(false);
    setCurrentStep(-1);
  }, []);

  const startSequencer = useCallback(async () => {
    await Tone.start();

    if (seqRef.current) seqRef.current.dispose();

    seqRef.current = new Tone.Sequence(
      (time, stepIndex) => {
        const step = stepsRef.current[stepIndex];
        if (step.active) {
          triggerAttackRelease(step.note, step.length, time, step.velocity);
        }
        const delayMs = Math.max(0, (time - Tone.now()) * 1000);
        setTimeout(() => setCurrentStep(stepIndex), delayMs);
      },
      [...Array(NUM_STEPS).keys()],
      "16n"
    );

    seqRef.current.start(0);
    Tone.getTransport().start();
    setIsPlaying(true);
  }, []);

  useEffect(() => {
    return () => {
      if (seqRef.current) seqRef.current.dispose();
      Tone.getTransport().stop();
    };
  }, []);

  const toggleStep = (i) =>
    setSteps((prev) => prev.map((s, idx) => idx === i ? { ...s, active: !s.active } : s));

  const updateStep = (i, key, val) =>
    setSteps((prev) => prev.map((s, idx) => idx === i ? { ...s, [key]: val } : s));

  const clearAll = () =>
    setSteps((prev) => prev.map((s) => ({ ...s, active: false })));

  return (
    <div className="sequencer">
      <div className="sequencer-header">
        <h3 className="section-title" style={{ margin: 0 }}>Step Sequencer</h3>
        <div className="seq-transport">
          {!isPlaying ? (
            <button className="seq-btn seq-btn--play" onClick={startSequencer}>▶ Play</button>
          ) : (
            <button className="seq-btn seq-btn--stop" onClick={stopSequencer}>■ Stop</button>
          )}
          <div className="slider-row" style={{ flex: 1, margin: 0 }}>
            <label className="slider-label">BPM</label>
            <input
              type="range" className="slider"
              min={40} max={200} step={1} value={bpm}
              onChange={(e) => setBpm(parseInt(e.target.value))}
            />
            <span className="slider-value">{bpm}</span>
          </div>
          <button className="seq-btn" onClick={clearAll}>Clear</button>
          <button
            className={`seq-btn ${showAdvanced ? "seq-btn--active" : ""}`}
            onClick={() => setShowAdvanced((v) => !v)}
          >
            Adv
          </button>
        </div>
      </div>

      <div className="seq-grid-wrapper"><div className="seq-grid">
        {/* Step toggle buttons */}
        <div className="seq-row seq-row--steps">
          {steps.map((step, i) => (
            <button
              key={i}
              className={[
                "seq-step",
                step.active          ? "seq-step--active"  : "",
                i === currentStep    ? "seq-step--playing" : "",
              ].join(" ")}
              onClick={() => toggleStep(i)}
              title={`Step ${i + 1}`}
            >
              {i + 1}
            </button>
          ))}
        </div>

        {/* Note selects */}
        <div className="seq-row seq-row--notes">
          {steps.map((step, i) => (
            <select
              key={i}
              className={`seq-select seq-note ${i === currentStep ? "seq-select--playing" : ""}`}
              value={step.note}
              onChange={(e) => updateStep(i, "note", e.target.value)}
            >
              {SEQUENCER_NOTES.map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          ))}
        </div>

        {/* Advanced: length + velocity */}
        {showAdvanced && (
          <>
            <div className="seq-row seq-row--length">
              {steps.map((step, i) => (
                <select
                  key={i}
                  className="seq-select seq-length"
                  value={step.length}
                  onChange={(e) => updateStep(i, "length", e.target.value)}
                  title={`Step ${i + 1} length`}
                >
                  {NOTE_LENGTHS.map(({ value, label }) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              ))}
            </div>
            <div className="seq-row seq-row--velocity">
              {steps.map((step, i) => (
                <input
                  key={i}
                  type="range"
                  className="seq-velocity"
                  min={0} max={1} step={0.01}
                  value={step.velocity}
                  onChange={(e) => updateStep(i, "velocity", parseFloat(e.target.value))}
                  title={`Vel: ${Math.round(step.velocity * 100)}%`}
                  style={{ "--vel": step.velocity }}
                />
              ))}
            </div>
          </>
        )}
      </div></div>
    </div>
  );
}
