// Profil du bébé : prénom, naissance, poids, sexe, photo. Âge calculé.
import { useState } from 'react';
import { useStore } from '../store/useStore.jsx';
import {
  toLocalInputValue,
  fromLocalInputValue,
  formatBabyAge,
} from '../lib/time.js';

export default function BabyProfile({ navigate, goBack, onSaved }) {
  const { baby, setBaby } = useStore();
  const [form, setForm] = useState({ ...baby });

  function set(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function onPhoto(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => set('photo', reader.result);
    reader.readAsDataURL(file);
  }

  function save() {
    setBaby(form);
    onSaved?.('Profil enregistré');
    goBack();
  }

  return (
    <div className="screen form-screen">
      <header className="form-header">
        <button className="back-btn" onClick={goBack} aria-label="Retour">‹</button>
        <h1>Profil du bébé</h1>
      </header>

      <div className="photo-block">
        <label className="photo-avatar">
          {form.photo ? (
            <img src={form.photo} alt="Photo du bébé" />
          ) : (
            <span aria-hidden="true">📷</span>
          )}
          <input type="file" accept="image/*" onChange={onPhoto} hidden />
        </label>
        {form.photo && (
          <button className="link-btn" onClick={() => set('photo', '')}>
            Retirer la photo
          </button>
        )}
      </div>

      {form.birth && (
        <div className="age-banner">Âge : {formatBabyAge(form.birth)}</div>
      )}

      <div className="field">
        <label className="field-label">Prénom</label>
        <input
          className="text-input"
          type="text"
          value={form.name}
          onChange={(e) => set('name', e.target.value)}
          placeholder="Prénom du bébé"
        />
      </div>

      <div className="field">
        <label className="field-label">Date et heure de naissance</label>
        <input
          className="text-input"
          type="datetime-local"
          value={form.birth ? toLocalInputValue(form.birth) : ''}
          onChange={(e) =>
            set('birth', e.target.value ? fromLocalInputValue(e.target.value) : '')
          }
        />
      </div>

      <div className="field-row">
        <div className="field">
          <label className="field-label">Poids à la naissance (g)</label>
          <input
            className="text-input"
            type="number"
            inputMode="numeric"
            value={form.birthWeight}
            onChange={(e) => set('birthWeight', e.target.value)}
            placeholder="g"
          />
        </div>
        <div className="field">
          <label className="field-label">Poids actuel (g)</label>
          <input
            className="text-input"
            type="number"
            inputMode="numeric"
            value={form.currentWeight}
            onChange={(e) => set('currentWeight', e.target.value)}
            placeholder="g"
          />
        </div>
      </div>

      <div className="field">
        <label className="field-label">Sexe (facultatif)</label>
        <div className="chip-grid three">
          {[
            { v: 'f', l: 'Fille' },
            { v: 'm', l: 'Garçon' },
            { v: '', l: 'Non précisé' },
          ].map((o) => (
            <button
              key={o.v || 'none'}
              className={`chip ${form.sex === o.v ? 'chip-active' : ''}`}
              onClick={() => set('sex', o.v)}
            >
              {o.l}
            </button>
          ))}
        </div>
      </div>

      <button className="btn btn-primary btn-save" onClick={save}>
        Enregistrer le profil
      </button>

      <button
        className="btn btn-secondary"
        style={{ marginTop: 12 }}
        onClick={() => navigate('household')}
      >
        📱 Synchronisation multi-appareils
      </button>
    </div>
  );
}
