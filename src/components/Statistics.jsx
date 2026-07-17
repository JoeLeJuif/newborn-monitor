// Statistiques légères (24 h et 7 jours) — mobile-first, cartes + barres CSS.
// Calcul pur depuis les événements existants ; aucune donnée modifiée.
import { useMemo } from 'react';
import { useStore } from '../store/useStore.jsx';
import { computeStats } from '../lib/stats.js';
import { formatDuration, formatTime } from '../lib/time.js';

const fmtDur = (sec) => (sec == null ? '—' : formatDuration(Math.round(sec)));
const fmtMl = (v) => (v == null ? '—' : `${Math.round(v)} ml`);
const fmtInterval = (ms) => (ms == null ? '—' : formatDuration(Math.round(ms / 1000)));
const fmtPerDay = (v) => (v == null ? '—' : v.toFixed(1));
const fmtLast = (ts) => (ts == null ? '—' : formatTime(new Date(ts).toISOString()));

function Line({ label, value }) {
  return (
    <div className="stat-line">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function FeedBlock({ s }) {
  return (
    <>
      <Line label="Nombre de boires" value={s.feedCount} />
      <Line label="Temps total au sein" value={fmtDur(s.breastSec || null)} />
      <Line label="Durée moyenne d’un boire" value={fmtDur(s.avgDurationSec)} />
      <Line label="Quantité totale" value={fmtMl(s.totalMl || null)} />
      <Line
        label="Quantité moyenne (saisies)"
        value={s.avgMl == null ? '—' : `${fmtMl(s.avgMl)} · ${s.mlCount}×`}
      />
      <Line label="Intervalle moyen entre boires" value={fmtInterval(s.avgIntervalMs)} />
      <Line label="Dernier boire" value={fmtLast(s.lastFeedTs)} />
    </>
  );
}

function Breakdown({ b }) {
  const rows = [
    { label: 'Sein gauche', n: b.left },
    { label: 'Sein droit', n: b.right },
    { label: 'Les deux seins', n: b.both },
    { label: 'Biberon / lait exprimé', n: b.bottle },
  ];
  if (b.other > 0) rows.push({ label: 'Autre', n: b.other });
  const max = Math.max(1, ...rows.map((r) => r.n));
  const total = rows.reduce((a, r) => a + r.n, 0);
  if (total === 0) return <p className="help-text">Aucun boire sur la période.</p>;
  return (
    <div className="bars">
      {rows.map((r) => (
        <div className="bar-row" key={r.label}>
          <span className="bar-label">{r.label}</span>
          <span className="bar-track">
            <span
              className="bar-fill bar-feed"
              style={{ width: `${(r.n / max) * 100}%` }}
            />
          </span>
          <span className="bar-value">{r.n}</span>
        </div>
      ))}
    </div>
  );
}

function Trend({ trend }) {
  const maxFeed = Math.max(1, ...trend.map((d) => d.feeds));
  const maxPee = Math.max(1, ...trend.map((d) => d.pees));
  const maxPoop = Math.max(1, ...trend.map((d) => d.poops));
  const label = (d) =>
    d.date.toLocaleDateString('fr-CA', { weekday: 'short' }).replace('.', '');
  return (
    <div className="trend">
      <div className="trend-legend">
        <span><span className="dot bar-feed" /> Boires</span>
        <span><span className="dot bar-pee" /> Pipis</span>
        <span><span className="dot bar-poop" /> Cacas</span>
      </div>
      {trend.map((d) => (
        <div className="trend-day" key={d.key}>
          <span className="trend-label">{label(d)}</span>
          <span className="trend-bars">
            <span className="trend-bar">
              <span className="bar-fill bar-feed" style={{ width: `${(d.feeds / maxFeed) * 100}%` }} />
              <span className="trend-n">{d.feeds}</span>
            </span>
            <span className="trend-bar">
              <span className="bar-fill bar-pee" style={{ width: `${(d.pees / maxPee) * 100}%` }} />
              <span className="trend-n">{d.pees}</span>
            </span>
            <span className="trend-bar">
              <span className="bar-fill bar-poop" style={{ width: `${(d.poops / maxPoop) * 100}%` }} />
              <span className="trend-n">{d.poops}</span>
            </span>
          </span>
        </div>
      ))}
    </div>
  );
}

export default function Statistics({ goBack }) {
  const { events } = useStore();
  const stats = useMemo(() => computeStats(events), [events]);

  return (
    <div className="screen form-screen">
      <header className="form-header">
        <button className="back-btn" onClick={goBack} aria-label="Retour">‹</button>
        <h1>Statistiques</h1>
      </header>

      <section className="stats-card">
        <h2 className="summary-heading">Dernières 24 h</h2>
        <FeedBlock s={stats.last24} />
        <div className="stat-line">
          <span>Pipis / Cacas</span>
          <strong>{stats.last24.pees} / {stats.last24.poops}</strong>
        </div>
      </section>

      <section className="stats-card">
        <h2 className="summary-heading">7 derniers jours</h2>
        <FeedBlock s={stats.week} />
        <Line label="Nombre de pipis" value={stats.week.pees} />
        <Line label="Nombre de selles" value={stats.week.poops} />
        <Line label="Pipis / jour (moy.)" value={fmtPerDay(stats.week.peesPerDay)} />
        <Line label="Selles / jour (moy.)" value={fmtPerDay(stats.week.poopsPerDay)} />
      </section>

      <section className="stats-card">
        <h2 className="summary-heading">Répartition des boires (7 j)</h2>
        <Breakdown b={stats.week.breakdown} />
      </section>

      <section className="stats-card">
        <h2 className="summary-heading">Tendance 7 jours</h2>
        <Trend trend={stats.trend} />
      </section>

      <p className="disclaimer">
        Ces statistiques servent au suivi quotidien et ne remplacent pas un avis
        médical.
      </p>
    </div>
  );
}
