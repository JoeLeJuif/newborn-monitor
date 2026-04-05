import "./Slider.css";
import "./EffectsControls.css";

export default function EffectsControls({ effects, onChange }) {
  const updateDelay = (key, val) =>
    onChange({ ...effects, delay: { ...effects.delay, [key]: val } });

  const updateReverb = (key, val) =>
    onChange({ ...effects, reverb: { ...effects.reverb, [key]: val } });

  const { delay, reverb } = effects;

  return (
    <>
      {/* Delay */}
      <div className="section">
        <h3 className="section-title">Delay</h3>
        <div className="fx-header">
          <button
            className={`fx-toggle ${delay.enabled ? "fx-toggle--on" : ""}`}
            onClick={() => updateDelay("enabled", !delay.enabled)}
          >
            {delay.enabled ? "ON" : "OFF"}
          </button>
        </div>
        <div className="slider-row">
          <label className="slider-label">Wet</label>
          <input
            type="range" className="slider"
            min={0} max={1} step={0.01} value={delay.wet}
            onChange={(e) => updateDelay("wet", parseFloat(e.target.value))}
          />
          <span className="slider-value">{Math.round(delay.wet * 100)}%</span>
        </div>
        <div className="slider-row">
          <label className="slider-label">Feedback</label>
          <input
            type="range" className="slider"
            min={0} max={0.9} step={0.01} value={delay.feedback}
            onChange={(e) => updateDelay("feedback", parseFloat(e.target.value))}
          />
          <span className="slider-value">{Math.round(delay.feedback * 100)}%</span>
        </div>
        <div className="slider-row">
          <label className="slider-label">Time</label>
          <input
            type="range" className="slider"
            min={0.01} max={0.75} step={0.01} value={delay.time}
            onChange={(e) => updateDelay("time", parseFloat(e.target.value))}
          />
          <span className="slider-value">{delay.time.toFixed(2)}s</span>
        </div>
      </div>

      {/* Reverb */}
      <div className="section">
        <h3 className="section-title">Reverb</h3>
        <div className="fx-header">
          <button
            className={`fx-toggle ${reverb.enabled ? "fx-toggle--on" : ""}`}
            onClick={() => updateReverb("enabled", !reverb.enabled)}
          >
            {reverb.enabled ? "ON" : "OFF"}
          </button>
        </div>
        <div className="slider-row">
          <label className="slider-label">Wet</label>
          <input
            type="range" className="slider"
            min={0} max={1} step={0.01} value={reverb.wet}
            onChange={(e) => updateReverb("wet", parseFloat(e.target.value))}
          />
          <span className="slider-value">{Math.round(reverb.wet * 100)}%</span>
        </div>
        <div className="slider-row">
          <label className="slider-label">Room</label>
          <input
            type="range" className="slider"
            min={0.1} max={0.99} step={0.01} value={reverb.room}
            onChange={(e) => updateReverb("room", parseFloat(e.target.value))}
          />
          <span className="slider-value">{reverb.room.toFixed(2)}</span>
        </div>
      </div>
    </>
  );
}
