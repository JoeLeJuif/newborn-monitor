import { describe, it, expect } from 'vitest';
import {
  KPI_TILES,
  KPI_SECTIONS,
  CARD_GROUPS,
  titleFor,
  visibleSections,
  visibleTiles,
  applyOrder,
  arrangedIds,
  canMove,
  movedGroupOrder,
  visibleCount,
  CUSTOMIZABLE_IDS,
  dashboardSections,
  dashboardTiles,
} from './kpiRegistry.js';
import { computeDashboard } from './stats.js';

const NOW = new Date('2026-07-15T12:00:00').getTime();
const H = 3600000;
const D = 86400000;
let seq = 0;
const feed = (offMs, extra = {}) => {
  const iso = new Date(NOW - offMs).toISOString();
  return { id: `r${seq++}`, type: 'feed', start: iso, updatedAt: iso, deleted: false, feedType: 'left', durationSec: 600, amountMl: null, ...extra };
};
const dash = (evs, periodDays = 1) => computeDashboard(evs, NOW, { periodDays });

describe('Sprint 3 — structure du registre', () => {
  it('chaque entrée déclare id, groupe et condition de visibilité', () => {
    const groupes = new Set(CARD_GROUPS.map((g) => g.id));
    for (const entry of [...KPI_TILES, ...KPI_SECTIONS]) {
      expect(typeof entry.id).toBe('string');
      expect(entry.id.length).toBeGreaterThan(0);
      expect(groupes.has(entry.group)).toBe(true);
      expect(typeof entry.visible).toBe('function');
    }
  });

  it('les identifiants sont uniques dans chaque liste', () => {
    const ids = (l) => l.map((x) => x.id);
    expect(new Set(ids(KPI_TILES)).size).toBe(KPI_TILES.length);
    expect(new Set(ids(KPI_SECTIONS)).size).toBe(KPI_SECTIONS.length);
  });

  it('chaque section a un titre fixe OU un titre dépendant de la période', () => {
    for (const s of KPI_SECTIONS) {
      const t = titleFor(s, '7 jours');
      expect(typeof t).toBe('string');
      expect(t.length).toBeGreaterThan(0);
    }
  });

  it('les titres liés à la période reprennent le libellé choisi', () => {
    const hourly = KPI_SECTIONS.find((s) => s.id === 'hourly');
    expect(titleFor(hourly, '30 jours')).toBe('Activité par heure (30 jours)');
    // Une section non liée à la période garde son titre fixe.
    const trend = KPI_SECTIONS.find((s) => s.id === 'trend');
    expect(trend.periodBound).toBe(false);
    expect(titleFor(trend, '24 h')).toBe('Tendance sur 7 jours');
  });
});

describe('Sprint 3 — visibilité pilotée par les données', () => {
  it('allaitement exclusif : aucune tuile de quantité', () => {
    const d = dash([feed(1 * H, { durationSec: 900 }), feed(4 * H, { durationSec: 600 })]);
    const ids = visibleTiles(d).map((t) => t.id);
    expect(ids).not.toContain('totalMl');
    expect(ids).not.toContain('avgMl');
    expect(ids).toContain('avgDuration');
  });

  it('quantités saisies : les deux tuiles apparaissent', () => {
    const d = dash([feed(1 * H, { feedType: 'formula', durationSec: 0, amountMl: 90 }), feed(4 * H, { durationSec: 600 })]);
    const ids = visibleTiles(d).map((t) => t.id);
    expect(ids).toContain('totalMl');
    expect(ids).toContain('avgMl');
  });

  it('un seul boire : les tuiles d’intervalle disparaissent, les comptages restent', () => {
    const d = dash([feed(2 * H)]);
    const ids = visibleTiles(d).map((t) => t.id);
    expect(ids).not.toContain('avgInterval');
    expect(ids).not.toContain('longestInterval');
    expect(ids).toContain('feeds');
    expect(ids).toContain('pees'); // « 0 » est une information
  });

  it('aucun boire : la section « Types de boires » est masquée', () => {
    const d = dash([]);
    expect(visibleSections(d).map((s) => s.id)).not.toContain('breakdown');
  });

  it('les cartes masquées par préférence sont retirées', () => {
    const d = dash([feed(1 * H), feed(5 * H)]);
    const ids = visibleSections(d, ['hourly', 'trend']).map((s) => s.id);
    expect(ids).not.toContain('hourly');
    expect(ids).not.toContain('trend');
    expect(ids).toContain('last');
    expect(visibleTiles(d, ['feeds']).map((t) => t.id)).not.toContain('feeds');
  });

  it('l’ordre du registre est préservé au rendu', () => {
    const d = dash([feed(1 * H), feed(5 * H)]);
    const rendu = visibleSections(d).map((s) => s.id);
    const attendu = KPI_SECTIONS.filter((s) => rendu.includes(s.id)).map((s) => s.id);
    expect(rendu).toEqual(attendu);
    expect(rendu[0]).toBe('last'); // « Derniers événements » reste en tête
  });
});

