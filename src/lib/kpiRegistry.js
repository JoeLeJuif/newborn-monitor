// Registre déclaratif du tableau de bord KPI.
//
// Objectif : le rendu ITÈRE sur ces listes au lieu d'enchaîner des blocs JSX
// conditionnels. Ajouter, masquer ou réordonner une carte devient une
// modification de données, pas de balisage.
//
// Ce fichier reste PUR (aucun import React, aucun JSX) pour trois raisons :
// il est testable sans moteur de rendu, il ne peut pas introduire de cycle
// d'imports, et la correspondance id → composant vit dans la couche
// d'affichage (KpiDashboard.jsx), seule responsable du visuel.
//
// Deux listes, parce que ce sont deux natures différentes :
//   * KPI_TILES    — de simples valeurs chiffrées, rendues par un composant
//                    unique ; chaque entrée décrit COMMENT extraire la valeur ;
//   * KPI_SECTIONS — des blocs autonomes ayant chacun leur propre composant.

// Groupes d'affichage. `order` fixe leur succession sur la page.
export const CARD_GROUPS = [
  { id: 'resume', label: 'Résumé', order: 1 },
  { id: 'graphiques', label: 'Graphiques', order: 2 },
  { id: 'qualite', label: 'Qualité des données', order: 3 },
];

// ── Tuiles chiffrées de la grille ───────────────────────────────────────────
// `value(d)`   : extrait la valeur brute depuis le résultat de computeDashboard
// `visible(d)` : une tuile sans valeur à montrer n'est pas rendue (règle
//                unifiée du Sprint 2.1). Les COMPTAGES restent toujours
//                visibles : « 0 » y est une information, pas une absence.
// `kind`       : indique au rendu quel formateur appliquer.
export const KPI_TILES = [
  { id: 'feeds', label: 'Boires', group: 'resume', kind: 'count', value: (d) => d.kpi.feedCount, visible: () => true },
  { id: 'breastSec', label: 'Temps au sein', group: 'resume', kind: 'duration', value: (d) => d.kpi.breastSec, visible: (d) => d.kpi.breastSec > 0 },
  { id: 'avgDuration', label: 'Durée moyenne', group: 'resume', kind: 'duration', value: (d) => d.kpi.avgDurationSec, visible: (d) => d.kpi.avgDurationSec != null },
  { id: 'pees', label: 'Pipis', group: 'resume', kind: 'count', value: (d) => d.kpi.pees, visible: () => true },
  { id: 'poops', label: 'Selles', group: 'resume', kind: 'count', value: (d) => d.kpi.poops, visible: () => true },
  { id: 'avgInterval', label: 'Intervalle moyen', group: 'resume', kind: 'interval', value: (d) => d.kpi.avgIntervalMs, visible: (d) => d.kpi.avgIntervalMs != null },
  { id: 'longestInterval', label: 'Plus long intervalle', group: 'resume', kind: 'interval', value: (d) => d.kpi.longestIntervalMs, visible: (d) => d.kpi.longestIntervalMs != null },
  { id: 'totalMl', label: 'Quantité totale', group: 'resume', kind: 'ml', value: (d) => d.kpi.totalMl, visible: (d) => d.kpi.mlCount > 0 },
  { id: 'avgMl', label: 'Quantité moyenne', group: 'resume', kind: 'ml', value: (d) => d.kpi.avgMl, visible: (d) => d.kpi.mlCount > 0 },
];

// ── Sections ────────────────────────────────────────────────────────────────
// `title`       : titre fixe, ou null quand il dépend de la période choisie
//                 (`titleOf(periodLabel)` prend alors le relais).
// `periodBound` : true si la section suit la période sélectionnée. Les
//                 sections à false sont documentées dans computeDashboard :
//                 les faire suivre changerait leur calcul.
export const KPI_SECTIONS = [
  { id: 'last', title: 'Derniers événements', group: 'resume', periodBound: false, visible: () => true },
  { id: 'tiles', title: null, titleOf: (p) => `Sur ${p}`, group: 'resume', periodBound: true, visible: () => true },
  { id: 'breakdown', title: null, titleOf: (p) => `Types de boires (${p})`, group: 'resume', periodBound: true, visible: (d) => d.kpi.feedCount > 0 },
  { id: 'trend', title: 'Tendance sur 7 jours', group: 'graphiques', periodBound: false, visible: () => true },
  { id: 'intervals', title: 'Intervalles entre les boires', group: 'graphiques', periodBound: false, visible: () => true },
  { id: 'dayNight', title: null, titleOf: (p) => `Jour / nuit (${p})`, group: 'graphiques', periodBound: true, visible: () => true },
  { id: 'side', title: null, titleOf: (p) => `Gauche / droite (durée au sein, ${p})`, group: 'graphiques', periodBound: true, visible: () => true },
  { id: 'hourly', title: null, titleOf: (p) => `Activité par heure (${p})`, group: 'graphiques', periodBound: true, visible: () => true },
  { id: 'insights', title: 'Observations', group: 'qualite', periodBound: false, visible: (d) => d.insights.length > 0 },
  { id: 'completeness', title: null, titleOf: (p) => `Complétude des saisies (${p})`, group: 'qualite', periodBound: true, visible: () => true },
];

