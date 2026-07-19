// Statistiques légères calculées à partir des événements existants.
//
// Règles :
//  * ne modifie jamais les événements sources ;
//  * ignore les événements supprimés (tombstones) et les entrées invalides ;
//  * gère les champs manquants et les anciennes structures ;
//  * une valeur absente n'est PAS comptée comme zéro dans les moyennes
//    (le dénominateur ne compte que les entrées réellement renseignées) ;
//  * aucune division par zéro (renvoie null quand il n'y a rien à moyenner) ;
//  * dates locales (regroupement par jour via dayKey).
import { feedTypeMeta } from './constants.js';
import { eventTime } from './summary.js';
import { dayKey } from './time.js';

const DAY_MS = 86400000;

function ts(ev) {
  return new Date(eventTime(ev)).getTime();
}

// Prédicat unique « événement exploitable par les KPI ». Source de vérité
// partagée par TOUS les calculs de ce fichier, pour éviter que les filtres
// divergent silencieusement.
//
// Exclut : entrées nulles, tombstones (deleted), types hors KPI, horodatage
// invalide, et les boires EN COURS (inProgress) dont la durée n'est pas encore
// définitive. Un boire en cours reste visible dans l'Historique et dans
// l'éditeur d'événement ; il n'est simplement jamais agrégé.
//
// Compatibilité : le test est `inProgress === true` (strict), donc les anciens
// événements dépourvus du champ restent inclus.
export function isKpiEvent(e) {
  if (!e || e.deleted) return false;
  if (e.type !== 'feed' && e.type !== 'diaper') return false;
  if (e.type === 'feed' && e.inProgress === true) return false;
  return Number.isFinite(ts(e));
}

// Liste filtrée réutilisable (l'entrée n'est jamais mutée).
export function kpiEvents(events) {
  return (Array.isArray(events) ? events : []).filter(isKpiEvent);
}

// Événements exploitables compris dans [fromMs, toMs].
function inWindow(events, fromMs, toMs) {
  return kpiEvents(events).filter((e) => {
    const t = ts(e);
    return t >= fromMs && t <= toMs;
  });
}

// Dernier boire exploitable STRICTEMENT antérieur à fromMs. Sert d'ancre pour
// que le premier intervalle d'une fenêtre ne soit pas perdu (cf. windowStats).
function lastFeedBefore(events, fromMs) {
  let best = null;
  for (const e of kpiEvents(events)) {
    if (e.type !== 'feed') continue;
    const t = ts(e);
    if (t < fromMs && (best == null || t > best)) best = t;
  }
  return best;
}