describe('Sprint 3 — la période pilote les statistiques', () => {
  const evs = [feed(2 * H), feed(2 * D), feed(10 * D), feed(25 * D)];

  it('changer de période change la fenêtre agrégée', () => {
    expect(dash(evs, 1).kpi.feedCount).toBe(1);
    expect(dash(evs, 3).kpi.feedCount).toBe(2);
    expect(dash(evs, 7).kpi.feedCount).toBe(2);
    expect(dash(evs, 30).kpi.feedCount).toBe(4);
  });

  it('« Tout » borne au premier événement, sans remonter à l’époque Unix', () => {
    const d = dash(evs, null);
    expect(d.kpi.feedCount).toBe(4);
    expect(d.period.fromMs).toBe(NOW - 25 * D);
    expect(d.period.effectiveDays).toBe(25);
  });

  it('« Tout » sans aucun événement : pas de division par zéro', () => {
    const d = dash([], null);
    expect(d.period.effectiveDays).toBe(1);
    expect(Number.isNaN(d.kpi.peesPerDay)).toBe(false);
  });

  it('la période par défaut reproduit le comportement historique (24 h)', () => {
    expect(computeDashboard(evs, NOW).kpi.feedCount).toBe(dash(evs, 1).kpi.feedCount);
    expect(computeDashboard(evs, NOW).period.days).toBe(1);
  });

  it('la tendance reste une série de 7 jours, quelle que soit la période', () => {
    expect(dash(evs, 1).trend).toHaveLength(7);
    expect(dash(evs, 30).trend).toHaveLength(7);
    expect(dash(evs, null).trend).toHaveLength(7);
  });
});

// ── Sprint 4 : ordre, favoris, masquage ─────────────────────────────────────

describe('Sprint 4 — applyOrder', () => {
  const tileIds = KPI_TILES.map((t) => t.id);

  it('sans préférence : ordre du registre inchangé', () => {
    expect(applyOrder(KPI_TILES).map((t) => t.id)).toEqual(tileIds);
  });

  it('ordre personnalisé respecté', () => {
    const order = ['pees', 'feeds'];
    const got = applyOrder(KPI_TILES, order).map((t) => t.id);
    expect(got.slice(0, 2)).toEqual(['pees', 'feeds']);
    // le reste suit dans l'ordre du registre
    expect(got.slice(2)).toEqual(tileIds.filter((id) => id !== 'pees' && id !== 'feeds'));
  });

  it('ids inconnus ignorés, nouveaux ids ajoutés à la fin', () => {
    const order = ['fantome', 'pees', 'autre-fantome'];
    const got = applyOrder(KPI_TILES, order).map((t) => t.id);
    expect(got).not.toContain('fantome');
    expect(got[0]).toBe('pees');
    expect(got).toHaveLength(KPI_TILES.length); // toutes les tuiles réelles présentes
    expect(new Set(got).size).toBe(got.length); // aucun doublon
  });

  it('favoris placés avant les non-favoris, ordre relatif préservé', () => {
    const order = [];
    const favorites = ['poops', 'feeds']; // feeds vient avant poops dans le registre
    const got = applyOrder(KPI_TILES, order, favorites).map((t) => t.id);
    expect(got.slice(0, 2)).toEqual(['feeds', 'poops']); // favoris d'abord, ordre du registre
    expect(got.slice(2)[0]).toBe('breastSec'); // premier non-favori
  });

  it('tuiles et sections ne se mélangent jamais (ids disjoints)', () => {
    const order = ['trend', 'feeds']; // un id de section glissé dans l'ordre des tuiles
    const tiles = applyOrder(KPI_TILES, order).map((t) => t.id);
    expect(tiles).not.toContain('trend'); // la section est ignorée côté tuiles
    expect(tiles).toContain('feeds');
  });
});

