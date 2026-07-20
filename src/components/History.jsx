// Historique chronologique de tous les événements, regroupés par jour.
import { Fragment } from 'react';
import { useStore } from '../store/useStore.jsx';
import { sortedByTimeDesc, eventTime } from '../lib/summary.js';
import {
  formatTime,
  formatDayHeading,
  dayKey,
  formatDuration,
} from '../lib/time.js';
import {
  feedTypeLabel,
  feedTypeMeta,
  amountLabel,
} from '../lib/constants.js';
import { detectClusterFeedings } from '../lib/clusterFeeding.js';

// Libellé français du niveau de confiance renvoyé par le moteur.
const CONFIDENCE_LABEL = { low: 'faible', medium: 'moyenne', high: 'élevée' };

function eventIcon(e) {
  if (e.type === 'feed') return '🍼';
  if (e.pee && e.poop) return '💧💩';
  if (e.pee) return '💧';
  return '💩';
}

function eventSummary(e) {
  if (e.type === 'feed') {
    const parts = [feedTypeLabel(e.feedType)];
    if (feedTypeMeta(e.feedType).breast && e.durationSec)
      parts.push(formatDuration(e.durationSec));
    if (e.amountMl) parts.push(`${e.amountMl} ml`);
    if (e.inProgress) parts.push('en cours');
    return parts.join(' · ');
  }
  const label = e.pee && e.poop ? 'Pipi + caca' : e.pee ? 'Pipi' : 'Caca';
  const details = [];
  if (e.poop) details.push(amountLabel(e.poopAmount));
  else if (e.pee) details.push(amountLabel(e.peeAmount));
  return `${label}${details.length ? ' · ' + details.join(' · ') : ''}`;
}

export default function History({ navigate }) {
  const { events } = useStore();
  const ordered = sortedByTimeDesc(events);

  // Tétées groupées (Lot 1) : détection via le moteur existant (aucune logique
  // ici). La carte d'un épisode s'affiche au-dessus de ses boires ; comme la
  // liste est du plus récent au plus ancien, l'ancre est le boire le plus
  // récent de l'épisode (dernier de cluster.events, trié en ordre croissant).
  // Les boires restent affichés normalement en dessous (aucun regroupement).
  const clusterByAnchorId = new Map();
  for (const c of detectClusterFeedings(events)) {
    const anchor = c.events[c.events.length - 1];
    if (anchor && anchor.id != null) clusterByAnchorId.set(anchor.id, c);
  }

  if (ordered.length === 0) {
    return (
      <div className="screen">
        <h1 className="page-title">Historique</h1>
        <p className="empty">Aucun événement pour l'instant.</p>
      </div>
    );
  }

  // Regroupement par jour.
  const groups = [];
  let currentKey = null;
  for (const e of ordered) {
    const t = eventTime(e);
    const k = dayKey(t);
    if (k !== currentKey) {
      currentKey = k;
      groups.push({ key: k, heading: formatDayHeading(t), items: [] });
    }
    groups[groups.length - 1].items.push(e);
  }

  return (
    <div className="screen">
      <h1 className="page-title">Historique</h1>
      {groups.map((g) => (
        <div key={g.key} className="day-group">
          <h2 className="day-heading">{g.heading}</h2>
          <ul className="event-list">
            {g.items.map((e) => (
              <Fragment key={e.id}>
                {clusterByAnchorId.has(e.id) && (
                  <li>
                    <div className="event-row cluster-banner">
                      <span className="event-icon" aria-hidden="true">🍼</span>
                      <span className="event-body">
                        <span className="event-summary">
                          Tétée groupée · {clusterByAnchorId.get(e.id).feedCount} boires
                        </span>
                        <span className="event-note">
                          {formatTime(clusterByAnchorId.get(e.id).startAt)} →{' '}
                          {formatTime(clusterByAnchorId.get(e.id).endAt)} · confiance{' '}
                          {CONFIDENCE_LABEL[clusterByAnchorId.get(e.id).confidence]}
                        </span>
                      </span>
                    </div>
                  </li>
                )}
                <li>
                <button
                  className="event-row"
                  onClick={() => navigate('event', { id: e.id })}
                >
                  <span className="event-icon" aria-hidden="true">
                    {eventIcon(e)}
                  </span>
                  <span className="event-body">
                    <span className="event-summary">{eventSummary(e)}</span>
                    {e.note && <span className="event-note">{e.note}</span>}
                  </span>
                  <span className="event-time">{formatTime(eventTime(e))}</span>
                </button>
                </li>
              </Fragment>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
