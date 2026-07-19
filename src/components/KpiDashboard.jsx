// Tableau de bord KPI (mobile-first).
//
// Rôle réduit à trois choses : choisir la période, calculer une fois, puis
// ITÉRER sur le registre. Aucun calcul ici (stats.js), aucun bloc JSX
// conditionnel par carte (kpiRegistry.js), aucun visuel de section
// (KpiSections.jsx).
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useStore } from '../store/useStore.jsx';
import { computeDashboard, kpiEvents } from '../lib/stats.js';
import { PERIODS, loadKpiPrefs, saveKpiPrefs, periodById } from '../lib/kpiPrefs.js';
import { visibleSections, titleFor } from '../lib/kpiRegistry.js';
import {
  LastEventsSection,
  TilesSection,
  BreakdownSection,
  TrendSection,
  IntervalsSection,
  DayNightSection,
  SideSection,
  HourlySection,
  InsightsSection,
  CompletenessSection,
} from './KpiSections.jsx';

// Correspondance id du registre → composant. C'est elle qui permet au rendu
// d'itérer au lieu d'enchaîner des conditions.
const SECTION_COMPONENTS = {
  last: LastEventsSection,
  tiles: TilesSection,
  breakdown: BreakdownSection,
  trend: TrendSection,
  intervals: IntervalsSection,
  dayNight: DayNightSection,
  side: SideSection,
  hourly: HourlySection,
  insights: InsightsSection,
  completeness: CompletenessSection,
};

// Horloge d'affichage, rafraîchie chaque minute. Elle sert à deux choses :
//   * les durées écoulées (« il y a 2 h 15 ») qui, sinon, se figeraient tant
//     qu'aucun événement n'est ajouté ;
//   * l'ancrage de la fenêtre d'analyse, pour qu'une page laissée ouverte ne
//     continue pas de raisonner sur un « maintenant » périmé.
// Une minute suffit : la plus petite unité affichée est la minute.
function useMinuteTick(intervalMs = 60000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

export default function KpiDashboard() {
  const { events } = useStore();
  const nowMs = useMinuteTick();

  // Préférences locales : lues une seule fois au montage, réécrites à chaque
  // changement. Aucune synchronisation distante.
  const [prefs, setPrefs] = useState(() => loadKpiPrefs());
  const period = periodById(prefs.period);

  const setPeriod = useCallback((id) => {
    setPrefs((prev) => {
      const next = { ...prev, period: id };
      saveKpiPrefs(next);
      return next;
    });
  }, []);

  // Source unique de la fenêtre d'analyse : toutes les statistiques bornées
  // dans le temps en découlent. L'horloge est passée en dépendance plutôt que
  // lue dans le corps du mémo, pour que le calcul reste pur — le recalcul par
  // minute est négligeable (quelques parcours d'un tableau en mémoire).
  const d = useMemo(
    () => computeDashboard(events, nowMs, { periodDays: period.days }),
    [events, nowMs, period.days],
  );

  // L'état vide reflète ce que les KPI agrègent RÉELLEMENT : un boire encore
  // en cours est exclu des calculs et ne doit pas déclencher un tableau de
  // bord à zéro (cas de la toute première tétée).
  const hasData = useMemo(() => kpiEvents(events).length > 0, [events]);

  const selector = (
    <div className="chip-grid period-grid" role="tablist" aria-label="Période analysée">
      {PERIODS.map((p) => (
        <button
          key={p.id}
          role="tab"
          aria-selected={p.id === period.id}
          className={`chip chip-sm ${p.id === period.id ? 'chip-active' : ''}`}
          onClick={() => setPeriod(p.id)}
        >
          {p.label}
        </button>
      ))}
    </div>
  );

  if (!hasData) {
    return (
      <>
        {selector}
        <div className="stats-card">
          <p className="help-text">
            Ajoute des boires et des couches pour voir apparaître ton tableau de
            bord.
          </p>
        </div>
      </>
    );
  }

  return (
    <>
      {selector}
      {visibleSections(d, prefs.hiddenCards).map((entry) => {
        const Section = SECTION_COMPONENTS[entry.id];
        if (!Section) return null; // registre et composants désynchronisés
        return (
          <Section
            key={entry.id}
            d={d}
            nowMs={nowMs}
            title={titleFor(entry, period.label)}
          />
        );
      })}
    </>
  );
}
