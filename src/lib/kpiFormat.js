// Formatage d'affichage du tableau de bord KPI.
//
// Fichier séparé des composants : ce sont des fonctions pures, elles doivent
// pouvoir être importées sans casser le rafraîchissement à chaud de React
// (une seule nature d'export par fichier) et être testables telles quelles.
import { formatDuration, formatTime, elapsedSince } from './time.js';

const iso = (t) => (t == null ? null : new Date(t).toISOString());

export const fmtClock = (t) => (t == null ? '—' : formatTime(iso(t)));
export const fmtElapsed = (t, nowMs) => (t == null ? 'aucun' : elapsedSince(iso(t), nowMs));
export const fmtDur = (sec) => (sec == null ? '—' : formatDuration(Math.round(sec)));
export const fmtInterval = (ms) => (ms == null ? '—' : formatDuration(Math.round(ms / 1000)));
export const fmtPct = (x) => (x == null ? '—' : `${Math.round(x * 100)} %`);

// Applique le formateur correspondant au `kind` déclaré dans le registre.
export function formatTile(kind, value) {
  if (kind === 'duration') return { value: fmtDur(value) };
  if (kind === 'interval') return { value: fmtInterval(value) };
  if (kind === 'ml') return { value: Math.round(value), unit: 'ml' };
  return { value: String(value) };
}
