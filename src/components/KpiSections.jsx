// Sections du tableau de bord KPI, une par bloc affiché.
//
// Chaque section reçoit le même contrat : `{ d, title, nowMs }`, où `d` est le
// résultat de computeDashboard. Aucune section ne calcule quoi que ce soit —
// stats.js reste la source unique de vérité.
//
// Ce fichier n'exporte QUE des composants : la correspondance id → composant
// et les formateurs vivent ailleurs (KpiDashboard.jsx et lib/kpiFormat.js),
// pour ne pas casser le rafraîchissement à chaud de React.
import { useState } from 'react';
import { visibleTiles } from '../lib/kpiRegistry.js';
import { fmtClock, fmtElapsed, fmtDur, fmtInterval, fmtPct, formatTile } from '../lib/kpiFormat.js';
import { Donut, SplitBar, MetricBars, IntervalBars, Heatmap } from './StatCharts.jsx';

const dayNarrow = (day) => day.date.toLocaleDateString('fr-CA', { weekday: 'narrow' });

const BREAKDOWN_ROWS = [
  { key: 'left', label: 'Sein gauche' },
  { key: 'right', label: 'Sein droit' },
  { key: 'both', label: 'Les deux seins' },
  { key: 'bottle', label: 'Biberon' },
  { key: 'other', label: 'Autres' },
];

const COMPLETENESS_LABEL = {
  complete: 'Très complet',
  good: 'Bon',
  partial: 'Partiel',
  insufficient: 'Données insuffisantes',
};

const TREND_METRICS = [
  { key: 'feeds', label: 'Boires', color: 'bar-feed', fmt: (v) => String(v) },
  { key: 'breastSec', label: 'Temps au sein', color: 'bar-feed', fmt: (v) => fmtDur(v) },
  { key: 'pees', label: 'Pipis', color: 'bar-pee', fmt: (v) => String(v) },
  { key: 'poops', label: 'Selles', color: 'bar-poop', fmt: (v) => String(v) },
];

