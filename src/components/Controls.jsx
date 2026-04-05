import OscillatorControls from "./OscillatorControls";
import EnvelopeControls from "./EnvelopeControls";
import FilterControls from "./FilterControls";
import "./Slider.css";
import "./Controls.css";

export default function Controls({
  osc1, osc2, onOscChange,
  envelope, onEnvelopeChange,
  cutoff, onCutoffChange,
  resonance, onResonanceChange,
  volume, onVolumeChange,
}) {
  return (
    <div className="controls">
      <OscillatorControls osc1={osc1} osc2={osc2} onChange={onOscChange} />
      <EnvelopeControls envelope={envelope} onChange={onEnvelopeChange} />
      <FilterControls
        cutoff={cutoff}
        resonance={resonance}
        onCutoffChange={onCutoffChange}
        onResonanceChange={onResonanceChange}
      />
      <div className="section">
        <h3 className="section-title">Master Volume</h3>
        <div className="slider-row">
          <label className="slider-label">Volume</label>
          <input
            type="range"
            className="slider"
            min={-40}
            max={0}
            step={0.5}
            value={volume}
            onChange={(e) => onVolumeChange(parseFloat(e.target.value))}
          />
          <span className="slider-value">{volume} dB</span>
        </div>
      </div>
    </div>
  );
}
