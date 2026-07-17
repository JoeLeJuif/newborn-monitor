// Opérations de données pures (testables sans navigateur) :
// drainage sélectif de l'outbox, validation d'import JSON, dimensions de photo.
import { eventTime } from './summary.js';

// ── P1-1 : drainage sélectif de l'outbox ──
// Retire uniquement les ids réellement poussés ; préserve tout id ajouté
// pendant la synchronisation (concurrence).
export function outboxAfterDrain(current, drainedIds) {
  const drained = new Set(drainedIds || []);
  return (current || []).filter((id) => !drained.has(id));
}

// ── P1-4 : validation d'import JSON ──
export const SUPPORTED_EVENT_TYPES = ['feed', 'diaper'];

function isNonEmptyString(v) {
  return typeof v === 'string' && v.trim().length > 0;
}

function eventDateValue(e) {
  return e && e.type === 'feed' ? e.start : e && e.time;
}

// Un événement est valide s'il a un id non vide, un type supporté et une date
// analysable. Les champs manquants non critiques sont complétés (normalisation).
export function isValidEvent(e) {
  if (!e || typeof e !== 'object') return false;
  if (!isNonEmptyString(e.id)) return false;
  if (!SUPPORTED_EVENT_TYPES.includes(e.type)) return false;
  const d = eventDateValue(e);
  if (!isNonEmptyString(d)) return false;
  return Number.isFinite(new Date(d).getTime());
}

// Complète seulement les champs manquants compatibles, sans altérer l'existant.
export function normalizeEvent(e) {
  const d = eventDateValue(e);
  return {
    ...e,
    deleted: !!e.deleted,
    updatedAt: isNonEmptyString(e.updatedAt) ? e.updatedAt : d,
  };
}

// Valide la structure globale + chaque événement. Refuse tout le fichier si une
// donnée critique est invalide. Renvoie { ok, error } ou { ok, events }.
export function validateBackup(data) {
  if (!data || typeof data !== 'object') {
    return { ok: false, error: 'Fichier illisible ou vide.' };
  }
  if (data.app !== 'newborn-monitor') {
    return { ok: false, error: "Ce fichier n'est pas une sauvegarde Newborn Monitor." };
  }
  if (!Array.isArray(data.events)) {
    return { ok: false, error: 'Sauvegarde invalide : liste d’événements manquante.' };
  }
  for (const e of data.events) {
    if (!isValidEvent(e)) {
      return {
        ok: false,
        error:
          'Sauvegarde refusée : un ou plusieurs événements sont invalides ' +
          '(id, type ou date manquant/incorrect).',
      };
    }
  }
  return { ok: true, events: data.events.map(normalizeEvent) };
}

// Décision de restauration (P1-2 + P1-4). currentActiveCount = nombre
// d'événements locaux actifs qui seraient remplacés.
export function prepareRestore(data, currentActiveCount) {
  const v = validateBackup(data);
  if (!v.ok) return { status: 'invalid', error: v.error };
  if (currentActiveCount > 0) {
    return { status: 'confirm', replaceCount: currentActiveCount, events: v.events, baby: data.baby };
  }
  return { status: 'apply', events: v.events, baby: data.baby };
}

// ── P1-3 : dimensions de redimensionnement d'une photo (préserve le ratio) ──
export function computeResizeDimensions(w, h, maxDim) {
  if (!(w > 0) || !(h > 0)) return { width: w, height: h };
  const longest = Math.max(w, h);
  if (longest <= maxDim) return { width: Math.round(w), height: Math.round(h) };
  const scale = maxDim / longest;
  return { width: Math.round(w * scale), height: Math.round(h * scale) };
}

// Réexport pour les vues qui reconstruisent la date d'un événement.
export { eventTime };
