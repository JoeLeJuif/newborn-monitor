// Dashboard Statistiques (mobile-first). Composition légère : tous les calculs
// viennent de src/lib/stats.js, tous les graphiques de StatCharts.jsx.
import { useMemo, useState } from 'react';
import { useStore } from '../store/useStore.jsx';
import { computeDashboard } from '../lib/stats.js';
import { formatDuration, formatTime, elapsedSince } from '../lib/time.js';
import { Donut, SplitBar, MetricBars, IntervalBars, Heatmap } from './StatCharts.jsx';

const iso = (t) => (t == null ? null : new Date(t).toISOString());
const fmtClock = (t) => (t == null ? '—' : formatTime(iso(t)));
const fmtElapsed = (t) => (t == null ? 'aucun' : elapsedSince(iso(t)));
const fmtDur = (sec) => (sec == null ? '—' : formatDuration(Math.round(sec)));
const fmtInterval = (ms) => (ms == null ? '—' : formatDuration(Math.round(ms / 1000)));
const fmtPct = (x) => (x == null ? '—' : `${Math.round(x * 100)} %`);

const METRICS = [
  { key: 'feeds', label: 'Boires', color: 'bar-feed', fmt: (v) => String(v) },
  { key: 'breastSec', label: 'Temps au sein', color: 'bar-feed', fmt: (v) => fmtDur(v) },
  { key: 'pees', label: 'Pipis', color: 'bar-pee', fmt: (v) => String(v) },
  { key: 'poops', label: 'Selles', color: 'bar-poop', fmt: (v) => String(v) },
];

function Kpi({ label, value, unit }) {
  return (
    <div className="kpi-card">
      <div className="kpi-value">
        {value}
        {unit && <span className="kpi-unit"> {unit}</span>}
      </div>
      <div className="kpi-label">{label}</div>
    </div>
  );
}

function HeadRow({ icon, label, ts }) {
  return (
    <div className="head-row">
      <span className="head-ico" aria-hidden="true">{icon}</span>
      <span className="head-label">{label}</span>
      <span className="head-val">
        <strong>{fmtClock(ts)}</strong>
        <em>{fmtElapsed(ts)}</em>
      </span>
    </div>
  );
}

const dayNarrow = (d) => d.date.toLocaleDateString('fr-CA', { weekday: 'narrow' });

