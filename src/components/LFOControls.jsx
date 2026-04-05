import "./Slider.css";
import "./LFOControls.css";

const LFO_WAVEFORMS = ["sine", "triangle", "square"];

export default function LFOControls({ lfo, onChange }) {
  const update = (key, val) => onChange({ ...lfo, [key]: val });

  return (
    <div className="section">
      <h3 className="section-title">LFO → Filter</h3>

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
          min={0} max={4000} step={10} value={lfo.depth}
          onChange={(e) => update("depth", parseFloat(e.target.value))}
        />
        <span className="slider-value">{lfo.depth} Hz</span>
      </div>
    </div>
  );
}