// Titre effectif d'une entrée pour une période donnée.
export function titleFor(entry, periodLabel) {
  if (entry.title) return entry.title;
  return typeof entry.titleOf === 'function' ? entry.titleOf(periodLabel) : '';
}

// Entrées à rendre, dans l'ordre, pour un jeu de données donné.
// `hiddenIds` est déjà pris en charge, bien que l'interface ne l'alimente pas
// encore : les préférences correspondantes existent (cf. kpiPrefs.js), le
// sprint suivant n'aura qu'à brancher un sélecteur dessus.
export function visibleSections(dashboard, hiddenIds = []) {
  const hidden = new Set(hiddenIds);
  return KPI_SECTIONS.filter((s) => !hidden.has(s.id) && s.visible(dashboard));
}

export function visibleTiles(dashboard, hiddenIds = []) {
  const hidden = new Set(hiddenIds);
  return KPI_TILES.filter((t) => !hidden.has(t.id) && t.visible(dashboard));
}

// ── Sprint 4 : ordre personnalisé et favoris ────────────────────────────────
//
// Les tuiles et les sections forment DEUX groupes indépendants : une tuile ne
// peut jamais devenir une section. Comme leurs ids sont disjoints, un même
// `order` plat décrit les deux — chaque appel d'`applyOrder` ne retient que les
// ids de sa liste et ignore le reste.
//
// Robustesse aux évolutions du registre :
//   * un id d'`order` inconnu de la liste est ignoré (KPI retiré d'un sprint) ;
//   * une entrée du registre absente d'`order` est ajoutée à la fin, dans
//     l'ordre du registre (un KPI ajouté plus tard apparaît proprement) ;
//   * dans le groupe, les favoris passent devant, l'ordre relatif restant
//     celui calculé ci-dessus (partition stable).
export function applyOrder(entries, order = [], favorites = []) {
  const byId = new Map(entries.map((e) => [e.id, e]));
  const seen = new Set();
  const base = [];
  for (const id of order) {
    const e = byId.get(id);
    if (e && !seen.has(id)) {
      base.push(e);
      seen.add(id);
    }
  }
  for (const e of entries) {
    if (!seen.has(e.id)) {
      base.push(e);
      seen.add(e.id);
    }
  }
  const fav = new Set(favorites);
  return [...base.filter((e) => fav.has(e.id)), ...base.filter((e) => !fav.has(e.id))];
}

// Ordre affiché d'un groupe, sous forme d'ids.
export function arrangedIds(entries, order, favorites) {
  return applyOrder(entries, order, favorites).map((e) => e.id);
}

// Peut-on déplacer `id` d'un cran (dir = -1 monter, +1 descendre) sans quitter
// sa bande favori / non-favori ? Sert à désactiver les boutons aux limites.
export function canMove(entries, order, favorites, id, dir) {
  const ids = arrangedIds(entries, order, favorites);
  const i = ids.indexOf(id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= ids.length) return false;
  const fav = new Set(favorites);
  return fav.has(ids[i]) === fav.has(ids[j]);
}

// Nouvel ordre (ids du groupe) après déplacement ; inchangé si impossible.
// Les échanges ne franchissent jamais la frontière favori/non-favori, donc la
// séquence renvoyée reste cohérente avec l'affichage favoris-d'abord.
export function movedGroupOrder(entries, order, favorites, id, dir) {
  const ids = arrangedIds(entries, order, favorites);
  if (!canMove(entries, order, favorites, id, dir)) return ids;
  const i = ids.indexOf(id);
  const j = i + dir;
  [ids[i], ids[j]] = [ids[j], ids[i]];
  return ids;
}

// `order` plat reconstruit pour les deux groupes : chaque groupe est réécrit
// dans son ordre affiché courant, ce qui fige une disposition non ambiguë.
export function fullOrder(order, favorites) {
  return [
    ...arrangedIds(KPI_TILES, order, favorites),
    ...arrangedIds(KPI_SECTIONS, order, favorites),
  ];
}

// Tous les ids personnalisables (tuiles + sections).
export const CUSTOMIZABLE_IDS = [...KPI_TILES, ...KPI_SECTIONS].map((e) => e.id);

// Nombre d'éléments NON masqués par l'utilisateur (indépendamment des données).
// Sert au garde-fou « ne jamais tout masquer ».
export function visibleCount(hiddenCards = []) {
  const hidden = new Set(hiddenCards);
  return CUSTOMIZABLE_IDS.filter((id) => !hidden.has(id)).length;
}

// Sections finalement rendues : ordre + favoris + masquage + visibilité données.
export function dashboardSections(dashboard, prefs = {}) {
  const hidden = new Set(prefs.hiddenCards || []);
  return applyOrder(KPI_SECTIONS, prefs.order, prefs.favorites).filter(
    (s) => !hidden.has(s.id) && s.visible(dashboard),
  );
}

// Tuiles finalement rendues : même chaîne que les sections.
export function dashboardTiles(dashboard, prefs = {}) {
  const hidden = new Set(prefs.hiddenCards || []);
  return applyOrder(KPI_TILES, prefs.order, prefs.favorites).filter(
    (t) => !hidden.has(t.id) && t.visible(dashboard),
  );
}
