import "./Slider.css";
import "./LFOControls.css";

const LFO_WAVEFORMS = ["sine", "triangle", "square"];

export const LFO_TARGETS = [
  { value: "filterCutoff",    label: "Filter Cutoff",  depthMax: 8000, depthStep: 10,   depthDefault: 1000 },
  { value: "filterResonance", label: "Filter Reso",    depthMax: 10,   depthStep: 0.1,  depthDefault: 2    },
  { value: "delayWet",        label: "Delay Wet",      depthMax: 0.5,  depthStep: 0.01, depthDefault: 0.2  },
  { value: "reverbWet",       label: "Reverb Wet",     depthMax: 0.5,  depthStep: 0.01, depthDefault: 0.2  },
  { value: "masterVolume",    label: "Volume (dB)",    depthMax: 12,   depthStep: 0.5,  depthDefault: 3    },
];

function getTargetMeta(value) {
  return LFO_TARGETS.find((t) => t.value === value) ?? LFO_TARGETS[0];
}

function LFOPanel({ label, lfo, onChange }) {
  const update = (key, val) => onChange({ ...lfo, [key]: val });

  const meta = getTargetMeta(lfo.target);

  const handleTargetChange = (newTarget) => {
    if (newTarget === lfo.target) return;
    const newMeta = getTargetMeta(newTarget);
    // Reset depth to a sensible default for the new target
    onChange({ ...lfo, target: newTarget, depth: newMeta.depthDefault });
  };

  const depthLabel = meta.depthStep >= 1
    ? `${Math.round(lfo.depth)}`
    : lfo.depth.toFixed(meta.depthStep < 0.05 ? 2 : 1);

  return (
    <div className="section">
      <h3 className="section-title">{label}</h3>

      <div className="lfo-header">
        <button
          className={`lfo-toggle ${lfo.enabled ? "lfo-toggle--on" : ""}`}
          onClick={() => update("enabled", !lfo.enabled)}
        >
          {lfo.enabled ? "ON" : "OFF"}
        </button>
        <div className="lfo-wave-btns">
          {LFO_WAVEFORMS.map((w) => (
            <button
              key={w}
              className={`lfo-wave-btn ${lfo.waveform === w ? "lfo-wave-btn--active" : ""}`}
              onClick={() => update("waveform", w)}
            >
              {w === "triangle" ? "tri" : w}
            </button>
          ))}
        </div>
      </div>

      <div className="slider-row">
        <label className="slider-label">Target</label>
        <select
          className="lfo-target-select"
          value={lfo.target}
          onChange={(e) => handleTargetChange(e.target.value)}
        >
          {LFO_TARGETS.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
      </div>

      <div className="slider-row">
        <label className="slider-label">Rate</label>
        <input
          type="range" className="slider"
          min={0.1} max={20} step={0.1} value={lfo.rate}
          onChange={(e) => update("rate", parseFloat(e.target.value))}
        />
        <span className="slider-value">{lfo.rate.toFixed(1)} Hz</span>
      </div>

      <div className="slider-row">
        <label className="slider-label">Depth</label>
        <input
          type="range" className="slider"
          min={0} max={meta.depthMax} step={meta.depthStep} value={lfo.depth}
          onChange={(e) => update("depth", parseFloat(e.target.value))}
        />
        <span className="slider-value">{depthLabel}</span>
      </div>
    </div>
  );
}

export default function LFOControls({ lfo1, lfo2, onChange1, onChange2 }) {
  return (
    <>
      <LFOPanel label="LFO 1" lfo={lfo1} onChange={onChange1} />
      <LFOPanel label="LFO 2" lfo={lfo2} onChange={onChange2} />
    </>
  );
}
