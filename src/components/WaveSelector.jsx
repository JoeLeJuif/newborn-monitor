import "./WaveSelector.css";

const WAVEFORMS = ["sine", "square", "sawtooth", "triangle"];

export default function WaveSelector({ value, onChange }) {
  return (
    <div className="section">
      <h3 className="section-title">Waveform</h3>
      <div className="wave-buttons">
        {WAVEFORMS.map((w) => (
          <button
            key={w}
            className={`wave-btn ${value === w ? "wave-btn--active" : ""}`}
            onClick={() => onChange(w)}
          >
            {w}
          </button>
        ))}
      </div>
    </div>
  );
}
