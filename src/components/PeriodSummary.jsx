// Résumé par période : aujourd'hui, 24 h, hier, 7 jours.
import { useState } from 'react';
import { useStore } from '../store/useStore.jsx';
import { aggregate, eventsInRange, periodRange } from '../lib/summary.js';
import { formatDuration } from '../lib/time.js';

const PERIODS = [
  { value: 'today', label: "Aujourd'hui" },
  { value: '24h', label: '24 h' },
  { value: 'yesterday', label: 'Hier' },
  { value: '7d', label: '7 jours' },
];

function Line({ label, value }) {
  return (
    <div className="summary-line">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

export default function PeriodSummary() {
  const { events } = useStore();
  const [period, setPeriod] = useState('today');
  const { from, to, label } = periodRange(period);
  const agg = aggregate(eventsInRange(events, from, to));

  return (
    <div className="screen">
      <h1 className="page-title">Résumé</h1>
      <div className="chip-grid four">
        {PERIODS.map((p) => (
          <button
            key={p.value}
            className={`chip ${period === p.value ? 'chip-active' : ''}`}
            onClick={() => setPeriod(p.value)}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="summary-card">
        <h2 className="summary-heading">{label}</h2>
        <Line label="Nombre de boires" value={agg.feeds} />
        <Line label="Temps total au sein" value={formatDuration(agg.breastSec)} />
        <Line label="Quantité totale donnée" value={`${agg.totalMl} ml`} />
        <Line label="Nombre de pipis" value={agg.pees} />
        <Line label="Nombre de cacas" value={agg.poops} />
      </div>

      <p className="disclaimer">
        Résumé des observations consignées. Ne constitue pas un avis médical.
      </p>
    </div>
  );
}
