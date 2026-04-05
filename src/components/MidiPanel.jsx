import "./MidiPanel.css";

export default function MidiPanel({ midi, onSelectInput }) {
  const { supported, granted, inputs, selectedId, lastNote } = midi;

  // Still checking
  if (supported === null) {
    return (
      <div className="section midi-panel">
        <h3 className="section-title">MIDI Input</h3>
        <span className="midi-status midi-status--pending">Checking…</span>
      </div>
    );
  }

  if (!supported) {
    return (
      <div className="section midi-panel">
        <h3 className="section-title">MIDI Input</h3>
        <span className="midi-status midi-status--warn">Not supported</span>
        <p className="midi-hint">Web MIDI is available in Chrome and Edge.</p>
      </div>
    );
  }

  if (!granted) {
    return (
      <div className="section midi-panel">
        <h3 className="section-title">MIDI Input</h3>
        <span className="midi-status midi-status--warn">Access denied</span>
        <p className="midi-hint">Allow MIDI access in your browser settings.</p>
      </div>
    );
  }

  return (
    <div className="section midi-panel">
      <h3 className="section-title">MIDI Input</h3>

      <div className="midi-status midi-status--ok">
        <span className="midi-dot midi-dot--ok" />
        Ready
      </div>

      {inputs.length === 0 ? (
        <p className="midi-hint">No MIDI devices detected.</p>
      ) : (
        <select
          className="midi-select"
          value={selectedId}
          onChange={(e) => onSelectInput(e.target.value)}
        >
          <option value="">— Select device —</option>
          {inputs.map((inp) => (
            <option key={inp.id} value={inp.id}>{inp.name}</option>
          ))}
        </select>
      )}

      <div className={`midi-activity ${lastNote ? "midi-activity--on" : ""}`}>
        <span className="midi-dot midi-dot--activity" />
        <span className="midi-last-note">{lastNote || "—"}</span>
      </div>
    </div>
  );
}
