import "./Slider.css";

const PARAMS = [
  { key: "attack",  label: "Attack",  min: 0.001, max: 2,   step: 0.001 },
  { key: "decay",   label: "Decay",   min: 0.001, max: 2,   step: 0.001 },
  { key: "sustain", label: "Sustain", min: 0,     max: 1,   step: 0.01  },
  { key: "release", label: "Release", min: 0.001, max: 4,   step: 0.001 },
];

export default function EnvelopeControls({ envelope, onChange }) {
  return (
    <div className="section">
      <h3 className="section-title">Envelope (ADSR)</h3>
      {PARAMS.map(({ key, label, min, max, step }) => (
        <div className="slider-row" key={key}>
          <label className="slider-label">{label}</label>
          <input
            type="range"
            className="slider"
            min={min}
            max={max}
            step={step}
            value={envelope[key]}
            onChange={(e) => onChange({ ...envelope, [key]: parseFloat(e.target.value) })}
          />
          <span className="slider-value">{envelope[key].toFixed(2)}s</span>
        </div>
      ))}
    </div>
  );
}