// ── Briques ─────────────────────────────────────────────────────────────────
function Tile({ label, value, unit }) {
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

// Le temps écoulé est l'information recherchée en priorité (« ça fait combien
// de temps ? ») : valeur principale, l'heure exacte en détail secondaire.
function HeadRow({ icon, label, ts, nowMs }) {
  return (
    <div className="head-row">
      <span className="head-ico" aria-hidden="true">{icon}</span>
      <span className="head-label">{label}</span>
      <span className="head-val">
        <strong>{fmtElapsed(ts, nowMs)}</strong>
        <em>{ts == null ? '' : `à ${fmtClock(ts)}`}</em>
      </span>
    </div>
  );
}

// ── Sections ────────────────────────────────────────────────────────────────
export function LastEventsSection({ d, title, nowMs }) {
  return (
    <section className="stats-card">
      <h2 className="stats-h2">{title}</h2>
      <HeadRow icon="🍼" label="Dernier boire" ts={d.last.lastFeedTs} nowMs={nowMs} />
      <HeadRow icon="💧" label="Dernier pipi" ts={d.last.lastPeeTs} nowMs={nowMs} />
      <HeadRow icon="💩" label="Dernière selle" ts={d.last.lastPoopTs} nowMs={nowMs} />
    </section>
  );
}

// Grille des tuiles : itère sur le registre. Une tuile sans valeur à montrer
// n'est pas rendue (règle unifiée du Sprint 2.1).
export function TilesSection({ d, title }) {
  return (
    <>
      <h2 className="stats-h2 stats-sub">{title}</h2>
      <div className="kpi-grid">
        {visibleTiles(d).map((t) => {
          const { value, unit } = formatTile(t.kind, t.value(d));
          return <Tile key={t.id} label={t.label} value={value} unit={unit} />;
        })}
      </div>
    </>
  );
}

export function BreakdownSection({ d, title }) {
  return (
    <section className="stats-card">
      <h2 className="stats-h2">{title}</h2>
      <ul className="breakdown">
        {BREAKDOWN_ROWS.filter((r) => d.kpi.breakdown[r.key] > 0).map((r) => (
          <li key={r.key}>
            <span className="breakdown-label">{r.label}</span>
            <span className="breakdown-val">{d.kpi.breakdown[r.key]}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function TrendSection({ d, title }) {
  const [metric, setMetric] = useState('feeds');
  const m = TREND_METRICS.find((x) => x.key === metric);
  return (
    <section className="stats-card">
      <h2 className="stats-h2">{title}</h2>
      <div className="chip-grid four" role="tablist" aria-label="Métrique">
        {TREND_METRICS.map((x) => (
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
      <MetricBars data={d.trend} valueKey={m.key} labelOf={dayNarrow} color={m.color} formatValue={m.fmt} />
      <p className="chart-cap">
        Un point par jour (heure locale). Le dernier jour est en cours — journée
        partielle.
      </p>
    </section>
  );
}

export function IntervalsSection({ d, title }) {
  return (
    <section className="stats-card">
      <h2 className="stats-h2">{title}</h2>
      {d.intervals.length >= 2 ? (
        <>
          <IntervalBars points={d.intervals} formatGap={(ms) => fmtInterval(ms)} />
          <p className="chart-cap">
            {d.intervals.length} derniers intervalles · moyenne{' '}
            {fmtInterval(d.kpi.avgIntervalMs)} · Du début d'un boire au début du
            suivant.
          </p>
        </>
      ) : (
        <p className="help-text">Pas encore assez de boires pour tracer les intervalles.</p>
      )}
    </section>
  );
}

export function DayNightSection({ d, title }) {
  return (
    <section className="stats-card">
      <h2 className="stats-h2">{title}</h2>
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
  );
}

export function SideSection({ d, title }) {
  return (
    <section className="stats-card">
      <h2 className="stats-h2">{title}</h2>
      {d.side.total > 0 ? (
        <>
          <SplitBar
            ariaSuffix={d.side.estimated ? 'répartition estimée' : undefined}
            segments={[
              { value: d.side.leftSec, className: 'seg-left', label: 'Gauche' },
              { value: d.side.rightSec, className: 'seg-right', label: 'Droite' },
            ]}
          />
          <ul className="legend">
            <li><span className="dot seg-left" /> Gauche · {fmtDur(d.side.leftSec)} · {fmtPct(d.side.leftPct)}</li>
            <li><span className="dot seg-right" /> Droite · {fmtDur(d.side.rightSec)} · {fmtPct(d.side.rightPct)}</li>
          </ul>
          {d.side.estimated && (
            <p className="chart-cap">Répartition estimée pour une partie des boires.</p>
          )}
        </>
      ) : (
        <p className="help-text">Pas de boire au sein chronométré sur la période.</p>
      )}
    </section>
  );
}

export function HourlySection({ d, title }) {
  return (
    <section className="stats-card">
      <h2 className="stats-h2">{title}</h2>
      {d.hourlyTotal > 0 ? (
        <Heatmap hours={d.hourly} />
      ) : (
        <p className="help-text">Aucun boire sur la période.</p>
      )}
    </section>
  );
}

export function InsightsSection({ d, title }) {
  return (
    <section className="stats-card">
      <h2 className="stats-h2">{title}</h2>
      <ul className="insights">
        {d.insights.map((t, i) => (
          <li key={i}>{t}</li>
        ))}
      </ul>
    </section>
  );
}

// Porte sur les DONNÉES saisies, jamais sur l'enfant. Le h2 est stylé pour
// rester visuellement discret (cf. .completeness-label).
export function CompletenessSection({ d, title }) {
  return (
    <section className="stats-card completeness">
      <h2 className="completeness-label">{title}</h2>
      <span className={`completeness-level lvl-${d.completeness.level}`}>
        {COMPLETENESS_LABEL[d.completeness.level]}
      </span>
    </section>
  );
}
