// Session de boire active (minuterie d'allaitement) — logique PURE + persistance
// locale dédiée. La source de vérité du temps est constituée de timestamps
// (startedAt, currentSegmentStartedAt) et de durées déjà accumulées ; Date.now()
// sert au calcul de l'affichage, jamais un compteur incrémenté chaque seconde.
//
// Cette session temporaire est isolée : elle NE touche à aucune clé de stockage
// existante et n'est jamais synchronisée vers Supabase. Ce n'est qu'à la
// finalisation qu'un événement de boire normal est créé (via le store), puis la
// session est supprimée.

export const ACTIVE_FEEDING_KEY = 'newborn-monitor:active-feeding:v1';
export const SESSION_VERSION = 1;

// Seuil d'avertissement (non bloquant) pour une session anormalement longue.
export const LONG_SESSION_MS = 6 * 60 * 60 * 1000; // 6 h

let idCounter = 0;
function newSessionId() {
  if (globalThis.crypto?.randomUUID) return 'fs_' + globalThis.crypto.randomUUID();
  idCounter += 1;
  return 'fs_' + Date.now().toString(36) + '_' + idCounter.toString(36);
}

// ── Création & transitions (fonctions pures : renvoient une nouvelle session) ──

export function createSession(side, nowMs = Date.now()) {
  return {
    version: SESSION_VERSION,
    active: true,
    sessionId: newSessionId(),
    startedAt: new Date(nowMs).toISOString(),
    currentSide: side, // 'left' | 'right'
    currentSegmentStartedAt: nowMs, // ms epoch ; null quand en pause
    accumulatedLeftMs: 0,
    accumulatedRightMs: 0,
    paused: false,
    feedingType: side, // 'left' | 'right' | 'both'
    note: '',
  };
}

// Contribution (jamais négative) du segment en cours à l'instant nowMs.
// Une horloge qui recule n'enlève jamais de temps déjà écoulé.
function segmentMs(session, nowMs) {
  if (!session || session.currentSegmentStartedAt == null) return 0;
  const d = nowMs - session.currentSegmentStartedAt;
  return d > 0 ? d : 0;
}

// Verse le segment en cours dans le côté courant (fige le temps écoulé).
function commitSegment(session, nowMs) {
  const add = segmentMs(session, nowMs);
  const s = { ...session, currentSegmentStartedAt: null };
  if (session.currentSide === 'left') s.accumulatedLeftMs += add;
  else if (session.currentSide === 'right') s.accumulatedRightMs += add;
  return s;
}

function sidesUsed(session, plusSide) {
  const set = new Set();
  if (session.accumulatedLeftMs > 0) set.add('left');
  if (session.accumulatedRightMs > 0) set.add('right');
  if (plusSide) set.add(plusSide);
  return set;
}

// Démarre un côté : crée la session si aucune, sinon accumule le côté précédent
// puis démarre le nouveau segment.
export function startOrSwitchSide(session, side, nowMs = Date.now()) {
  if (!session) return createSession(side, nowMs);
  const committed = commitSegment(session, nowMs);
  const used = sidesUsed(committed, side);
  return {
    ...committed,
    currentSide: side,
    currentSegmentStartedAt: nowMs,
    paused: false,
    feedingType: used.size > 1 ? 'both' : side,
  };
}

export function pauseSession(session, nowMs = Date.now()) {
  if (!session || session.paused) return session;
  return { ...commitSegment(session, nowMs), paused: true };
}

export function resumeSession(session, nowMs = Date.now()) {
  if (!session || !session.paused || !session.currentSide) return session;
  return { ...session, currentSegmentStartedAt: nowMs, paused: false };
}

export function setSessionNote(session, note) {
  if (!session) return session;
  return { ...session, note: note == null ? '' : String(note) };
}

// ── Durées dérivées (calcul à partir des timestamps) ──

export function elapsedLeftMs(session, nowMs = Date.now()) {
  if (!session) return 0;
  return session.accumulatedLeftMs + (session.currentSide === 'left' ? segmentMs(session, nowMs) : 0);
}

export function elapsedRightMs(session, nowMs = Date.now()) {
  if (!session) return 0;
  return session.accumulatedRightMs + (session.currentSide === 'right' ? segmentMs(session, nowMs) : 0);
}

export function totalMs(session, nowMs = Date.now()) {
  return elapsedLeftMs(session, nowMs) + elapsedRightMs(session, nowMs);
}

export function isRunning(session) {
  return !!session && !session.paused && session.currentSegmentStartedAt != null;
}

export function isLong(session, nowMs = Date.now()) {
  return !!session && totalMs(session, nowMs) >= LONG_SESSION_MS;
}

// ── Finalisation : données d'un événement de boire normal (format actuel) ──
// Renvoie UN seul objet ; ne crée pas l'événement (le store s'en charge).
export function finalizeToEvent(session, nowMs = Date.now(), extra = {}) {
  if (!session) return null;
  const durationSec = Math.round(totalMs(session, nowMs) / 1000);
  const note = extra.note != null ? extra.note : session.note || '';
  return {
    type: 'feed',
    feedType: session.feedingType,
    start: session.startedAt,
    durationSec,
    amountMl: null,
    inProgress: false,
    lastSide: session.currentSide || null,
    note: String(note).trim(),
  };
}

// ── Validation d'une session persistée (tolérante aux données corrompues) ──
export function isValidSession(s) {
  if (!s || typeof s !== 'object') return false;
  if (s.active !== true) return false;
  if (typeof s.sessionId !== 'string' || !s.sessionId) return false;
  if (typeof s.startedAt !== 'string' || Number.isNaN(Date.parse(s.startedAt))) return false;
  if (!['left', 'right', null, undefined].includes(s.currentSide)) return false;
  if (!Number.isFinite(s.accumulatedLeftMs) || s.accumulatedLeftMs < 0) return false;
  if (!Number.isFinite(s.accumulatedRightMs) || s.accumulatedRightMs < 0) return false;
  if (s.currentSegmentStartedAt != null && !Number.isFinite(s.currentSegmentStartedAt)) return false;
  return true;
}

// Complète les champs optionnels d'une session chargée.
function normalize(s) {
  return {
    version: SESSION_VERSION,
    active: true,
    sessionId: s.sessionId,
    startedAt: s.startedAt,
    currentSide: s.currentSide ?? null,
    currentSegmentStartedAt: s.currentSegmentStartedAt ?? null,
    accumulatedLeftMs: s.accumulatedLeftMs,
    accumulatedRightMs: s.accumulatedRightMs,
    paused: s.paused ?? s.currentSegmentStartedAt == null,
    feedingType: s.feedingType || s.currentSide || 'left',
    note: typeof s.note === 'string' ? s.note : '',
  };
}

// ── Persistance locale dédiée (jamais localStorage.clear) ──
export function loadActiveFeeding() {
  let raw;
  try {
    raw = globalThis.localStorage?.getItem(ACTIVE_FEEDING_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null; // JSON invalide : ignoré, aucune exception propagée
  }
  if (!isValidSession(parsed)) return null;
  return normalize(parsed);
}

export function saveActiveFeeding(session) {
  try {
    globalThis.localStorage?.setItem(ACTIVE_FEEDING_KEY, JSON.stringify(session));
  } catch {
    // Best effort : une session minuscule ne devrait jamais dépasser le quota.
  }
}

export function clearActiveFeeding() {
  try {
    globalThis.localStorage?.removeItem(ACTIVE_FEEDING_KEY);
  } catch {
    // ignore
  }
}
