// Formulaire d'enregistrement d'un boire, avec minuterie d'allaitement.
//
// La minuterie (mode « Minuterie », boire au sein, nouveau boire) est pilotée
// par la session GLOBALE (FeedingSessionContext) : elle survit aux changements
// de page et reste visible via la barre persistante. Les modes « Saisie
// manuelle », biberon et la modification d'un boire existant restent locaux et
// enregistrent directement, sans session.
import { useEffect, useState } from 'react';
import { useStore } from '../store/useStore.jsx';
import { useFeedingSession } from '../store/FeedingSessionContext.jsx';
import {
  FEED_TYPES,
  feedTypeMeta,
  FEED_NOTE_SUGGESTIONS,
} from '../lib/constants.js';
import {
  nowISO,
  toLocalInputValue,
  fromLocalInputValue,
  formatStopwatch,
} from '../lib/time.js';
import { totalMs, isRunning } from '../lib/feedingSession.js';

const ML_QUICK = [15, 30, 60, 90, 120];

// Lecture de l'horloge isolée au niveau module (hors du corps du composant).
const readNow = () => Date.now();

export default function FeedForm({ goBack, editId, onSaved }) {
  const { addEvent, updateEvent, getEvent } = useStore();
  const feeding = useFeedingSession();
  const { session } = feeding;
  const existing = editId ? getEvent(editId) : null;

  const [feedType, setFeedType] = useState(
    existing?.feedType || session?.feedingType || 'left',
  );
  const [start, setStart] = useState(existing?.start || nowISO());
  const [amountMl, setAmountMl] = useState(existing?.amountMl || '');
  const [inProgress, setInProgress] = useState(existing?.inProgress || false);
  const [note, setNote] = useState(existing?.note || session?.note || '');
  const [showTimeEdit, setShowTimeEdit] = useState(false);
  // Mode de saisie : minuterie en direct ou saisie manuelle (événement passé).
  // Par défaut manuel lors d'une modification, minuterie pour un nouveau boire.
  const [entryMode, setEntryMode] = useState(editId ? 'manual' : 'timer');
  const [manualMin, setManualMin] = useState(
    existing?.durationSec ? String(Math.round(existing.durationSec / 60)) : '',
  );

  // Horloge locale mise à jour par l'intervalle (uniquement pour l'affichage).
  const [now, setNow] = useState(() => readNow());

  const isBreast = feedTypeMeta(feedType).breast;
  const isBottle = feedTypeMeta(feedType).bottle;

  // La minuterie utilise la session globale : nouveau boire, mode minuterie, sein.
  const timerActive = !editId && entryMode === 'timer' && isBreast;
  const running = timerActive && isRunning(session);
  const activeSide = timerActive ? session?.currentSide ?? null : null;
  const liveSeconds = timerActive && session ? totalMs(session, now) / 1000 : 0;
  // Heure de début affichée : celle de la session active si présente.
  const displayStart = timerActive && session ? session.startedAt : start;

  // Rafraîchit l'affichage de la minuterie chaque seconde quand elle tourne.
  useEffect(() => {
    if (!running) return undefined;
    const id = setInterval(() => setNow(readNow()), 500);
    return () => clearInterval(id);
  }, [running]);

  function selectSide(side) {
    feeding.startOrSwitch(side);
    setNow(readNow());
  }

  function pauseOrResume() {
    if (isRunning(session)) feeding.pause();
    else feeding.resume();
    setNow(readNow());
  }

  function resetTimer() {
    feeding.cancel();
    setNow(readNow());
  }

  function onNoteChange(value) {
    setNote(value);
    if (timerActive && session) feeding.updateNote(value);
  }

  function save() {
    // Boire chronométré en cours : finalisation unique via la session globale.
    if (timerActive && session) {
      const ev = feeding.finish({ note });
      if (!ev) return; // échec de persistance : la bannière informe
      onSaved?.('Boire enregistré');
      goBack();
      return;
    }

    let durationSec = 0;
    let side = null;
    if (isBreast) {
      if (entryMode === 'manual') {
        durationSec = Math.round((Number(manualMin) || 0) * 60);
        // En saisie manuelle, le sein vient du type sélectionné.
        side = feedTypeMeta(feedType).side || null;
      } else {
        // Mode minuterie sans session active : rien n'a été chronométré.
        durationSec = 0;
        side = null;
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
    const ok = editId ? updateEvent(editId, data) : !!addEvent(data);
    if (!ok) return; // échec de persistance : la bannière informe, pas de faux succès
    onSaved?.('Boire enregistré');
    goBack();
  }

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
          onClick={() => setEntryMode('manual')}
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
          <div className="timer-display">{formatStopwatch(liveSeconds)}</div>
          <div className="timer-side-label">
            {activeSide === 'left' && (running ? 'Sein gauche en cours' : 'Sein gauche · en pause')}
            {activeSide === 'right' && (running ? 'Sein droit en cours' : 'Sein droit · en pause')}
            {!activeSide && 'Choisir un sein pour démarrer'}
          </div>
          <div className="timer-sides">
            <button
              className={`side-btn ${activeSide === 'left' ? 'side-active' : ''}`}
              onClick={() => selectSide('left')}
            >
              Gauche
            </button>
            <button
              className={`side-btn ${activeSide === 'right' ? 'side-active' : ''}`}
              onClick={() => selectSide('right')}
            >
              Droit
            </button>
          </div>
          <div className="timer-controls">
            {running ? (
              <button className="btn btn-ghost" onClick={pauseOrResume}>
                ⏸ Pause
              </button>
            ) : (
              activeSide && (
                <button className="btn btn-ghost" onClick={pauseOrResume}>
                  ▶ Reprendre
                </button>
              )
            )}
            {session && (
              <button className="btn btn-ghost" onClick={resetTimer}>
                ↺ Annuler
              </button>
            )}
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
            🕑 Heure de début : {new Date(displayStart).toLocaleString('fr-CA', {
              day: 'numeric',
              month: 'short',
              hour: '2-digit',
              minute: '2-digit',
            })} {showTimeEdit ? '▲' : '▼'}
          </button>
          {showTimeEdit && !timerActive && (
            <input
              className="text-input"
              type="datetime-local"
              value={toLocalInputValue(start)}
              onChange={(e) => setStart(fromLocalInputValue(e.target.value))}
            />
          )}
          {showTimeEdit && timerActive && (
            <p className="help-text">
              L'heure de début est fixée au démarrage de la minuterie.
            </p>
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
              onClick={() => onNoteChange(note === n ? '' : n)}
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
          onChange={(e) => onNoteChange(e.target.value)}
        />
      </div>

      <button className="btn btn-primary btn-save" onClick={save}>
        {editId
          ? 'Enregistrer les modifications'
          : timerActive && session
            ? 'Terminer le boire'
            : 'Enregistrer le boire'}
      </button>
    </div>
  );
}
