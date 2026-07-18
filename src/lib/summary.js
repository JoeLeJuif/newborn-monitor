// Calculs pour le tableau de bord et les résumés par période.

import { feedTypeMeta } from './constants.js';

// Renvoie l'horodatage principal d'un événement (début du boire ou heure de couche).
export function eventTime(ev) {
  return ev.type === 'feed' ? ev.start : ev.time;
}

// Événements triés du plus récent au plus ancien.
export function sortedByTimeDesc(events) {
  return [...events].sort(
    (a, b) => new Date(eventTime(b)) - new Date(eventTime(a)),
  );
}

export function lastFeed(events) {
  return sortedByTimeDesc(events.filter((e) => e.type === 'feed'))[0] || null;
}

export function lastDiaperWith(events, kind) {
  // kind: 'pee' ou 'poop'
  return (
    sortedByTimeDesc(
      events.filter((e) => e.type === 'diaper' && e[kind]),
    )[0] || null
  );
}

// Dernier sein utilisé (parmi les boires au sein).
export function lastBreastSide(events) {
  const feeds = sortedByTimeDesc(
    events.filter((e) => e.type === 'feed' && feedTypeMeta(e.feedType).breast),
  );
  return feeds[0]?.lastSide || feedTypeMeta(feeds[0]?.feedType).side || null;
}

// Filtre les événements dont l'heure est dans [from, to] (Date ou nombre ms).
export function eventsInRange(events, from, to) {
  const f = +from;
  const t = +to;
  return events.filter((e) => {
    const ts = +new Date(eventTime(e));
    return ts >= f && ts <= t;
  });
}

// Agrège des statistiques sur une liste d'événements.
export function aggregate(events) {
  let feeds = 0;
  let breastSec = 0;
  let totalMl = 0;
  let pees = 0;
  let poops = 0;

  for (const e of events) {
    if (e.type === 'feed') {
      feeds += 1;
      if (feedTypeMeta(e.feedType).breast) breastSec += e.durationSec || 0;
      if (e.amountMl) totalMl += Number(e.amountMl) || 0;
    } else if (e.type === 'diaper') {
      if (e.pee) pees += 1;
      if (e.poop) poops += 1;
    }
  }
  return { feeds, breastSec, totalMl, pees, poops, count: events.length };
}

// Statistiques du tableau de bord (dernières 24 h + derniers événements).
export function dashboardStats(events) {
  const now = Date.now();
  const last24 = eventsInRange(events, now - 86400000, now);
  const agg = aggregate(last24);
  return {
    last24: agg,
    lastFeed: lastFeed(events),
    lastPee: lastDiaperWith(events, 'pee'),
    lastPoop: lastDiaperWith(events, 'poop'),
    lastSide: lastBreastSide(events),
  };
}
