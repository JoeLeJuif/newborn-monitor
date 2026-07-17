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

// Événements actifs, valides et compris dans [fromMs, toMs].
function inWindow(events, fromMs, toMs) {
  return events.filter((e) => {
    if (!e || e.deleted) return false;
    if (e.type !== 'feed' && e.type !== 'diaper') return false;
    const t = ts(e);
    return Number.isFinite(t) && t >= fromMs && t <= toMs;
  });
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

  // Intervalle moyen entre boires (par heure de début, ordre croissant).
  const feedTimes = feeds.map(ts).filter(Number.isFinite).sort((a, b) => a - b);
  let avgIntervalMs = null;
  let longestIntervalMs = null;
  if (feedTimes.length >= 2) {
    const gaps = [];
    for (let i = 1; i < feedTimes.length; i += 1) gaps.push(feedTimes[i] - feedTimes[i - 1]);
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
  for (const e of events) {
    if (!e || e.deleted) continue;
    if (e.type !== 'feed' && e.type !== 'diaper') continue;
    const t = ts(e);
    if (!Number.isFinite(t)) continue;
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
  const active = (events || []).filter((e) => e && !e.deleted);
  const maxTs = (arr) => (arr.length ? Math.max(...arr) : null);
  const feed = active.filter((e) => e.type === 'feed').map(ts).filter(Number.isFinite);
  const pee = active.filter((e) => e.type === 'diaper' && e.pee).map(ts).filter(Number.isFinite);
  const poop = active.filter((e) => e.type === 'diaper' && e.poop).map(ts).filter(Number.isFinite);
  return { lastFeedTs: maxTs(feed), lastPeeTs: maxTs(pee), lastPoopTs: maxTs(poop) };
}

// Évolution des intervalles : jusqu'aux `maxPoints` derniers écarts entre boires.
export function feedIntervalSeries(events, maxPoints = 12) {
  const feeds = (events || [])
    .filter((e) => e && !e.deleted && e.type === 'feed')
    .map(ts)
    .filter(Number.isFinite)
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

// Répartition de la DURÉE au sein gauche / droit (les deux = 50/50).
export function sideSplit(events, fromMs, toMs) {
  const feeds = inWindow(events, fromMs, toMs).filter(
    (e) => e.type === 'feed' && feedTypeMeta(e.feedType).breast,
  );
  let left = 0;
  let right = 0;
  for (const e of feeds) {
    const d = Number(e.durationSec);
    if (!Number.isFinite(d) || d <= 0) continue;
    const side = e.lastSide || feedTypeMeta(e.feedType).side;
    if (side === 'left') left += d;
    else if (side === 'right') right += d;
    else if (side === 'both') {
      left += d / 2;
      right += d / 2;
    }
  }
  const total = left + right;
  return {
    leftSec: left,
    rightSec: right,
    total,
    leftPct: total ? left / total : null,
    rightPct: total ? right / total : null,
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

  const ss = sideSplit(events, now - 7 * DAY_MS, now);
  if (cur.feedCount >= 5 && ss.total > 0) {
    const domPct = Math.max(ss.leftPct, ss.rightPct);
    if (domPct >= 0.65) {
      out.push(`Côté ${ss.leftPct >= ss.rightPct ? 'gauche' : 'droit'} nettement dominant (${Math.round(domPct * 100)} %).`);
    }
  }

  if (cur.feedCount >= 5 && prev.feedCount >= 5) {
    const peeDiff = Math.abs((cur.peesPerDay ?? 0) - (prev.peesPerDay ?? 0));
    const poopDiff = Math.abs((cur.poopsPerDay ?? 0) - (prev.poopsPerDay ?? 0));
    if (peeDiff <= 1 && poopDiff <= 1) {
      out.push('Pipis et selles stables par rapport à la semaine dernière.');
    }
  }

  return out.slice(0, 3);
}

// Agrégateur unique pour le dashboard (garde KpiDashboard.jsx léger).
export function computeDashboard(events, now = Date.now()) {
  const list = Array.isArray(events) ? events : [];
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const from7 = start.getTime() - 6 * DAY_MS;
  return {
    last: lastEvents(list),
    kpi: windowStats(list, now - DAY_MS, now, 1),
    trend: weeklyTrend(list, now),
    intervals: feedIntervalSeries(list, 12),
    dayNight: dayNightSplit(list, from7, now),
    side: sideSplit(list, from7, now),
    hourly: hourlyActivity(list, from7, now),
    insights: computeInsights(list, now),
  };
}