describe('Sprint 4 — déplacements', () => {
  it('bouton désactivé aux limites du groupe', () => {
    const first = KPI_SECTIONS[0].id;
    const last = KPI_SECTIONS[KPI_SECTIONS.length - 1].id;
    expect(canMove(KPI_SECTIONS, [], [], first, -1)).toBe(false);
    expect(canMove(KPI_SECTIONS, [], [], last, +1)).toBe(false);
    expect(canMove(KPI_SECTIONS, [], [], first, +1)).toBe(true);
  });

  it('descendre échange avec le voisin immédiat', () => {
    const ids = arrangedIds(KPI_SECTIONS, [], []);
    const moved = movedGroupOrder(KPI_SECTIONS, [], [], ids[0], +1);
    expect(moved[0]).toBe(ids[1]);
    expect(moved[1]).toBe(ids[0]);
  });

  it('un déplacement ne franchit jamais la frontière favori / non-favori', () => {
    const favorites = [KPI_SECTIONS[0].id]; // un seul favori, en tête
    const ids = arrangedIds(KPI_SECTIONS, [], favorites);
    const favId = ids[0];
    // le favori est seul dans sa bande : impossible de le descendre chez les non-favoris
    expect(canMove(KPI_SECTIONS, [], favorites, favId, +1)).toBe(false);
    // le premier non-favori ne peut pas remonter au-dessus du favori
    expect(canMove(KPI_SECTIONS, [], favorites, ids[1], -1)).toBe(false);
  });
});

describe('Sprint 4 — garde-fou « ne pas tout masquer »', () => {
  it('compte les éléments non masqués sur les deux groupes', () => {
    expect(visibleCount([])).toBe(CUSTOMIZABLE_IDS.length);
    expect(visibleCount([CUSTOMIZABLE_IDS[0]])).toBe(CUSTOMIZABLE_IDS.length - 1);
  });

  it('un seul élément visible restant', () => {
    const allButOne = CUSTOMIZABLE_IDS.slice(1);
    expect(visibleCount(allButOne)).toBe(1);
  });
});

describe('Sprint 4 — rendu du tableau de bord (ordre + masquage + données)', () => {
  const d = dash([feed(1 * H), feed(5 * H)]);

  it('les sections masquées disparaissent, les conditions de données restent', () => {
    const ids = dashboardSections(d, { hiddenCards: ['trend'], order: [], favorites: [] }).map((s) => s.id);
    expect(ids).not.toContain('trend'); // masquée par préférence
    expect(ids).toContain('breakdown'); // 2 boires -> feedCount>0, condition de données remplie
    expect(ids).toContain('last');
  });

  it('une section sans données reste masquée même si non masquée par préférence', () => {
    const vide = dash([]); // aucun boire -> breakdown invisible par condition de données
    const ids = dashboardSections(vide, { hiddenCards: [], order: [], favorites: [] }).map((s) => s.id);
    expect(ids).not.toContain('breakdown');
  });

  it('les favoris passent en tête du rendu', () => {
    const ids = dashboardSections(d, { hiddenCards: [], order: [], favorites: ['hourly'] }).map((s) => s.id);
    expect(ids[0]).toBe('hourly');
  });

  it('les tuiles suivent ordre, favoris et masquage', () => {
    const ids = dashboardTiles(d, { hiddenCards: ['feeds'], order: [], favorites: ['pees'] }).map((t) => t.id);
    expect(ids).not.toContain('feeds');
    expect(ids[0]).toBe('pees');
  });
});
