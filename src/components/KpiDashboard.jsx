// Tableau de bord KPI (mobile-first), réutilisable et sans page distincte.
// Tous les calculs viennent de src/lib/stats.js ; tous les graphiques de
// StatCharts.jsx. Ne modifie aucune donnée ; ignore les tombstones (via stats).
import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../store/useStore.jsx';
import { computeDashboard, kpiEvents } from '../lib/stats.js';
import { formatDuration, formatTime, elapsedSince } from '../lib/time.js';
import { Donut, SplitBar, MetricBars, IntervalBars, Heatmap } from './StatCharts.jsx';

const iso = (t) => (t == null ? null : new Date(t).toISOString());
const fmtClock = (t) => (t == null ? '—' : formatTime(iso(t)));
const fmtElapsed = (t, nowMs) => (t == null ? 'aucun' : elapsedSince(iso(t), nowMs));

// Rafraîchit uniquement l'AFFICHAGE des durées écoulées (« il y a 2 h 15 »),
// qui sinon se figeraient tant qu'aucun événement n'est ajouté. Une minute
// suffit : la plus petite unité affichée est la minute. Ce tick ne recalcule
// aucune statistique — computeDashboard reste mémoïsé sur `events`.
function useMinuteTick(intervalMs = 60000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
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

// Le temps écoulé est l'information recherchée en priorité (« ça fait combien
// de temps ? ») : il passe en valeur principale, l'heure exacte devient le
// détail secondaire.
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

// Libellés des paliers de complétude. Volontairement factuels : ils décrivent
// la SAISIE, jamais l'enfant ni la santé.
const COMPLETENESS_LABEL = {
  complete: 'Très complet',
  good: 'Bon',
  partial: 'Partiel',
  insufficient: 'Données insuffisantes',
};

// Répartition des types de boires : libellés alignés sur constants.js.
const BREAKDOWN_ROWS = [
  { key: 'left', label: 'Sein gauche' },
  { key: 'right', label: 'Sein droit' },
  { key: 'both', label: 'Les deux seins' },
  { key: 'bottle', label: 'Biberon' },
  { key: 'other', label: 'Autres' },
];

const dayNarrow = (d) => d.date.toLocaleDateString('fr-CA', { weekday: 'narrow' });

export default function KpiDashboard() {
  const { events } = useStore();
  const d = useMemo(() => computeDashboard(events), [events]);
  const nowMs = useMinuteTick();
  const [metric, setMetric] = useState('feeds');
  const m = METRICS.find((x) => x.key === metric);

  // L'état vide doit refléter ce que les KPI agrègent RÉELLEMENT : un boire
  // encore en cours est exclu des calculs, il ne doit donc pas déclencher un
  // tableau de bord entièrement à zéro (cas de la toute première tétée).
  const hasData = useMemo(() => kpiEvents(events).length > 0, [events]);

  if (!hasData) {
    return (
      <div className="stats-card">
        <p className="help-text">
          Ajoute des boires et des couches pour voir apparaître ton tableau de
          bord.
        </p>
      </div>
    );
  }

  return (
    <>
      {/* 1. En-tête : derniers événements (pas une fenêtre agrégée) */}
      <section className="stats-card">
        <h2 className="stats-h2">Derniers événements</h2>
        <HeadRow icon="🍼" label="Dernier boire" ts={d.last.lastFeedTs} nowMs={nowMs} />
        <HeadRow icon="💧" label="Dernier pipi" ts={d.last.lastPeeTs} nowMs={nowMs} />
        <HeadRow icon="💩" label="Dernière selle" ts={d.last.lastPoopTs} nowMs={nowMs} />
      </section>

      {/* 2. Cartes KPI (24 h) */}
      <h2 className="stats-h2 stats-sub">Dernières 24 h</h2>
      <div className="kpi-grid">
        {/* Règle de visibilité commune à toutes les cartes informatives : une
            carte sans valeur à montrer disparaît, plutôt que d'afficher « — ».
            Les comptages (Boires, Pipis, Selles) restent toujours visibles :
            « 0 » y est une information, pas une absence de donnée. */}
        <Kpi label="Boires" value={d.kpi.feedCount} />
        {d.kpi.breastSec > 0 && (
          <Kpi label="Temps au sein" value={fmtDur(d.kpi.breastSec)} />
        )}
        {d.kpi.avgDurationSec != null && (
          <Kpi label="Durée moyenne" value={fmtDur(d.kpi.avgDurationSec)} />
        )}
        <Kpi label="Pipis" value={d.kpi.pees} />
        <Kpi label="Selles" value={d.kpi.poops} />
        {d.kpi.avgIntervalMs != null && (
          <Kpi label="Intervalle moyen" value={fmtInterval(d.kpi.avgIntervalMs)} />
        )}
        {d.kpi.longestIntervalMs != null && (
          <Kpi label="Plus long intervalle" value={fmtInterval(d.kpi.longestIntervalMs)} />
        )}
        {/* Quantités : rien du tout si aucune n'a été saisie (allaitement
            exclusif), plutôt qu'une carte à zéro. */}
        {d.kpi.mlCount > 0 && (
          <>
            <Kpi label="Quantité totale" value={Math.round(d.kpi.totalMl)} unit="ml" />
            <Kpi label="Quantité moyenne" value={Math.round(d.kpi.avgMl)} unit="ml" />
          </>
        )}
      </div>

      {/* 2b. Répartition des types de boires (24 h) — lignes vides masquées */}
      {d.kpi.feedCount > 0 && (
        <section className="stats-card">
          <h2 className="stats-h2">Types de boires (24 h)</h2>
          <ul className="breakdown">
            {BREAKDOWN_ROWS.filter((r) => d.kpi.breakdown[r.key] > 0).map((r) => (
              <li key={r.key}>
                <span className="breakdown-label">{r.label}</span>
                <span className="breakdown-val">{d.kpi.breakdown[r.key]}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

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
              {d.intervals.length} derniers intervalles · moyenne 24 h{' '}
              {fmtInterval(d.kpi.avgIntervalMs)} · Du début d'un boire au début
              du suivant.
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

      {/* 7. Activité par heure (7 j) */}
      <section className="stats-card">
        <h2 className="stats-h2">Activité par heure (7 j)</h2>
        {d.hourlyTotal > 0 ? (
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

      {/* 9. Complétude des saisies — porte sur les DONNÉES, pas sur l'enfant */}
      <section className="stats-card completeness">
        {/* Vrai titre de section : la carte doit apparaître dans le plan du
            document et dans la navigation par titres des lecteurs d'écran.
            Le style de `.completeness-label` neutralise l'apparence par
            défaut du h2 — le rendu visuel est inchangé. */}
        <h2 className="completeness-label">Complétude des saisies (7 j)</h2>
        <span className={`completeness-level lvl-${d.completeness.level}`}>
          {COMPLETENESS_LABEL[d.completeness.level]}
        </span>
      </section>
    </>
  );
}
