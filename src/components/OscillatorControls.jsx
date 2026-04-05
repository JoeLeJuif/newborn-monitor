import "./OscillatorControls.css";

const WAVEFORMS = ["sine", "square", "sawtooth", "triangle"];

export default function OscillatorControls({ osc1, osc2, onChange }) {
  const set1 = (patch) => onChange({ osc1: { ...osc1, ...patch }, osc2 });
  const set2 = (patch) => onChange({ osc1, osc2: { ...osc2, ...patch } });

  return (
    <div className="section osc-section">
      <h3 className="section-title">Oscillators</h3>
      <div className="osc-cols">

        {/* ── OSC 1 ── */}
        <div className="osc-col">
          <div className="osc-col-label">OSC 1</div>
          <div className="osc-waves">
            {WAVEFORMS.map((w) => (
              <button
                key={w}
                className={`ctrl-btn${osc1.waveform === w ? " ctrl-btn--active" : ""}`}
                onClick={() => set1({ waveform: w })}
              >
                {w}
              </button>
            ))}
          </div>
          <div className="slider-row">
            <label className="slider-label">Level</label>
            <input
              type="range" className="slider"
              min={0} max={1} step={0.01}
              value={osc1.level}
              onChange={(e) => set1({ level: parseFloat(e.target.value) })}
            />
            <span className="slider-value">{Math.round(osc1.level * 100)}%</span>
          </div>
        </div>

        {/* ── OSC 2 ── */}
        <div className="osc-col">
          <div className="osc-col-label">
            OSC 2
            <button
              className={`osc-toggle${osc2.enabled ? " osc-toggle--on" : ""}`}
              onClick={() => set2({ enabled: !osc2.enabled })}
            >
              {osc2.enabled ? "ON" : "OFF"}
            </button>
          </div>
          <div className={`osc-col-body${!osc2.enabled ? " osc-col-body--off" : ""}`}>
            <div className="osc-waves">
              {WAVEFORMS.map((w) => (
                <button
                  key={w}
                  className={`ctrl-btn${osc2.waveform === w ? " ctrl-btn--active" : ""}`}
                  onClick={() => osc2.enabled && set2({ waveform: w })}
                >
                  {w}
                </button>
              ))}
            </div>
            <div className="slider-row">
              <label className="slider-label">Level</label>
              <input
                type="range" className="slider"
                min={0} max={1} step={0.01}
                value={osc2.level}
                onChange={(e) => set2({ level: parseFloat(e.target.value) })}
                disabled={!osc2.enabled}
              />
              <span className="slider-value">{Math.round(osc2.level * 100)}%</span>
            </div>
            <div className="slider-row">
              <label className="slider-label">Detune</label>
              <input
                type="range" className="slider"
                min={-50} max={50} step={1}
                value={osc2.detune}
                onChange={(e) => set2({ detune: parseInt(e.target.value) })}
                disabled={!osc2.enabled}
              />
              <span className="slider-value">
                {osc2.detune > 0 ? "+" : ""}{osc2.detune}&cent;
              </span>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
