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
  if (feedTimes.length >= 2) {
    const gaps = [];
    for (let i = 1; i < feedTimes.length; i += 1) gaps.push(feedTimes[i] - feedTimes[i - 1]);
    avgIntervalMs = mean(gaps);
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
    days.push({ key: dayKey(d.toISOString()), date: d, feeds: 0, pees: 0, poops: 0 });
  }
  const byKey = new Map(days.map((d) => [d.key, d]));
  for (const e of events) {
    if (!e || e.deleted) continue;
    if (e.type !== 'feed' && e.type !== 'diaper') continue;
    const t = ts(e);
    if (!Number.isFinite(t)) continue;
    const bucket = byKey.get(dayKey(new Date(t).toISOString()));
    if (!bucket) continue;
    if (e.type === 'feed') bucket.feeds += 1;
    else {
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
