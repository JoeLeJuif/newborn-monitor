import "./Slider.css";

export default function FilterControls({ cutoff, resonance, onCutoffChange, onResonanceChange }) {
  return (
    <div className="section">
      <h3 className="section-title">Filter (Low-pass)</h3>
      <div className="slider-row">
        <label className="slider-label">Cutoff</label>
        <input
          type="range"
          className="slider"
          min={80}
          max={18000}
          step={10}
          value={cutoff}
          onChange={(e) => onCutoffChange(parseFloat(e.target.value))}
        />
        <span className="slider-value">{cutoff >= 1000 ? (cutoff / 1000).toFixed(1) + "kHz" : cutoff + "Hz"}</span>
      </div>
      <div className="slider-row">
        <label className="slider-label">Resonance</label>
        <input
          type="range"
          className="slider"
          min={0.1}
          max={20}
          step={0.1}
          value={resonance}
          onChange={(e) => onResonanceChange(parseFloat(e.target.value))}
        />
        <span className="slider-value">{resonance.toFixed(1)}</span>
      </div>
    </div>
  );
}
