import { describe, it, expect } from 'vitest';
import {
  detectClusterFeedings,
  groupFeedRuns,
  clusterConfidence,
  CLUSTER_GAP_MINUTES,
  CLUSTER_MIN_FEEDS,
  CLUSTER_GAP_MODES,
  DEFAULT_GAP_MODE,
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

  it('end-to-start explicite : mesure FIN → début', () => {
    // Deux boires de 20 min de durée, débuts espacés de 60 min :
    // fin du 1er à 20 min, début du 2e à 60 min → écart 40 min ≤ 45.
    const feeds = [
      feed(0, { durationSec: 20 * 60 }),
      feed(60, { durationSec: 20 * 60 }),
      feed(120, { durationSec: 20 * 60 }),
    ];
    const out = detectClusterFeedings(feeds, { gapMode: 'end-to-start' });
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

// ── V1.1 : stratégie d'intervalle (gapMode) ─────────────────────────────────

describe('gapMode', () => {
  it('constantes exposées, défaut start-to-start', () => {
    expect(CLUSTER_GAP_MODES).toEqual(['start-to-start', 'end-to-start']);
    expect(DEFAULT_GAP_MODE).toBe('start-to-start');
  });

  it('start-to-start est le comportement par défaut', () => {
    // Débuts espacés de 60 min, durée 20 min chacun.
    // start-to-start : écart 60 min > 45 → aucun cluster.
    const feeds = [
      feed(0, { durationSec: 20 * 60 }),
      feed(60, { durationSec: 20 * 60 }),
      feed(120, { durationSec: 20 * 60 }),
    ];
    expect(detectClusterFeedings(feeds)).toEqual([]);
    // Explicite start-to-start : identique au défaut.
    expect(detectClusterFeedings(feeds, { gapMode: 'start-to-start' })).toEqual([]);
  });

  it('les deux modes produisent un résultat différent sur le même jeu', () => {
    // Débuts à 0/60/120 min, durée 20 min : start-to-start = 60 min (rupture),
    // end-to-start = 40 min (regroupé).
    const feeds = [
      feed(0, { durationSec: 20 * 60 }),
      feed(60, { durationSec: 20 * 60 }),
      feed(120, { durationSec: 20 * 60 }),
    ];
    expect(detectClusterFeedings(feeds, { gapMode: 'start-to-start' })).toEqual([]);
    const ets = detectClusterFeedings(feeds, { gapMode: 'end-to-start' });
    expect(ets).toHaveLength(1);
    expect(ets[0].feedCount).toBe(3);
  });

  it('propriété : end-to-start regroupe au moins autant que start-to-start', () => {
    // Comme écart_end-to-start = écart_start-to-start − durée_précédent (≥ 0),
    // dès que start-to-start regroupe deux boires, end-to-start les regroupe
    // aussi. La divergence ne peut donc aller QUE dans un sens : end-to-start
    // détecte un cluster que start-to-start coupe (jamais l'inverse).
    const feeds = [
      feed(0, { durationSec: 20 * 60 }),
      feed(60, { durationSec: 20 * 60 }),
      feed(120, { durationSec: 20 * 60 }),
    ];
    const sts = detectClusterFeedings(feeds, { gapMode: 'start-to-start' });
    const ets = detectClusterFeedings(feeds, { gapMode: 'end-to-start' });
    expect(sts).toEqual([]); // start-to-start : 60 min > 45 → coupé
    expect(ets).toHaveLength(1); // end-to-start : 40 min ≤ 45 → regroupé
  });

  it('seuil exact respecté dans les deux modes', () => {
    // Durée 0 → fin = début, les deux modes coïncident sur des boires ponctuels.
    const at45 = [feed(0), feed(45), feed(90)];
    const at46 = [feed(0), feed(46), feed(92)];
    for (const mode of CLUSTER_GAP_MODES) {
      expect(detectClusterFeedings(at45, { gapMode: mode })).toHaveLength(1);
      expect(detectClusterFeedings(at46, { gapMode: mode })).toEqual([]);
    }
  });

  it('end-to-start : seuil exact fin → début', () => {
    // Durée 30 min ; débuts à 0/75/150 → fin 30, début 75 → écart 45 pile ≤ 45.
    const at45 = [
      feed(0, { durationSec: 30 * 60 }),
      feed(75, { durationSec: 30 * 60 }),
      feed(150, { durationSec: 30 * 60 }),
    ];
    expect(detectClusterFeedings(at45, { gapMode: 'end-to-start' })).toHaveLength(1);
    // Débuts à 0/76/152 → fin 30, début 76 → écart 46 > 45 → rupture.
    const at46 = [
      feed(0, { durationSec: 30 * 60 }),
      feed(76, { durationSec: 30 * 60 }),
      feed(152, { durationSec: 30 * 60 }),
    ];
    expect(detectClusterFeedings(at46, { gapMode: 'end-to-start' })).toEqual([]);
  });

  it('gapMode inconnu : repli silencieux sur le défaut', () => {
    const feeds = [feed(0), feed(30), feed(60)];
    expect(detectClusterFeedings(feeds, { gapMode: 'bogus' })).toHaveLength(1);
  });
});

// ── V1.1 : niveau de confiance ──────────────────────────────────────────────

describe('confidence & reason', () => {
  it('3 boires → low', () => {
    const out = detectClusterFeedings([feed(0), feed(30), feed(60)]);
    expect(out[0].confidence).toBe('low');
    expect(out[0].feedCount).toBe(3);
  });

  it('4 boires → medium', () => {
    const out = detectClusterFeedings([feed(0), feed(30), feed(60), feed(90)]);
    expect(out[0].confidence).toBe('medium');
    expect(out[0].feedCount).toBe(4);
  });

  it('5 boires → high', () => {
    const out = detectClusterFeedings([feed(0), feed(30), feed(60), feed(90), feed(120)]);
    expect(out[0].confidence).toBe('high');
    expect(out[0].feedCount).toBe(5);
  });

  it('6 boires ou plus → high', () => {
    const out = detectClusterFeedings([
      feed(0), feed(30), feed(60), feed(90), feed(120), feed(150),
    ]);
    expect(out[0].confidence).toBe('high');
    expect(out[0].feedCount).toBe(6);
  });

  it('helper clusterConfidence déterministe', () => {
    expect(clusterConfidence(1)).toBe('low');
    expect(clusterConfidence(2)).toBe('low');
    expect(clusterConfidence(3)).toBe('low');
    expect(clusterConfidence(4)).toBe('medium');
    expect(clusterConfidence(5)).toBe('high');
    expect(clusterConfidence(9)).toBe('high');
  });

  it('reason court et stable, sans texte clinique', () => {
    // Boires ponctuels à 0/39/78 min → 3 boires, span 78 min.
    const out = detectClusterFeedings([feed(0), feed(39), feed(78)]);
    expect(out[0].reason).toBe('3 boires en 78 min');
  });

  it('reason reflète feedCount et durée arrondie (4 boires)', () => {
    // Débuts à 0/32/64/96 min → 4 boires, span 96 min.
    const out = detectClusterFeedings([feed(0), feed(32), feed(64), feed(96)]);
    expect(out[0].reason).toBe('4 boires en 96 min');
  });

  it('reason identique pour un même cluster (stabilité)', () => {
    const feeds = [feed(0), feed(30), feed(60)];
    const a = detectClusterFeedings(feeds)[0].reason;
    const b = detectClusterFeedings(feeds)[0].reason;
    expect(a).toBe(b);
  });
});

// ── V1.1 : rétrocompatibilité ───────────────────────────────────────────────

describe('rétrocompatibilité de la forme de sortie', () => {
  it('tous les champs v1 sont conservés, aucun renommé', () => {
    const out = detectClusterFeedings([feed(0), feed(30), feed(60)]);
    expect(out).toHaveLength(1);
    const c = out[0];
    for (const field of [
      'startAt',
      'endAt',
      'duration',
      'feedCount',
      'breastMinutes',
      'bottleMl',
      'feedTypes',
      'sidesUsed',
      'events',
      'isClusterFeeding',
    ]) {
      expect(c).toHaveProperty(field);
    }
    // Champs V1.1 ajoutés (superset, pas de rupture).
    expect(c).toHaveProperty('confidence');
    expect(c).toHaveProperty('reason');
  });

  it('les options existantes fonctionnent toujours (défaut start-to-start)', () => {
    const feeds = [feed(0), feed(30), feed(60)];
    // gapMinutes
    expect(detectClusterFeedings(feeds, { gapMinutes: 20 })).toEqual([]);
    // minFeeds
    expect(detectClusterFeedings([feed(0), feed(30)], { minFeeds: 2 })).toHaveLength(1);
    // rules
    const heavy = (c) => c.bottleMl >= 100;
    expect(detectClusterFeedings(feeds, { rules: [heavy] })).toEqual([]);
    // includeInProgress
    const withInProgress = [feed(0), feed(30), feed(60, { inProgress: true })];
    expect(detectClusterFeedings(withInProgress)).toEqual([]);
    expect(detectClusterFeedings(withInProgress, { includeInProgress: true })).toHaveLength(1);
    // includeSubThreshold
    const sub = detectClusterFeedings([feed(0), feed(30)], { includeSubThreshold: true });
    expect(sub).toHaveLength(1);
    expect(sub[0].isClusterFeeding).toBe(false);
  });

  it('ne mute jamais les événements sources (V1.1)', () => {
    const feeds = [feed(0, { durationSec: 600 }), feed(30), feed(60)];
    const snapshot = JSON.parse(JSON.stringify(feeds));
    detectClusterFeedings(feeds, { gapMode: 'end-to-start' });
    detectClusterFeedings(feeds, { gapMode: 'start-to-start' });
    expect(feeds).toEqual(snapshot);
  });
});
