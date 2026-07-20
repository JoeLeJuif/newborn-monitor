// Tableau de bord KPI (mobile-first).
//
// Rôle réduit à quatre choses : choisir la période, calculer une fois, ITÉRER
// sur le registre (ordre + favoris + masquage), et exposer un panneau de
// personnalisation. Aucun calcul ici (stats.js), aucun bloc JSX conditionnel
// par carte (kpiRegistry.js), aucun visuel de section (KpiSections.jsx), aucune
// logique de disposition en dur (fonctions pures de kpiRegistry / kpiPrefs).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../store/useStore.jsx';
import { computeDashboard, kpiEvents } from '../lib/stats.js';
import { PERIODS, loadKpiPrefs, saveKpiPrefs, periodById, toggleId } from '../lib/kpiPrefs.js';
import {
  KPI_TILES,
  KPI_SECTIONS,
  dashboardSections,
  titleFor,
  movedGroupOrder,
  arrangedIds,
} from '../lib/kpiRegistry.js';
import KpiCustomize from './KpiCustomize.jsx';
import {
  LastEventsSection,
  TilesSection,
  ClustersSection,
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
  clusters: ClustersSection,
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

  const [panelOpen, setPanelOpen] = useState(false);

  // Confirmation « enregistré », temporisée : des clics rapprochés ne
  // déclenchent qu'un seul message, à la fin.
  const [saved, setSaved] = useState('');
  const savedTimer = useRef(null);
  const flashSaved = useCallback(() => {
    setSaved('Affichage enregistré sur cet appareil.');
    clearTimeout(savedTimer.current);
    savedTimer.current = setTimeout(() => setSaved(''), 2200);
  }, []);
  useEffect(() => () => clearTimeout(savedTimer.current), []);

  const setPeriod = useCallback((id) => {
    setPrefs((prev) => {
      const next = { ...prev, period: id };
      saveKpiPrefs(next);
      return next;
    });
  }, []);

  // Toute mutation de disposition passe ici : applique, persiste, confirme.
  const applyLayout = useCallback(
    (updater) => {
      setPrefs((prev) => {
        const next = updater(prev);
        saveKpiPrefs(next);
        return next;
      });
      flashSaved();
    },
    [flashSaved],
  );

  const ops = useMemo(
    () => ({
      onToggleHidden: (id) =>
        applyLayout((p) => ({ ...p, hiddenCards: toggleId(p.hiddenCards, id) })),
      onToggleFavorite: (id) =>
        applyLayout((p) => ({ ...p, favorites: toggleId(p.favorites, id) })),
      onMove: (group, id, dir) =>
        applyLayout((p) => {
          const list = group === 'tiles' ? KPI_TILES : KPI_SECTIONS;
          const other = group === 'tiles' ? KPI_SECTIONS : KPI_TILES;
          const moved = movedGroupOrder(list, p.order, p.favorites, id, dir);
          const rest = arrangedIds(other, p.order, p.favorites);
          // On réécrit un `order` plat complet et non ambigu pour les 2 groupes.
          const order = group === 'tiles' ? [...moved, ...rest] : [...rest, ...moved];
          return { ...p, order };
        }),
      onReset: () =>
        applyLayout((p) => ({ ...p, hiddenCards: [], order: [], favorites: [] })),
    }),
    [applyLayout],
  );

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

  const favSet = new Set(prefs.favorites || []);

  // La barre d'outils (période + Personnaliser) est toujours présente : ni le
  // sélecteur ni l'accès à la personnalisation ne sont masquables.
  const toolbar = (
    <div className="kpi-toolbar">
      <div className="chip-grid period-grid" role="group" aria-label="Période analysée">
        {PERIODS.map((p) => (
          <button
            key={p.id}
            type="button"
            aria-pressed={p.id === period.id}
            className={`chip chip-sm ${p.id === period.id ? 'chip-active' : ''}`}
            onClick={() => setPeriod(p.id)}
          >
            {p.label}
          </button>
        ))}
      </div>
      <button
        type="button"
        className="btn-customize"
        aria-haspopup="dialog"
        onClick={() => setPanelOpen(true)}
      >
        Personnaliser
      </button>
    </div>
  );

  const panel = (
    <KpiCustomize
      open={panelOpen}
      onClose={() => setPanelOpen(false)}
      prefs={prefs}
      periodLabel={period.label}
      ops={ops}
      savedMessage={saved}
    />
  );

  if (!hasData) {
    return (
      <>
        {toolbar}
        {panel}
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
      {toolbar}
      {panel}
      {dashboardSections(d, prefs).map((entry) => {
        const Section = SECTION_COMPONENTS[entry.id];
        if (!Section) return null; // registre et composants désynchronisés
        return (
          <Section
            key={entry.id}
            d={d}
            nowMs={nowMs}
            prefs={prefs}
            favorite={favSet.has(entry.id)}
            title={titleFor(entry, period.label)}
          />
        );
      })}
    </>
  );
}
