// Formulaire d'enregistrement d'un boire, avec minuterie d'allaitement.
import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store/useStore.jsx';
import {
  FEED_TYPES,
  feedTypeMeta,
  FEED_NOTE_SUGGESTIONS,
} from '../lib/constants.js';
import {
  nowISO,
  toLocalInputValue,
  fromLocalInputValue,
  formatTimer,
} from '../lib/time.js';

const ML_QUICK = [15, 30, 60, 90, 120];

// Lecture de l'horloge isolée au niveau module (hors du corps du composant).
const readNow = () => Date.now();

export default function FeedForm({ goBack, editId, onSaved }) {
  const { addEvent, updateEvent, getEvent } = useStore();
  const existing = editId ? getEvent(editId) : null;

  const [feedType, setFeedType] = useState(existing?.feedType || 'left');
  const [start, setStart] = useState(existing?.start || nowISO());
  const [amountMl, setAmountMl] = useState(existing?.amountMl || '');
  const [inProgress, setInProgress] = useState(existing?.inProgress || false);
  const [note, setNote] = useState(existing?.note || '');
  const [lastSide, setLastSide] = useState(existing?.lastSide || null);
  const [showTimeEdit, setShowTimeEdit] = useState(false);
  // Mode de saisie : minuterie en direct ou saisie manuelle (événement passé).
  // Par défaut manuel lors d'une modification, minuterie pour un nouveau boire.
  const [entryMode, setEntryMode] = useState(editId ? 'manual' : 'timer');
  const [manualMin, setManualMin] = useState(
    existing?.durationSec ? String(Math.round(existing.durationSec / 60)) : '',
  );

  // Minuterie : temps accumulé (s) + segment en cours.
  const [accumulated, setAccumulated] = useState(existing?.durationSec || 0);
  const [running, setRunning] = useState(false);
  const [activeSide, setActiveSide] = useState(null);
  // Début (ms) du segment en cours, en state pour un rendu pur.
  const [segStartMs, setSegStartMs] = useState(null);
  // Horloge locale mise à jour par l'intervalle (évite readNow() au rendu).
  const [now, setNow] = useState(() => readNow());
  const sidesUsed = useRef(new Set());

  const isBreast = feedTypeMeta(feedType).breast;
  const isBottle = feedTypeMeta(feedType).bottle;

  // Rafraîchit l'affichage de la minuterie chaque seconde quand elle tourne.
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setNow(readNow()), 500);
    return () => clearInterval(id);
  }, [running]);

  // Secondes écoulées à un instant donné (fonction pure).
  function secondsAt(nowMs) {
    let total = accumulated;
    if (running && segStartMs) {
      total += (nowMs - segStartMs) / 1000;
    }
    return total;
  }

  function commitSegment() {
    if (running && segStartMs) {
      setAccumulated((a) => a + (readNow() - segStartMs) / 1000);
    }
    setSegStartMs(null);
  }

  function startSide(side) {
    // Si un premier boire démarre, l'heure de début = maintenant (sauf déjà réglée).
    if (!running && accumulated === 0 && sidesUsed.current.size === 0) {
      setStart(nowISO());
    }
    commitSegment();
    sidesUsed.current.add(side);
    setActiveSide(side);
    setLastSide(side);
    setFeedType(sidesUsed.current.size > 1 ? 'both' : side);
    const t = readNow();
    setSegStartMs(t);
    setNow(t);
    setRunning(true);
  }

  function pause() {
    commitSegment();
    setRunning(false);
  }

  function resetTimer() {
    commitSegment();
    setRunning(false);
    setAccumulated(0);
    setActiveSide(null);
    sidesUsed.current = new Set();
  }

  function save() {
    let durationSec = 0;
    let side = null;
    if (isBreast) {
      if (entryMode === 'manual') {
        durationSec = Math.round((Number(manualMin) || 0) * 60);
        // En saisie manuelle, le sein vient du type sélectionné.
        side = feedTypeMeta(feedType).side || null;
      } else {
        durationSec = Math.round(secondsAt(readNow()));
        side = lastSide;
      }
    } else {
      durationSec = existing?.durationSec || 0;
    }
    const data = {
      type: 'feed',
      feedType,
      start,
      durationSec,
      amountMl: amountMl === '' ? null : Number(amountMl),
      inProgress,
      lastSide: isBreast ? side : null,
      note: note.trim(),
    };
    if (editId) updateEvent(editId, data);
    else addEvent(data);
    onSaved?.('Boire enregistré');
    goBack();
  }

  const liveSeconds = secondsAt(now);

  return (
    <div className="screen form-screen">
      <header className="form-header">
        <button className="back-btn" onClick={goBack} aria-label="Retour">
          ‹
        </button>
        <h1>{editId ? 'Modifier le boire' : 'Nouveau boire'}</h1>
      </header>

      <div className="mode-switch" role="tablist" aria-label="Mode de saisie">
        <button
          role="tab"
          aria-selected={entryMode === 'timer'}
          className={`mode-btn ${entryMode === 'timer' ? 'mode-active' : ''}`}
          onClick={() => setEntryMode('timer')}
        >
          ⏱ Minuterie
        </button>
        <button
          role="tab"
          aria-selected={entryMode === 'manual'}
          className={`mode-btn ${entryMode === 'manual' ? 'mode-active' : ''}`}
          onClick={() => {
            setRunning(false);
            setEntryMode('manual');
          }}
        >
          ✎ Saisie manuelle
        </button>
      </div>

      <label className="field-label">Type d'alimentation</label>
      <div className="chip-grid">
        {FEED_TYPES.map((t) => (
          <button
            key={t.value}
            className={`chip ${feedType === t.value ? 'chip-active' : ''}`}
            onClick={() => setFeedType(t.value)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {isBreast && entryMode === 'timer' && (
        <div className="timer-card">
          <div className="timer-display">{formatTimer(liveSeconds)}</div>
          <div className="timer-side-label">
            {activeSide === 'left' && 'Sein gauche en cours'}
            {activeSide === 'right' && 'Sein droit en cours'}
            {!activeSide && 'Choisir un sein pour démarrer'}
          </div>
          <div className="timer-sides">
            <button
              className={`side-btn ${activeSide === 'left' ? 'side-active' : ''}`}
              onClick={() => startSide('left')}
            >
              Gauche
            </button>
            <button
              className={`side-btn ${activeSide === 'right' ? 'side-active' : ''}`}
              onClick={() => startSide('right')}
            >
              Droit
            </button>
          </div>
          <div className="timer-controls">
            {running ? (
              <button className="btn btn-ghost" onClick={pause}>
                ⏸ Pause
              </button>
            ) : (
              activeSide && (
                <button
                  className="btn btn-ghost"
                  onClick={() => startSide(activeSide)}
                >
                  ▶ Reprendre
                </button>
              )
            )}
            <button className="btn btn-ghost" onClick={resetTimer}>
              ↺ Réinitialiser
            </button>
          </div>
        </div>
      )}

      {isBreast && entryMode === 'manual' && (
        <div className="field">
          <label className="field-label">Durée au sein (minutes)</label>
          <input
            className="text-input"
            type="number"
            inputMode="numeric"
            min="0"
            placeholder="ex. 15"
            value={manualMin}
            onChange={(e) => setManualMin(e.target.value)}
          />
        </div>
      )}

      {isBottle && (
        <div className="field">
          <label className="field-label">Quantité (ml)</label>
          <div className="ml-quick">
            {ML_QUICK.map((v) => (
              <button
                key={v}
                className={`chip ${Number(amountMl) === v ? 'chip-active' : ''}`}
                onClick={() => setAmountMl(v)}
              >
                {v}
              </button>
            ))}
          </div>
          <input
            className="text-input"
            type="number"
            inputMode="numeric"
            min="0"
            placeholder="ml"
            value={amountMl}
            onChange={(e) => setAmountMl(e.target.value)}
          />
        </div>
      )}

      {entryMode === 'manual' ? (
        <div className="field">
          <label className="field-label">Date et heure du boire</label>
          <input
            className="text-input"
            type="datetime-local"
            value={toLocalInputValue(start)}
            onChange={(e) => setStart(fromLocalInputValue(e.target.value))}
          />
        </div>
      ) : (
        <div className="field">
          <button
            className="link-btn"
            onClick={() => setShowTimeEdit((v) => !v)}
          >
            🕑 Heure de début : {new Date(start).toLocaleString('fr-CA', {
              day: 'numeric',
              month: 'short',
              hour: '2-digit',
              minute: '2-digit',
            })} {showTimeEdit ? '▲' : '▼'}
          </button>
          {showTimeEdit && (
            <input
              className="text-input"
              type="datetime-local"
              value={toLocalInputValue(start)}
              onChange={(e) => setStart(fromLocalInputValue(e.target.value))}
            />
          )}
        </div>
      )}

      <label className="toggle-row">
        <input
          type="checkbox"
          checked={inProgress}
          onChange={(e) => setInProgress(e.target.checked)}
        />
        <span>Boire encore en cours</span>
      </label>

      <div className="field">
        <label className="field-label">Note (facultative)</label>
        <div className="chip-grid">
          {FEED_NOTE_SUGGESTIONS.map((n) => (
            <button
              key={n}
              className={`chip ${note === n ? 'chip-active' : ''}`}
              onClick={() => setNote(note === n ? '' : n)}
            >
              {n}
            </button>
          ))}
        </div>
        <textarea
          className="text-input"
          rows={2}
          placeholder="Ajouter une note…"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </div>

      <button className="btn btn-primary btn-save" onClick={save}>
        {editId ? 'Enregistrer les modifications' : 'Enregistrer le boire'}
      </button>
    </div>
  );
}
