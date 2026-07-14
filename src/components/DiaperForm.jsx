// Formulaire d'enregistrement d'une couche (pipi et/ou caca).
import { useState } from 'react';
import { useStore } from '../store/useStore.jsx';
import {
  AMOUNTS,
  POOP_COLORS,
  POOP_TEXTURES,
} from '../lib/constants.js';
import {
  nowISO,
  toLocalInputValue,
  fromLocalInputValue,
} from '../lib/time.js';

export default function DiaperForm({ goBack, editId, preset, onSaved }) {
  const { addEvent, updateEvent, getEvent } = useStore();
  const existing = editId ? getEvent(editId) : null;

  const [pee, setPee] = useState(
    existing ? existing.pee : preset === 'pee' || preset === 'both',
  );
  const [poop, setPoop] = useState(
    existing ? existing.poop : preset === 'poop' || preset === 'both',
  );
  const [time, setTime] = useState(existing?.time || nowISO());
  const [peeAmount, setPeeAmount] = useState(existing?.peeAmount || 'medium');
  const [poopAmount, setPoopAmount] = useState(existing?.poopAmount || 'medium');
  const [poopColor, setPoopColor] = useState(existing?.poopColor || 'mustard');
  const [poopTexture, setPoopTexture] = useState(existing?.poopTexture || 'pasty');
  const [note, setNote] = useState(existing?.note || '');

  function save() {
    if (!pee && !poop) return;
    const data = {
      type: 'diaper',
      time,
      pee,
      poop,
      peeAmount: pee ? peeAmount : null,
      poopAmount: poop ? poopAmount : null,
      poopColor: poop ? poopColor : null,
      poopTexture: poop ? poopTexture : null,
      note: note.trim(),
    };
    if (editId) updateEvent(editId, data);
    else addEvent(data);
    onSaved?.('Couche enregistrée');
    goBack();
  }

  return (
    <div className="screen form-screen">
      <header className="form-header">
        <button className="back-btn" onClick={goBack} aria-label="Retour">
          ‹
        </button>
        <h1>{editId ? 'Modifier la couche' : 'Nouvelle couche'}</h1>
      </header>

      <div className="diaper-toggles">
        <button
          className={`diaper-big ${pee ? 'diaper-on diaper-pee' : ''}`}
          onClick={() => setPee((v) => !v)}
          aria-pressed={pee}
        >
          <span className="big-emoji" aria-hidden="true">💧</span>
          Pipi
          <span className="diaper-state">{pee ? '✓' : ''}</span>
        </button>
        <button
          className={`diaper-big ${poop ? 'diaper-on diaper-poop' : ''}`}
          onClick={() => setPoop((v) => !v)}
          aria-pressed={poop}
        >
          <span className="big-emoji" aria-hidden="true">💩</span>
          Caca
          <span className="diaper-state">{poop ? '✓' : ''}</span>
        </button>
      </div>

      {pee && (
        <div className="field card-section">
          <label className="field-label">Quantité de pipi</label>
          <div className="chip-grid three">
            {AMOUNTS.map((a) => (
              <button
                key={a.value}
                className={`chip ${peeAmount === a.value ? 'chip-active' : ''}`}
                onClick={() => setPeeAmount(a.value)}
              >
                {a.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {poop && (
        <div className="field card-section">
          <label className="field-label">Quantité de caca</label>
          <div className="chip-grid three">
            {AMOUNTS.map((a) => (
              <button
                key={a.value}
                className={`chip ${poopAmount === a.value ? 'chip-active' : ''}`}
                onClick={() => setPoopAmount(a.value)}
              >
                {a.label}
              </button>
            ))}
          </div>
          <label className="field-label">Couleur</label>
          <div className="chip-grid">
            {POOP_COLORS.map((c) => (
              <button
                key={c.value}
                className={`chip ${poopColor === c.value ? 'chip-active' : ''}`}
                onClick={() => setPoopColor(c.value)}
              >
                {c.label}
              </button>
            ))}
          </div>
          <label className="field-label">Texture</label>
          <div className="chip-grid">
            {POOP_TEXTURES.map((t) => (
              <button
                key={t.value}
                className={`chip ${poopTexture === t.value ? 'chip-active' : ''}`}
                onClick={() => setPoopTexture(t.value)}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="field">
        <label className="field-label">Date et heure</label>
        <input
          className="text-input"
          type="datetime-local"
          value={toLocalInputValue(time)}
          onChange={(e) => setTime(fromLocalInputValue(e.target.value))}
        />
        <p className="field-hint">
          Par défaut maintenant — modifie-la pour une couche passée.
        </p>
      </div>

      <div className="field">
        <label className="field-label">Note (facultative)</label>
        <textarea
          className="text-input"
          rows={2}
          placeholder="Ajouter une note…"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </div>

      <button
        className="btn btn-primary btn-save"
        onClick={save}
        disabled={!pee && !poop}
      >
        {editId ? 'Enregistrer les modifications' : 'Enregistrer la couche'}
      </button>
    </div>
  );
}
