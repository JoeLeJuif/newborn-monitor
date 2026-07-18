// Barre persistante d'un boire en cours. Visible sur toutes les vues à onglets
// (Accueil, Historique, KPI, Partager), juste au-dessus de la navigation basse.
// N'affiche rien s'il n'y a pas de session active. Le setInterval ne sert QU'À
// rafraîchir l'affichage : le temps est recalculé depuis les timestamps.
import { useEffect, useState } from 'react';
import { useFeedingSession } from '../store/FeedingSessionContext.jsx';
import { totalMs, isRunning, isLong } from '../lib/feedingSession.js';
import { formatStopwatch } from '../lib/time.js';
import { sideLabel } from '../lib/constants.js';

export default function ActiveFeedingBar({ navigate, onFinished }) {
  const { session, startOrSwitch, finish } = useFeedingSession();
  const [now, setNow] = useState(() => Date.now());

  const active = !!session;
  useEffect(() => {
    if (!active) return undefined;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [active]);

  if (!session) return null;

  const seconds = totalMs(session, now) / 1000;
  const running = isRunning(session);
  const long = isLong(session, now);
  const otherSide = session.currentSide === 'right' ? 'left' : 'right';

  const handleFinish = () => {
    const ev = finish();
    if (ev) onFinished?.('Boire enregistré');
  };

  return (
    <div className="feeding-bar" role="region" aria-label="Boire en cours">
      <button
        type="button"
        className="feeding-bar-open"
        onClick={() => navigate('feed')}
        aria-label="Ouvrir le boire en cours"
      >
        <span className="fb-ico" aria-hidden="true">🍼</span>
        <span className="fb-text">
          <span className="fb-title">
            Boire en cours{!running ? ' · en pause' : ''}
          </span>
          <span className="fb-sub">
            {session.currentSide ? sideLabel(session.currentSide) : '—'}
            {' · '}
            <strong className="fb-timer">{formatStopwatch(seconds)}</strong>
          </span>
          {long && (
            <span className="fb-warn" role="status">
              Session longue — pense à terminer
            </span>
          )}
        </span>
      </button>

      <div className="feeding-bar-actions">
        {session.currentSide && (
          <button
            type="button"
            className="fb-btn fb-switch"
            onClick={() => startOrSwitch(otherSide)}
            aria-label={`Changer de sein : ${sideLabel(otherSide)}`}
          >
            ⇄ {sideLabel(otherSide)}
          </button>
        )}
        <button
          type="button"
          className="fb-btn fb-finish"
          onClick={handleFinish}
          aria-label="Terminer le boire"
        >
          Terminer
        </button>
      </div>
    </div>
  );
}