function mean(values) {
  if (!values.length) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

// Statistiques d'une fenêtre temporelle [fromMs, toMs].
export function windowStats(events, fromMs, toMs, dayCount) {
  const win = inWindow(events, fromMs, toMs);
  const feeds = win.filter((e) => e.type === 'feed');
  const diapers = win.filter((e) => e.type === 'diaper');

  // Durées au sein : seulement les boires au sein avec une durée renseignée.
  const breastFeeds = feeds.filter((e) => feedTypeMeta(e.feedType).breast);
  const durations = feeds
    .map((e) => Number(e.durationSec))
    .filter((d) => Number.isFinite(d) && d > 0);
  const breastSec = breastFeeds
    .map((e) => Number(e.durationSec))
    .filter((d) => Number.isFinite(d) && d > 0)
    .reduce((a, b) => a + b, 0);

  // Quantités : seulement les boires où une quantité est réellement saisie.
  const amounts = feeds
    .map((e) => (e.amountMl == null ? null : Number(e.amountMl)))
    .filter((v) => Number.isFinite(v));

  // Intervalles entre boires, mesurés DÉBUT → DÉBUT. Définition conservée pour
  // ce sprint ; le temps de jeûne réel (fin → début) relève d'une décision
  // produit distincte.
  //
  // Correction du biais de bord : sans ancre, le premier boire de la fenêtre n'a
  // pas de prédécesseur, et l'écart qui « entre » dans la fenêtre est perdu. Un
  // jeûne nocturne disparaissait donc de « Plus long intervalle » dès que le
  // boire qui le précédait sortait de la fenêtre — la valeur changeait selon
  // l'heure de consultation. On ancre sur le dernier boire exploitable
  // antérieur à fromMs. La même liste d'écarts sert à la moyenne ET au maximum,
  // pour qu'ils restent cohérents entre eux.
  const feedTimes = feeds.map(ts).sort((a, b) => a - b);
  const anchorTs = lastFeedBefore(events, fromMs);
  const gapTimes = anchorTs == null ? feedTimes : [anchorTs, ...feedTimes];

  let avgIntervalMs = null;
  let longestIntervalMs = null;
  if (gapTimes.length >= 2) {
    const gaps = [];
    for (let i = 1; i < gapTimes.length; i += 1) gaps.push(gapTimes[i] - gapTimes[i - 1]);
    avgIntervalMs = mean(gaps);
    longestIntervalMs = Math.max(...gaps);
  }

  const lastFeedTs = feedTimes.length ? feedTimes[feedTimes.length - 1] : null;

  // Répartition des boires par catégorie.
  const breakdown = { left: 0, right: 0, both: 0, bottle: 0, other: 0 };
  for (const e of feeds) {
    const meta = feedTypeMeta(e.feedType);
    if (meta.side === 'left') breakdown.left += 1;
    else if (meta.side === 'right') breakdown.right += 1;
    else if (meta.side === 'both') breakdown.both += 1;
    else if (meta.bottle) breakdown.bottle += 1;
    else breakdown.other += 1;
  }

  const pees = diapers.filter((e) => e.pee).length;
  const poops = diapers.filter((e) => e.poop).length;
  const days = dayCount && dayCount > 0 ? dayCount : null;

  return {
    feedCount: feeds.length,
    diaperCount: diapers.length, // couches enregistrées (seuil de comparaison)
    breastSec, // total au sein (s)
    avgDurationSec: mean(durations), // null si aucune durée
    totalMl: amounts.reduce((a, b) => a + b, 0),
    avgMl: mean(amounts), // null si aucune quantité saisie
    mlCount: amounts.length,
    avgIntervalMs, // null si < 2 boires
    longestIntervalMs, // plus long intervalle (null si < 2 boires)
    lastFeedTs, // null si aucun boire
    breakdown,
    pees,
    poops,
    peesPerDay: days ? pees / days : null,
    poopsPerDay: days ? poops / days : null,
  };
}

// Tendance sur les 7 derniers jours locaux (du plus ancien au plus récent).
export function weeklyTrend(events, now = Date.now()) {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const days = [];
  for (let i = 6; i >= 0; i -= 1) {
    const d = new Date(start.getTime() - i * DAY_MS);
    days.push({ key: dayKey(d.toISOString()), date: d, feeds: 0, breastSec: 0, pees: 0, poops: 0 });
  }
  const byKey = new Map(days.map((d) => [d.key, d]));
  for (const e of kpiEvents(events)) {
    const t = ts(e);
    const bucket = byKey.get(dayKey(new Date(t).toISOString()));
    if (!bucket) continue;
    if (e.type === 'feed') {
      bucket.feeds += 1;
      const d = Number(e.durationSec);
      if (feedTypeMeta(e.feedType).breast && Number.isFinite(d) && d > 0) bucket.breastSec += d;
    } else {
      if (e.pee) bucket.pees += 1;
      if (e.poop) bucket.poops += 1;
    }
  }
  return days;
}

// Point d'entrée : fenêtres 24 h et 7 jours + tendance.
export function computeStats(events, now = Date.now()) {
  const list = Array.isArray(events) ? events : [];
  const start7 = new Date(now);
  start7.setHours(0, 0, 0, 0);
  const from7 = start7.getTime() - 6 * DAY_MS;
  return {
    last24: windowStats(list, now - DAY_MS, now, 1),
    week: windowStats(list, from7, now, 7),
    trend: weeklyTrend(list, now),
  };
}

// ── Dashboard v2 ────────────────────────────────────────────────────────────

// Horodatage du dernier boire / pipi / selle (null si aucun).
export function lastEvents(events) {
  const active = kpiEvents(events);
  const maxTs = (arr) => (arr.length ? Math.max(...arr) : null);
  const feed = active.filter((e) => e.type === 'feed').map(ts);
  const pee = active.filter((e) => e.type === 'diaper' && e.pee).map(ts);
  const poop = active.filter((e) => e.type === 'diaper' && e.poop).map(ts);
  return { lastFeedTs: maxTs(feed), lastPeeTs: maxTs(pee), lastPoopTs: maxTs(poop) };
}

// Évolution des intervalles : jusqu'aux `maxPoints` derniers écarts entre boires.
export function feedIntervalSeries(events, maxPoints = 12) {
  const feeds = kpiEvents(events)
    .filter((e) => e.type === 'feed')
    .map(ts)
    .sort((a, b) => a - b);
  const gaps = [];
  for (let i = 1; i < feeds.length; i += 1) gaps.push({ ts: feeds[i], gapMs: feeds[i] - feeds[i - 1] });
  return gaps.slice(-maxPoints);
}

// Répartition jour (6 h–18 h) / nuit (18 h–6 h) des boires, heure locale.
export function dayNightSplit(events, fromMs, toMs) {
  const feeds = inWindow(events, fromMs, toMs).filter((e) => e.type === 'feed');
  let day = 0;
  let night = 0;
  for (const e of feeds) {
    const h = new Date(ts(e)).getHours();
    if (h >= 6 && h < 18) day += 1;
    else night += 1;
  }
  const total = day + night;
  return {
    day,
    night,
    total,
    dayPct: total ? day / total : null,
    nightPct: total ? night / total : null,
  };
}

// Répartition de la DURÉE au sein entre gauche et droite.
//
// Stratégie de repli explicite, par ordre de priorité :
//   1. EXACT   — leftDurationSec / rightDurationSec, écrits à la finalisation
//                de la minuterie depuis accumulatedLeftMs / accumulatedRightMs ;
//   2. REPLI   — feedType 'both' sans détail : 50/50 assumé ;
//   3. REPLI   — feedType unilatéral : toute la durée au côté concerné ;
//   4. sinon, l'événement est ignoré (durée absente ou nulle).
//
// `lastSide` n'est JAMAIS consulté ici : il n'indique que le DERNIER côté téré,
// pas la répartition. S'y fier attribuait 100 % du temps d'une session « les
// deux seins » à un seul côté — la cause du faux « côté dominant ».
//
// Le champ `estimated` permet à l'appelant de ne pas présenter comme mesuré ce
// qui a été déduit du type de boire.
export function sideSplit(events, fromMs, toMs) {
  const feeds = inWindow(events, fromMs, toMs).filter(
    (e) => e.type === 'feed' && feedTypeMeta(e.feedType).breast,
  );
  let left = 0;
  let right = 0;
  let exactLeft = 0;
  let exactRight = 0;
  let estimatedSec = 0;

  for (const e of feeds) {
    const exL = Number(e.leftDurationSec);
    const exR = Number(e.rightDurationSec);
    const hasExact =
      Number.isFinite(exL) && Number.isFinite(exR) && exL >= 0 && exR >= 0 && exL + exR > 0;

    if (hasExact) {
      left += exL;
      right += exR;
      exactLeft += exL;
      exactRight += exR;
      continue;
    }

    const d = Number(e.durationSec);
    if (!Number.isFinite(d) || d <= 0) continue;

    // Le filtre `breast` ci-dessus garantit un feedType connu, donc un `side`
    // défini parmi 'left' | 'right' | 'both'.
    const side = feedTypeMeta(e.feedType).side;
    if (side === 'left') left += d;
    else if (side === 'right') right += d;
    else if (side === 'both') {
      left += d / 2;
      right += d / 2;
    } else continue;
    estimatedSec += d;
  }

  const total = left + right;
  return {
    leftSec: left,
    rightSec: right,
    total,
    leftPct: total ? left / total : null,
    rightPct: total ? right / total : null,
    // Sous-ensemble réellement mesuré (aucune estimation).
    exactLeftSec: exactLeft,
    exactRightSec: exactRight,
    exactTotal: exactLeft + exactRight,
    estimatedSec,
    estimated: estimatedSec > 0,
  };
}

// Activité des boires par heure locale (tableau de 24 compteurs).
export function hourlyActivity(events, fromMs, toMs) {
  const hours = new Array(24).fill(0);
  for (const e of inWindow(events, fromMs, toMs)) {
    if (e.type !== 'feed') continue;
    hours[new Date(ts(e)).getHours()] += 1;
  }
  return hours;
}

// Nombre minimal de couches enregistrées, dans CHACUNE des deux périodes
// comparées (7 jours chacune), avant d'oser une comparaison. 5 couches sur 7
// jours reste très en dessous d'un rythme normal de nouveau-né : le seuil ne
// filtre donc que les périodes manifestement peu ou pas saisies, sans exiger
// une saisie exhaustive.
export const MIN_DIAPERS_FOR_COMPARISON = 5;

// Jusqu'à 3 observations calculées (aucune conclusion médicale). Rien si les
// données sont insuffisantes.
export function computeInsights(events, now = Date.now()) {
  const out = [];
  const cur = windowStats(events, now - 7 * DAY_MS, now, 7);
  const prev = windowStats(events, now - 14 * DAY_MS, now - 7 * DAY_MS, 7);

  if (
    cur.avgIntervalMs != null &&
    prev.avgIntervalMs != null &&
    prev.avgIntervalMs > 0 && // évite division par zéro / Infinity
    cur.feedCount >= 5 &&
    prev.feedCount >= 5
  ) {
    const pct = (cur.avgIntervalMs - prev.avgIntervalMs) / prev.avgIntervalMs;
    if (Math.abs(pct) >= 0.15) {
      out.push(`Intervalle moyen entre les boires en ${pct > 0 ? 'hausse' : 'baisse'} cette semaine.`);
    }
  }

  const dn = dayNightSplit(events, now - 7 * DAY_MS, now);
  const dnPrev = dayNightSplit(events, now - 14 * DAY_MS, now - 7 * DAY_MS);
  if (dn.total >= 7 && dnPrev.total >= 7 && dn.nightPct != null && dnPrev.nightPct != null) {
    const d = dn.nightPct - dnPrev.nightPct;
    if (Math.abs(d) >= 0.1) {
      out.push(`Boires nocturnes ${d > 0 ? 'plus' : 'moins'} fréquents cette semaine.`);
    }
  }

  // Côté dominant : priorité absolue aux durées mesurées. À défaut, l'estimation
  // reste possible mais doit être annoncée comme telle.
  const ss = sideSplit(events, now - 7 * DAY_MS, now);
  if (cur.feedCount >= 5) {
    const useExact = ss.exactTotal > 0;
    const l = useExact ? ss.exactLeftSec : ss.leftSec;
    const r = useExact ? ss.exactRightSec : ss.rightSec;
    const tot = l + r;
    if (tot > 0) {
      const domPct = Math.max(l, r) / tot;
      if (domPct >= 0.65) {
        const cote = l >= r ? 'gauche' : 'droit';
        const pct = Math.round(domPct * 100);
        // Affirmatif quand la durée est mesurée ; prudent quand elle est déduite
        // du type de boire. Les seuils sont identiques dans les deux cas.
        out.push(
          useExact
            ? `Côté ${cote} nettement dominant (${pct} %).`
            : `Côté ${cote} semble dominant (${pct} % estimé).`,
        );
      }
    }
  }

  // Couches : ne jamais lire une absence de saisie comme un zéro. Sans volume
  // minimal dans CHACUNE des deux périodes, « 0 cette semaine vs 0 la semaine
  // dernière » produirait un message faussement rassurant — or l'absence de
  // pipi est justement ce qu'il ne faut pas noyer.
  const curD = cur.diaperCount;
  const prevD = prev.diaperCount;
  const bothPeriodsUsable =
    curD >= MIN_DIAPERS_FOR_COMPARISON &&
    prevD >= MIN_DIAPERS_FOR_COMPARISON &&
    Number.isFinite(cur.peesPerDay) &&
    Number.isFinite(prev.peesPerDay) &&
    Number.isFinite(cur.poopsPerDay) &&
    Number.isFinite(prev.poopsPerDay);

  if (bothPeriodsUsable) {
    const peeDiff = Math.abs(cur.peesPerDay - prev.peesPerDay);
    const poopDiff = Math.abs(cur.poopsPerDay - prev.poopsPerDay);
    if (peeDiff <= 1 && poopDiff <= 1) {
      // Formulation descriptive : un comptage, pas un avis.
      out.push('Nombre de couches comparable à la semaine précédente.');
    }
  } else if (curD + prevD > 0) {
    // Des couches existent, mais pas assez pour comparer : on le dit plutôt que
    // de laisser croire à une stabilité.
    out.push('Données insuffisantes pour comparer les couches.');
  }

  return out.slice(0, 3);
}

// ── Complétude des SAISIES ──────────────────────────────────────────────────
//
// Mesure UNIQUEMENT à quel point les champs optionnels ont été remplis. Ce
// n'est en aucun cas une évaluation de l'enfant, de l'allaitement ou de la
// santé : c'est un indicateur de qualité de journalisation, rien d'autre. Les
// libellés visibles doivent rester factuels (voir KpiDashboard.jsx).
//
// Trois signaux, chacun ÉCARTÉ quand il n'est pas applicable — un dénominateur
// nul ne compte jamais comme un zéro, conformément au contrat en tête de
// fichier :
//   * durée    — part des boires AU SEIN dont la durée est renseignée ;
//   * quantité — part des boires AU BIBERON dont la quantité est renseignée ;
//   * couches  — couches enregistrées par tranche de 24 h (plafonné à 1).
//
// Conséquence voulue : un allaitement exclusif n'est JAMAIS pénalisé pour
// l'absence de quantités — le signal « quantité » disparaît simplement du
// calcul, au lieu de tirer le score vers le bas.

// En dessous de ce volume, aucun score n'est publié : un « très complet »
// obtenu sur deux événements serait flatteur et trompeur.
export const MIN_EVENTS_FOR_COMPLETENESS = 5;

// Paliers, du plus complet au moins complet. Clés stables : la traduction en
// français vit dans la couche d'affichage.
export const COMPLETENESS_LEVELS = ['complete', 'good', 'partial', 'insufficient'];

export function dataCompleteness(events, fromMs, toMs) {
  const win = inWindow(events, fromMs, toMs);
  const feeds = win.filter((e) => e.type === 'feed');
  const diapers = win.filter((e) => e.type === 'diaper');

  const empty = { level: 'insufficient', score: null, signals: [] };
  if (win.length < MIN_EVENTS_FOR_COMPLETENESS) return empty;

  let breastTotal = 0;
  let breastWithDuration = 0;
  let bottleTotal = 0;
  let bottleWithAmount = 0;

  for (const e of feeds) {
    const meta = feedTypeMeta(e.feedType);
    if (meta.breast) {
      breastTotal += 1;
      const d = Number(e.durationSec);
      if (Number.isFinite(d) && d > 0) breastWithDuration += 1;
    } else if (meta.bottle) {
      bottleTotal += 1;
      const ml = e.amountMl == null ? null : Number(e.amountMl);
      if (Number.isFinite(ml) && ml > 0) bottleWithAmount += 1;
    }
  }

  // Nombre de journées couvertes par la fenêtre (au moins 1).
  const days = Math.max(1, Math.round((toMs - fromMs) / DAY_MS));

  const signals = [];
  if (breastTotal > 0) {
    signals.push({ key: 'duration', ratio: breastWithDuration / breastTotal });
  }
  if (bottleTotal > 0) {
    signals.push({ key: 'amount', ratio: bottleWithAmount / bottleTotal });
  }
  // Une couche par jour suffit au plein score : le signal dit « le suivi des
  // couches est tenu », pas « le nombre de couches est normal ».
  signals.push({ key: 'diaper', ratio: Math.min(1, diapers.length / days) });

  if (!signals.length) return empty;

  const score = signals.reduce((a, s) => a + s.ratio, 0) / signals.length;
  let level;
  if (score >= 0.85) level = 'complete';
  else if (score >= 0.6) level = 'good';
  else level = 'partial';

  return { level, score, signals };
}

// Agrégateur unique pour le dashboard (garde KpiDashboard.jsx léger).
export function computeDashboard(events, now = Date.now()) {
  const list = Array.isArray(events) ? events : [];
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const from7 = start.getTime() - 6 * DAY_MS;
  const hourly = hourlyActivity(list, from7, now);
  return {
    last: lastEvents(list),
    kpi: windowStats(list, now - DAY_MS, now, 1),
    trend: weeklyTrend(list, now),
    intervals: feedIntervalSeries(list, 12),
    dayNight: dayNightSplit(list, from7, now),
    side: sideSplit(list, from7, now),
    hourly,
    // Total pré-calculé : évite une réduction dans le composant.
    hourlyTotal: hourly.reduce((a, b) => a + b, 0),
    // Complétude évaluée sur 7 jours : sur 24 h, le score oscillerait au gré
    // d'une seule saisie oubliée.
    completeness: dataCompleteness(list, from7, now),
    insights: computeInsights(list, now),
  };
}
