// Préférences locales du tableau de bord KPI.
//
// Fichier volontairement ISOLÉ, avec sa propre clé de stockage : la couche de
// persistance des événements (storage.js), la synchronisation et Supabase ne
// sont pas touchées. Ces préférences sont purement locales à l'appareil et ne
// sont jamais envoyées à un serveur — un réglage d'affichage n'a pas à voyager.
//
// Même patron défensif que feedingSession.js : lecture tolérante (JSON
// invalide, clé absente, valeurs inconnues → défauts), écriture « best
// effort » (un quota dépassé ne doit jamais casser l'affichage).

export const KPI_PREFS_KEY = 'nt_kpi_prefs_v1';
export const KPI_PREFS_VERSION = 1;

// Périodes proposées. `days: null` = « depuis le premier événement ».
export const PERIODS = [
  { id: '24h', label: '24 h', days: 1 },
  { id: '3d', label: '3 jours', days: 3 },
  { id: '7d', label: '7 jours', days: 7 },
  { id: '30d', label: '30 jours', days: 30 },
  { id: 'all', label: 'Tout', days: null },
];

// 24 h = comportement historique des cartes du tableau de bord.
export const DEFAULT_PERIOD_ID = '24h';

export function periodById(id) {
  return PERIODS.find((p) => p.id === id) || PERIODS.find((p) => p.id === DEFAULT_PERIOD_ID);
}

// Les trois listes sont RÉSERVÉES : elles ne sont pas encore exploitées par
// l'interface, mais elles sont déjà lues, normalisées et persistées, pour que
// les sprints suivants n'aient pas à faire migrer le format.
export const DEFAULT_KPI_PREFS = Object.freeze({
  v: KPI_PREFS_VERSION,
  period: DEFAULT_PERIOD_ID,
  hiddenCards: [], // ids de cartes masquées         (réservé)
  order: [], // ordre personnalisé des cartes  (réservé)
  favorites: [], // cartes épinglées                (réservé)
});

const asIdList = (v) =>
  Array.isArray(v) ? v.filter((x) => typeof x === 'string' && x.length > 0) : [];

// Complète et assainit des préférences venues du stockage. Toute valeur
// inconnue retombe sur le défaut plutôt que de faire échouer la lecture.
export function normalizeKpiPrefs(raw) {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_KPI_PREFS };
  const known = PERIODS.some((p) => p.id === raw.period);
  return {
    v: KPI_PREFS_VERSION,
    period: known ? raw.period : DEFAULT_PERIOD_ID,
    hiddenCards: asIdList(raw.hiddenCards),
    order: asIdList(raw.order),
    favorites: asIdList(raw.favorites),
  };
}

export function loadKpiPrefs() {
  let raw;
  try {
    raw = globalThis.localStorage?.getItem(KPI_PREFS_KEY);
  } catch {
    return { ...DEFAULT_KPI_PREFS };
  }
  if (!raw) return { ...DEFAULT_KPI_PREFS };
  try {
    return normalizeKpiPrefs(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_KPI_PREFS }; // JSON corrompu : on repart des défauts
  }
}

export function saveKpiPrefs(prefs) {
  try {
    globalThis.localStorage?.setItem(KPI_PREFS_KEY, JSON.stringify(normalizeKpiPrefs(prefs)));
  } catch {
    // Best effort : une préférence d'affichage ne doit jamais bloquer l'app.
  }
}

export function resetKpiPrefs() {
  try {
    globalThis.localStorage?.removeItem(KPI_PREFS_KEY);
  } catch {
    // ignore
  }
  return { ...DEFAULT_KPI_PREFS };
}
