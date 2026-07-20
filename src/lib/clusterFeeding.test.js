import { describe, it, expect } from 'vitest';
import {
  detectClusterFeedings,
  groupFeedRuns,
  CLUSTER_GAP_MINUTES,
  CLUSTER_MIN_FEEDS,
} from './clusterFeeding.js';

// Base horaire fixe pour des tests déterministes quel que soit le fuseau.
const BASE = new Date('2026-07-15T19:00:00').getTime();
const MIN = 60000;

let seq = 0;
// Boire au sein par défaut ; `atMin` = minutes après BASE ; `durMin` = durée.
function feed(atMin, extra = {}) {
  const iso = new Date(BASE + atMin * MIN).toISOString();
  return {
    id: `f${seq++}`,
    type: 'feed',
    start: iso,
    updatedAt: iso,
    deleted: false,
    feedType: 'left',
    durationSec: 0, // ponctuel par défaut : l'écart se mesure début → début
    amountMl: null,
    ...extra,
  };
}
const shuffle = (a) => [...a].sort(() => Math.random() - 0.5);

describe('detectClusterFeedings — cas limites', () => {
  it('aucun boire : liste vide', () => {
    expect(detectClusterFeedings([])).toEqual([]);
    expect(detectClusterFeedings(null)).toEqual([]);
    expect(detectClusterFeedings(undefined)).toEqual([]);
  });

  it('un seul boire : aucun cluster', () => {
    expect(detectClusterFeedings([feed(0)])).toEqual([]);
  });

  it('deux boires rapprochés : pas un cluster (< 3)', () => {
    // 19:00 et 19:30 → 30 min, rapprochés mais seulement 2 boires.
    const out = detectClusterFeedings([feed(0), feed(30)]);
    expect(out).toEqual([]);
  });

  it('trois boires rapprochés : un cluster reconnu', () => {
    const out = detectClusterFeedings([feed(0), feed(28), feed(55)]);
    expect(out).toHaveLength(1);
    expect(out[0].isClusterFeeding).toBe(true);
    expect(out[0].feedCount).toBe(3);
  });

  it('exemple reconnu du cahier : 19:00 / 19:28 / 19:55 / 20:21 → 1 cluster', () => {
    const out = detectClusterFeedings([feed(0), feed(28), feed(55), feed(81)]);
    expect(out).toHaveLength(1);
    expect(out[0].feedCount).toBe(4);
    expect(out[0].startAt).toBe(new Date(BASE).toISOString());
    expect(out[0].endAt).toBe(new Date(BASE + 81 * MIN).toISOString());
  });

  it('exemple non reconnu du cahier : 19:00 / 20:10 / 21:30 → aucun cluster', () => {
    // Écarts de 70 et 80 min : chaque boire est isolé.
    const out = detectClusterFeedings([feed(0), feed(70), feed(150)]);
    expect(out).toEqual([]);
  });
});

describe('detectClusterFeedings — seuil', () => {
  it('seuil exactement à 45 minutes : inclus (≤ 45)', () => {
    // Boires ponctuels espacés de 45 min pile → un seul cluster de 3.
    const out = detectClusterFeedings([feed(0), feed(45), feed(90)]);
    expect(out).toHaveLength(1);
    expect(out[0].feedCount).toBe(3);
  });

  it('seuil à 46 minutes : rupture → aucun cluster de 3', () => {
    // 0, 46, 92 : chaque écart 46 min > 45 → trois épisodes de 1 boire.
    const out = detectClusterFeedings([feed(0), feed(46), feed(92)]);
    expect(out).toEqual([]);
  });

  it("l'écart se mesure FIN → début, pas début → début", () => {
    // Deux boires de 20 min de durée, débuts espacés de 60 min :
    // fin du 1er à 20 min, début du 2e à 60 min → écart 40 min ≤ 45.
    const feeds = [
      feed(0, { durationSec: 20 * 60 }),
      feed(60, { durationSec: 20 * 60 }),
      feed(120, { durationSec: 20 * 60 }),
    ];
    const out = detectClusterFeedings(feeds);
    expect(out).toHaveLength(1);
    expect(out[0].feedCount).toBe(3);
  });
});

describe('detectClusterFeedings — plusieurs clusters', () => {
  it('deux clusters distincts dans la même journée', () => {
    const feeds = [
      // Cluster A : 3 boires rapprochés.
      feed(0),
      feed(30),
      feed(60),
      // Grand trou (> 45 min).
      feed(240),
      // Cluster B : 3 boires rapprochés.
      feed(270),
      feed(300),
    ];
    const out = detectClusterFeedings(feeds);
    expect(out).toHaveLength(2);
    expect(out[0].feedCount).toBe(3);
    expect(out[1].feedCount).toBe(3);
    // Triés chronologiquement.
    expect(new Date(out[0].startAt).getTime()).toBeLessThan(
      new Date(out[1].startAt).getTime(),
    );
  });

  it('un run de 2 entre deux clusters n\'est pas reconnu', () => {
    const feeds = [
      feed(0),
      feed(30),
      feed(60), // cluster de 3
      feed(200),
      feed(230), // run de 2 → écarté
      feed(400),
      feed(430),
      feed(460), // cluster de 3
    ];
    const out = detectClusterFeedings(feeds);
    expect(out).toHaveLength(2);
    expect(out.every((c) => c.feedCount === 3)).toBe(true);
  });
});

