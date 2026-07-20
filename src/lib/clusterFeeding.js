// Détection des tétées groupées (cluster feeding).
//
// Module PUR et sans effet de bord : il lit une liste d'événements existants et
// en dérive des épisodes de boires rapprochés. Il ne modifie JAMAIS les
// événements sources, ne touche ni au stockage, ni à Supabase, ni à la
// synchronisation, ni à feedingSession.
//
// Définition (v1) :
//  * les boires sont triés chronologiquement ;
//  * deux boires appartiennent au même épisode si l'écart entre la FIN de l'un
//    et le DÉBUT du suivant est ≤ 45 minutes ;
//  * un écart strictement supérieur au seuil démarre un nouvel épisode ;
//  * un épisode n'est reconnu comme « tétée groupée » que s'il compte au moins
//    3 boires.
//
// Le seuil (minutes) et le minimum de boires sont des constantes configurables
// (voir CLUSTER_GAP_MINUTES / CLUSTER_MIN_FEEDS et les options ci-dessous).
//
// Extensibilité : `detectClusterFeedings` accepte un objet d'options avec des
// valeurs par défaut. De nouvelles règles d'acceptation peuvent être ajoutées
// via `options.rules` (prédicats ET-és avec la règle par défaut) SANS casser les
// appelants existants, qui continuent d'appeler sans options.

import { feedTypeMeta } from './constants.js';
import { eventTime } from './summary.js';

// Seuil par défaut entre la fin d'un boire et le début du suivant (minutes).
export const CLUSTER_GAP_MINUTES = 45;

// Nombre minimal de boires pour reconnaître une tétée groupée.
export const CLUSTER_MIN_FEEDS = 3;

const MIN_MS = 60000;

// Un boire est-il exploitable pour la détection ? On écarte les entrées nulles,
// les tombstones (deleted), les non-boires, les horodatages invalides et, par
// défaut, les boires EN COURS dont la durée n'est pas encore définitive.
function isUsableFeed(e, includeInProgress) {
  if (!e || e.deleted) return false;
  if (e.type !== 'feed') return false;
  if (!includeInProgress && e.inProgress === true) return false;
  return Number.isFinite(startMs(e));
}

// Début du boire en millisecondes.
function startMs(e) {
  return new Date(eventTime(e)).getTime();
}

// Fin du boire en millisecondes. En l'absence de durée exploitable, la fin est
// confondue avec le début (boire ponctuel) : un biberon sans durée n'est jamais
// artificiellement rallongé.
function endMs(e) {
  const d = Number(e.durationSec);
  return startMs(e) + (Number.isFinite(d) && d > 0 ? d * 1000 : 0);
}

// Regroupe les boires exploitables en séquences (« runs ») de boires rapprochés,
// selon le seuil fin → début. Fonction pure : renvoie des tableaux de références
// vers les événements d'origine, sans les muter. Chaque séquence est triée par
// heure de début croissante.
export function groupFeedRuns(events, options = {}) {
  const gapMinutes = options.gapMinutes ?? CLUSTER_GAP_MINUTES;
  const includeInProgress = options.includeInProgress === true;
  const gapMs = gapMinutes * MIN_MS;

  const feeds = (Array.isArray(events) ? events : [])
    .filter((e) => isUsableFeed(e, includeInProgress))
    .sort((a, b) => startMs(a) - startMs(b));

  const runs = [];
  let current = [];
  for (const feed of feeds) {
    if (current.length === 0) {
      current = [feed];
      continue;
    }
    const prev = current[current.length - 1];
    // Écart fin → début. Un chevauchement (écart négatif) reste, sans surprise,
    // sous le seuil et prolonge donc l'épisode courant.
    const gap = startMs(feed) - endMs(prev);
    if (gap <= gapMs) {
      current.push(feed);
    } else {
      runs.push(current);
      current = [feed];
    }
  }
  if (current.length) runs.push(current);
  return runs;
}

// Résume une séquence de boires en un objet « cluster ». `isClusterFeeding` est
// évalué par l'appelant (`detectClusterFeedings`) selon les règles actives ; par
// défaut il vaut `run.length >= minFeeds`.
function summarizeRun(run, isClusterFeeding) {
  const starts = run.map(startMs);
  const ends = run.map(endMs);
  const start = Math.min(...starts);
  const end = Math.max(...ends);

  let breastSec = 0;
  let bottleMl = 0;
  const feedTypes = [];
  const sidesUsed = [];

  for (const e of run) {
    const meta = feedTypeMeta(e.feedType);
    if (e.feedType && !feedTypes.includes(e.feedType)) feedTypes.push(e.feedType);
    if (meta.breast) {
      const d = Number(e.durationSec);
      if (Number.isFinite(d) && d > 0) breastSec += d;
      if (meta.side && !sidesUsed.includes(meta.side)) sidesUsed.push(meta.side);
    }
    if (meta.bottle) {
      const ml = e.amountMl == null ? null : Number(e.amountMl);
      if (Number.isFinite(ml) && ml > 0) bottleMl += ml;
    }
  }

  return {
    startAt: new Date(start).toISOString(), // début du premier boire (ISO)
    endAt: new Date(end).toISOString(), // fin du dernier boire (ISO)
    duration: (end - start) / MIN_MS, // durée totale de l'épisode (minutes)
    feedCount: run.length,
    breastMinutes: breastSec / 60, // temps total au sein (minutes)
    bottleMl, // volume total au biberon (ml)
    feedTypes, // types de boire distincts, dans l'ordre d'apparition
    sidesUsed, // côtés distincts utilisés ('left' | 'right' | 'both')
    events: run, // références aux événements sources (jamais mutés)
    isClusterFeeding,
  };
}

// Point d'entrée principal. Renvoie la liste des tétées groupées reconnues,
// triées chronologiquement.
//
// options :
//   * gapMinutes        — seuil fin → début en minutes (défaut CLUSTER_GAP_MINUTES) ;
//   * minFeeds          — nombre minimal de boires (défaut CLUSTER_MIN_FEEDS) ;
//   * includeInProgress — inclure les boires en cours (défaut false) ;
//   * rules             — règles d'acceptation additionnelles : tableau de
//                         prédicats `(cluster) => boolean`, ET-és avec la règle
//                         par défaut (feedCount >= minFeeds). Permet d'ajouter
//                         de nouvelles conditions sans casser les appelants ;
//   * includeSubThreshold — si true, renvoie AUSSI les séquences non reconnues
//                           (avec `isClusterFeeding: false`), utile pour une
//                           future timeline. Défaut false.
//
// L'API est volontairement additive : de nouvelles options pourront être
// introduites plus tard avec des valeurs par défaut, sans impact sur le code
// existant.
export function detectClusterFeedings(events, options = {}) {
  const minFeeds = options.minFeeds ?? CLUSTER_MIN_FEEDS;
  const extraRules = Array.isArray(options.rules) ? options.rules : [];
  const includeSubThreshold = options.includeSubThreshold === true;

  const runs = groupFeedRuns(events, options);
  const out = [];
  for (const run of runs) {
    // Règle de base + règles additionnelles éventuelles.
    const base = summarizeRun(run, run.length >= minFeeds);
    const accepted =
      base.isClusterFeeding && extraRules.every((rule) => rule(base) === true);
    // On recalcule `isClusterFeeding` en tenant compte des règles additionnelles.
    const cluster = accepted === base.isClusterFeeding ? base : { ...base, isClusterFeeding: accepted };
    if (accepted || includeSubThreshold) out.push(cluster);
  }
  return out;
}