export default function Statistics({ goBack }) {
  const { events } = useStore();
  const d = useMemo(() => computeDashboard(events), [events]);
  const [metric, setMetric] = useState('feeds');
  const m = METRICS.find((x) => x.key === metric);

  const hasData = events.length > 0;
  const heatTotal = d.hourly.reduce((a, b) => a + b, 0);

  return (
    <div className="screen form-screen stats-screen">
      <header className="form-header">
        <button className="back-btn" onClick={goBack} aria-label="Retour">‹</button>
        <h1>Statistiques</h1>
      </header>

      {!hasData ? (
        <div className="stats-card">
          <p className="help-text">
            Ajoute des boires et des couches pour voir apparaître ton tableau de
            bord.
          </p>
        </div>
      ) : (
        <>
          {/* 1. En-tête : derniers événements (pas une fenêtre agrégée) */}
          <section className="stats-card">
            <h2 className="stats-h2">Derniers événements</h2>
            <HeadRow icon="🍼" label="Dernier boire" ts={d.last.lastFeedTs} />
            <HeadRow icon="💧" label="Dernier pipi" ts={d.last.lastPeeTs} />
            <HeadRow icon="💩" label="Dernière selle" ts={d.last.lastPoopTs} />
          </section>

          {/* 2. Cartes KPI (24 h) */}
          <h2 className="stats-h2 stats-sub">Dernières 24 h</h2>
          <div className="kpi-grid">
            <Kpi label="Boires" value={d.kpi.feedCount} />
            <Kpi label="Temps au sein" value={fmtDur(d.kpi.breastSec || null)} />
            <Kpi label="Pipis" value={d.kpi.pees} />
            <Kpi label="Selles" value={d.kpi.poops} />
            <Kpi label="Intervalle moyen" value={fmtInterval(d.kpi.avgIntervalMs)} />
            <Kpi label="Plus long intervalle" value={fmtInterval(d.kpi.longestIntervalMs)} />
          </div>

          {/* 3. Tendance 7 jours (une métrique à la fois) */}
          <section className="stats-card">
            <h2 className="stats-h2">Tendance sur 7 jours</h2>
            <div className="chip-grid four" role="tablist" aria-label="Métrique">
              {METRICS.map((x) => (
                <button
                  key={x.key}
                  role="tab"
                  aria-selected={metric === x.key}
                  className={`chip ${metric === x.key ? 'chip-active' : ''}`}
                  onClick={() => setMetric(x.key)}
                >
                  {x.label}
                </button>
              ))}
            </div>
            <MetricBars
              data={d.trend}
              valueKey={m.key}
              labelOf={dayNarrow}
              color={m.color}
              formatValue={m.fmt}
            />
            <p className="chart-cap">
              Un point par jour (heure locale). Le dernier jour est en cours —
              journée partielle.
            </p>
          </section>

          {/* 4. Intervalles entre les boires */}
          <section className="stats-card">
            <h2 className="stats-h2">Intervalles entre les boires</h2>
            {d.intervals.length >= 2 ? (
              <>
                <IntervalBars points={d.intervals} formatGap={(ms) => fmtInterval(ms)} />
                <p className="chart-cap">
                  {d.intervals.length} derniers intervalles · moyenne 24 h {fmtInterval(d.kpi.avgIntervalMs)}
                </p>
              </>
            ) : (
              <p className="help-text">Pas encore assez de boires pour tracer les intervalles.</p>
            )}
          </section>

          {/* 5. Répartition jour / nuit (7 j) */}
          <section className="stats-card">
            <h2 className="stats-h2">Jour / nuit (7 j)</h2>
            {d.dayNight.total > 0 ? (
              <div className="donut-wrap">
                <div className="donut-box">
                  <Donut
                    ariaLabel={`Jour ${fmtPct(d.dayNight.dayPct)}, nuit ${fmtPct(d.dayNight.nightPct)}`}
                    segments={[
                      { value: d.dayNight.day, className: 'seg-day' },
                      { value: d.dayNight.night, className: 'seg-night' },
                    ]}
                  />
                  <div className="donut-center">
                    <strong>{fmtPct(d.dayNight.nightPct)}</strong>
                    <span>nuit</span>
                  </div>
                </div>
                <ul className="legend">
                  <li><span className="dot seg-day" /> Jour (6 h–18 h) · {d.dayNight.day} · {fmtPct(d.dayNight.dayPct)}</li>
                  <li><span className="dot seg-night" /> Nuit (18 h–6 h) · {d.dayNight.night} · {fmtPct(d.dayNight.nightPct)}</li>
                </ul>
              </div>
            ) : (
              <p className="help-text">Aucun boire sur la période.</p>
            )}
          </section>

          {/* 6. Répartition gauche / droite (durée au sein, 7 j) */}
          <section className="stats-card">
            <h2 className="stats-h2">Gauche / droite (durée au sein, 7 j)</h2>
            {d.side.total > 0 ? (
              <>
                <SplitBar
                  segments={[
                    { value: d.side.leftSec, className: 'seg-left', label: 'Gauche' },
                    { value: d.side.rightSec, className: 'seg-right', label: 'Droite' },
                  ]}
                />
                <ul className="legend">
                  <li><span className="dot seg-left" /> Gauche · {fmtDur(d.side.leftSec)} · {fmtPct(d.side.leftPct)}</li>
                  <li><span className="dot seg-right" /> Droite · {fmtDur(d.side.rightSec)} · {fmtPct(d.side.rightPct)}</li>
                </ul>
              </>
            ) : (
              <p className="help-text">Pas de boire au sein chronométré sur la période.</p>
            )}
          </section>

          {/* 7. Activité par heure (7 j) */}
          <section className="stats-card">
            <h2 className="stats-h2">Activité par heure (7 j)</h2>
            {heatTotal > 0 ? (
              <Heatmap hours={d.hourly} />
            ) : (
              <p className="help-text">Aucun boire sur la période.</p>
            )}
          </section>

          {/* 8. Observations (max 3, rien si insuffisant) */}
          {d.insights.length > 0 && (
            <section className="stats-card">
              <h2 className="stats-h2">Observations</h2>
              <ul className="insights">
                {d.insights.map((t, i) => (
                  <li key={i}>{t}</li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}

      <p className="disclaimer">
        Ces statistiques servent au suivi quotidien et ne remplacent pas un avis
        médical.
      </p>
    </div>
  );
}
