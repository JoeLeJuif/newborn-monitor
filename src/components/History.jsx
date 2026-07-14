// Historique chronologique de tous les événements, regroupés par jour.
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
              <li key={e.id}>
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
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