describe('detectClusterFeedings — agrégats par type', () => {
  it('allaitement uniquement : breastMinutes cumulé, bottleMl à zéro', () => {
    const feeds = [
      feed(0, { feedType: 'left', durationSec: 600 }),
      feed(30, { feedType: 'right', durationSec: 300 }),
      feed(60, { feedType: 'both', durationSec: 900 }),
    ];
    const out = detectClusterFeedings(feeds);
    expect(out).toHaveLength(1);
    const c = out[0];
    expect(c.breastMinutes).toBe((600 + 300 + 900) / 60);
    expect(c.bottleMl).toBe(0);
    expect(c.feedTypes).toEqual(['left', 'right', 'both']);
    expect(c.sidesUsed).toEqual(['left', 'right', 'both']);
  });

  it('biberons uniquement : bottleMl cumulé, aucun côté', () => {
    const feeds = [
      feed(0, { feedType: 'formula', amountMl: 60, durationSec: null }),
      feed(30, { feedType: 'breastmilk_bottle', amountMl: 45, durationSec: null }),
      feed(60, { feedType: 'formula', amountMl: 30, durationSec: null }),
    ];
    const out = detectClusterFeedings(feeds);
    expect(out).toHaveLength(1);
    const c = out[0];
    expect(c.bottleMl).toBe(135);
    expect(c.breastMinutes).toBe(0);
    expect(c.sidesUsed).toEqual([]);
    expect(c.feedTypes).toEqual(['formula', 'breastmilk_bottle']);
  });

  it('mélange allaitement / biberon : les deux agrégats coexistent', () => {
    const feeds = [
      feed(0, { feedType: 'left', durationSec: 600 }),
      feed(30, { feedType: 'formula', amountMl: 50, durationSec: null }),
      feed(60, { feedType: 'right', durationSec: 300 }),
    ];
    const out = detectClusterFeedings(feeds);
    expect(out).toHaveLength(1);
    const c = out[0];
    expect(c.breastMinutes).toBe((600 + 300) / 60);
    expect(c.bottleMl).toBe(50);
    expect(c.sidesUsed).toEqual(['left', 'right']);
    expect(c.feedTypes).toEqual(['left', 'formula', 'right']);
  });
});

describe('detectClusterFeedings — robustesse des entrées', () => {
  it('événements non triés en entrée : résultat identique une fois triés', () => {
    const ordered = [feed(0), feed(28), feed(55), feed(81)];
    const out = detectClusterFeedings(shuffle(ordered));
    expect(out).toHaveLength(1);
    expect(out[0].feedCount).toBe(4);
    expect(out[0].startAt).toBe(new Date(BASE).toISOString());
    expect(out[0].endAt).toBe(new Date(BASE + 81 * MIN).toISOString());
  });

  it('ignore tombstones, non-boires, horodatages invalides et boires en cours', () => {
    const feeds = [
      feed(0),
      feed(30),
      feed(60),
      feed(45, { deleted: true }),
      feed(50, { inProgress: true }),
      { id: 'x', type: 'diaper', time: new Date(BASE + 20 * MIN).toISOString() },
      feed(40, { start: 'pas-une-date' }),
      null,
    ];
    const out = detectClusterFeedings(feeds);
    expect(out).toHaveLength(1);
    expect(out[0].feedCount).toBe(3);
  });

  it('ne mute jamais les événements sources', () => {
    const feeds = [feed(0), feed(30), feed(60)];
    const snapshot = JSON.parse(JSON.stringify(feeds));
    detectClusterFeedings(feeds);
    expect(feeds).toEqual(snapshot);
  });
});

describe('detectClusterFeedings — configurabilité & extensibilité', () => {
  it('constantes par défaut exposées', () => {
    expect(CLUSTER_GAP_MINUTES).toBe(45);
    expect(CLUSTER_MIN_FEEDS).toBe(3);
  });

  it('seuil configurable via options.gapMinutes', () => {
    // Avec 20 min de seuil, des boires espacés de 30 min ne se regroupent plus.
    const feeds = [feed(0), feed(30), feed(60)];
    expect(detectClusterFeedings(feeds, { gapMinutes: 20 })).toEqual([]);
    expect(detectClusterFeedings(feeds, { gapMinutes: 45 })).toHaveLength(1);
  });

  it('minimum configurable via options.minFeeds', () => {
    const feeds = [feed(0), feed(30)];
    // Deux boires reconnus si le minimum descend à 2.
    const out = detectClusterFeedings(feeds, { minFeeds: 2 });
    expect(out).toHaveLength(1);
    expect(out[0].feedCount).toBe(2);
  });

  it('règles additionnelles ET-ées sans casser la règle de base', () => {
    const feeds = [
      feed(0, { feedType: 'formula', amountMl: 20, durationSec: null }),
      feed(30, { feedType: 'formula', amountMl: 20, durationSec: null }),
      feed(60, { feedType: 'formula', amountMl: 20, durationSec: null }),
    ];
    // Règle : n'accepter que les clusters d'au moins 100 ml au biberon.
    const bottleHeavy = (c) => c.bottleMl >= 100;
    expect(detectClusterFeedings(feeds, { rules: [bottleHeavy] })).toEqual([]);
    expect(detectClusterFeedings(feeds)).toHaveLength(1);
  });

  it('includeSubThreshold expose les runs non reconnus avec isClusterFeeding false', () => {
    const feeds = [feed(0), feed(30)]; // run de 2 seulement
    const out = detectClusterFeedings(feeds, { includeSubThreshold: true });
    expect(out).toHaveLength(1);
    expect(out[0].isClusterFeeding).toBe(false);
    expect(out[0].feedCount).toBe(2);
  });
});

describe('groupFeedRuns', () => {
  it('regroupe sans appliquer le minimum de boires', () => {
    const runs = groupFeedRuns([feed(0), feed(30), feed(200), feed(230)]);
    expect(runs.map((r) => r.length)).toEqual([2, 2]);
  });
});
