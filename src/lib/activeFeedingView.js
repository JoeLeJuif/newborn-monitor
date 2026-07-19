// Vue d'affichage du MODE « boire en cours » (session active).
//
// Fonctions PURES et sans état : elles ne font que dériver, depuis une session
// existante, ce que le formulaire doit afficher quand un boire est déjà
// chronométré. Aucune logique de session ici — le calcul du temps et les
// transitions restent dans feedingSession.js, qui n'est jamais modifié.
import { formatTime } from './time.js';
import { sideLabel } from './constants.js';
import { isRunning } from './feedingSession.js';

// Faut-il présenter le MODE session (au lieu du formulaire de création) ?
// Vrai uniquement pour un nouveau boire (jamais en modification d'un boire
// existant) lorsqu'une session est active.
export function isSessionMode(session, editId) {
  return !!session && !editId;
}

// Ligne de statut sous le titre : « Sein droit · commencé à 19:24 »,
// suivie de « · en pause » quand la minuterie ne tourne pas.
//
// Volontairement SANS « il y a X min » : le gros chronomètre affiche déjà le
// temps écoulé, l'y répéter serait redondant.
export function sessionStatusLine(session) {
  if (!session) return '';
  const base = `${sideLabel(session.currentSide)} · commencé à ${formatTime(session.startedAt)}`;
  return isRunning(session) ? base : `${base} · en pause`;
}
