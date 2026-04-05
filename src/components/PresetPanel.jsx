import { useState } from "react";
import { DEFAULT_PRESETS, getUserPresets, saveUserPreset, deleteUserPreset } from "../presets/presets";
import "./PresetPanel.css";

export default function PresetPanel({ currentState, onLoad }) {
  const [userPresets, setUserPresets] = useState(getUserPresets);
  const [newName, setNewName] = useState("");

  const handleSave = () => {
    const name = newName.trim();
    if (!name) return;
    const preset = { ...currentState, name, id: `user_${Date.now()}` };
    setUserPresets(saveUserPreset(preset));
    setNewName("");
  };

  const handleDelete = (name) => {
    setUserPresets(deleteUserPreset(name));
  };

  return (
    <div className="section preset-panel">
      <h3 className="section-title">Presets</h3>

      <div className="preset-group-label">Built-in</div>
      <div className="preset-list">
        {DEFAULT_PRESETS.map((p) => (
          <button key={p.id} className="preset-btn" onClick={() => onLoad(p)}>
            {p.name}
          </button>
        ))}
      </div>

      {userPresets.length > 0 && (
        <>
          <div className="preset-group-label">Saved</div>
          <div className="preset-user-list">
            {userPresets.map((p) => (
              <div key={p.name} className="preset-user-item">
                <button className="preset-btn preset-btn--user" onClick={() => onLoad(p)}>
                  {p.name}
                </button>
                <button
                  className="preset-delete"
                  onClick={() => handleDelete(p.name)}
                  title="Delete preset"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </>
      )}

      <div className="preset-save">
        <input
          type="text"
          className="preset-input"
          placeholder="Name..."
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") handleSave(); }}
        />
        <button className="preset-save-btn" onClick={handleSave}>
          Save current
        </button>
      </div>
    </div>
  );
}
