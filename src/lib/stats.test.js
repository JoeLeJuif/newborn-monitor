import { describe, it, expect } from 'vitest';
import {
  computeStats,
  windowStats,
  weeklyTrend,
  lastEvents,
  feedIntervalSeries,
  dayNightSplit,
  sideSplit,
  hourlyActivity,
  computeInsights,
  computeDashboard,
  isKpiEvent,
  kpiEvents,
  MIN_DIAPERS_FOR_COMPARISON,
} from './stats.js';

// Heure locale fixe pour des tests déterministes quel que soit le fuseau.
const NOW = new Date('2026-07-15T12:00:00').getTime();
const H = 3600000;
const D = 86400000;

let seq = 0;
function feed(offsetMs, extra = {}) {
  const iso = new Date(NOW + offsetMs).toISOString();
  return {
    id: `f${seq++}`,
    type: 'feed',
    start: iso,
    updatedAt: iso,
    deleted: false,
    feedType: 'left',
    durationSec: 600,
    amountMl: null,
    ...extra,
  };
}
function diaper(offsetMs, extra = {}) {
  const iso = new Date(NOW + offsetMs).toISOString();
  return {
    id: `d${seq++}`,
    type: 'diaper',
    time: iso,
    updatedAt: iso,
    deleted: false,
    pee: true,
    poop: false,
    ...extra,
  };
}
const shuffle = (a) => [...a].sort(() => Math.random() - 0.5);

describe('computeStats — cas limites', () => {
  it('aucune donnée : pas de crash, moyennes nulles, aucune division par zéro', () => {
    const s = computeStats([], NOW);
    expect(s.last24.feedCount).toBe(0);
    expect(s.last24.avgDurationSec).toBeNull();
    expect(s.last24.avgMl).toBeNull();
    expect(s.last24.avgIntervalMs).toBeNull();
    expect(s.last24.lastFeedTs).toBeNull();
    expect(s.week.peesPerDay).toBe(0); // 0/7, fini, pas NaN
    expect(Number.isNaN(s.week.poopsPerDay)).toBe(false);
    expect(s.trend).toHaveLength(7);
  });

  it('un seul événement : compté, mais pas d’intervalle', () => {
    const s = computeStats([feed(-2 * H, { durationSec: 900 })], NOW);
    expect(s.last24.feedCount).toBe(1);
    expect(s.last24.avgDurationSec).toBe(900);
    expect(s.last24.avgIntervalMs).toBeNull();
    expect(s.last24.lastFeedTs).toBe(NOW - 2 * H);
  });
});

describe('fenêtre 24 h', () => {
  it('exclut ce qui est hors des dernières 24 h', () => {
    const s = computeStats(
      [feed(-1 * H), feed(-2 * H), feed(-30 * H)],
      NOW,
    );
    expect(s.last24.feedCount).toBe(2);
  });

  it('intervalle moyen indépendant de l’ordre', () => {
    const evs = [feed(-1 * H), feed(-3 * H), feed(-6 * H)];
    const a = windowStats(evs, NOW - D, NOW, 1).avgIntervalMs;
    const b = windowStats(shuffle(evs), NOW - D, NOW, 1).avgIntervalMs;
    expect(a).toBe(b);
    expect(a).toBe(2.5 * H); // gaps 3h et 2h -> 2.5h
  });
});

describe('7 jours et tendance', () => {
  it('moyenne quotidienne = total / 7 (jamais /0)', () => {
    const evs = [diaper(-1 * H), diaper(-2 * D), diaper(-5 * D, { poop: true })];
    const s = computeStats(evs, NOW);
    expect(s.week.pees).toBe(3);
    expect(s.week.peesPerDay).toBeCloseTo(3 / 7);
  });

  it('tendance : 7 jours dans l’ordre chronologique', () => {
    const t = weeklyTrend([feed(-1 * H), feed(-3 * D)], NOW);
    expect(t).toHaveLength(7);
    expect(t[6].feeds).toBe(1); // aujourd’hui
    expect(t[3].feeds).toBe(1); // il y a 3 jours
  });
});

describe('robustesse données', () => {
  it('ignore les événements supprimés (tombstones)', () => {
    const s = computeStats(
      [feed(-1 * H), feed(-2 * H, { deleted: true })],
      NOW,
    );
    expect(s.last24.feedCount).toBe(1);
  });

  it('quantité absente ≠ zéro dans la moyenne', () => {
    const s = computeStats(
      [feed(-1 * H, { amountMl: 60 }), feed(-2 * H, { amountMl: null }), feed(-3 * H)],
      NOW,
    );
    expect(s.last24.totalMl).toBe(60);
    expect(s.last24.mlCount).toBe(1);
    expect(s.last24.avgMl).toBe(60); // pas 60/3
  });

  it('durée absente ≠ zéro dans la moyenne', () => {
    const s = computeStats(
      [feed(-1 * H, { durationSec: 600 }), feed(-2 * H, { durationSec: undefined })],
      NOW,
    );
    expect(s.last24.avgDurationSec).toBe(600); // une seule durée valide
  });

  it('anciennes structures : champs manquants + pas de champ deleted', () => {
    const legacy = {
      id: 'legacy1',
      type: 'feed',
      start: new Date(NOW - 1 * H).toISOString(),
      feedType: 'right',
      // ni durationSec, ni amountMl, ni updatedAt, ni deleted
    };
    const unknownType = {
      id: 'legacy2',
      type: 'feed',
      start: new Date(NOW - 2 * H).toISOString(),
      feedType: 'ancienne_valeur_inconnue',
    };
    const s = computeStats([legacy, unknownType], NOW);
    expect(s.last24.feedCount).toBe(2);
    expect(s.last24.avgDurationSec).toBeNull();
    expect(s.last24.breakdown.right).toBe(1);
    expect(s.last24.breakdown.other).toBe(1); // type inconnu -> "autre"
  });

  it('événements hors ordre : résultats stables', () => {
    const evs = [feed(-1 * H), feed(-5 * H), feed(-3 * H), diaper(-2 * H)];
    const a = computeStats(evs, NOW);
    const b = computeStats(shuffle(evs), NOW);
    expect(a).toEqual(b);
  });
});

describe('passage autour de minuit', () => {
  it('range les événements dans le bon jour local', () => {
    const midnight = new Date(NOW);
    midnight.setHours(0, 0, 0, 0);
    const beforeMidnight = feed(midnight.getTime() - NOW - 60000); // hier 23:59
    const afterMidnight = feed(midnight.getTime() - NOW + 60000); // aujourd’hui 00:01
    const t = weeklyTrend([beforeMidnight, afterMidnight], NOW);
    expect(t[6].feeds).toBe(1); // aujourd’hui
    expect(t[5].feeds).toBe(1); // hier
  });
});

describe('identique avant / après synchronisation', () => {
  it('l’ajout de tombstones et le réordonnancement ne changent pas les stats actives', () => {
    const before = [feed(-1 * H, { amountMl: 90 }), diaper(-2 * H), feed(-4 * H)];
    const afterSync = shuffle([
      ...before,
      feed(-3 * H, { deleted: true }), // tombstone reçu d’un autre appareil
    ]);
    expect(computeStats(afterSync, NOW)).toEqual(computeStats(before, NOW));
  });
});

describe('Dashboard v2 — dernier événement', () => {
  it('dernier ts par type, en ignorant les supprimés', () => {
    const evs = [
      feed(-1 * H),
      feed(-3 * H, { deleted: true }),
      diaper(-2 * H, { pee: true, poop: false }),
      diaper(-5 * H, { pee: false, poop: true }),
    ];
    const l = lastEvents(evs);
    expect(l.lastFeedTs).toBe(NOW - 1 * H);
    expect(l.lastPeeTs).toBe(NOW - 2 * H);
    expect(l.lastPoopTs).toBe(NOW - 5 * H);
  });
  it('null quand aucun événement du type', () => {
    expect(lastEvents([]).lastFeedTs).toBeNull();
  });
});

describe('Dashboard v2 — intervalles (moyen + plus long)', () => {
  it('avgIntervalMs et longestIntervalMs', () => {
    const s = windowStats([feed(-1 * H), feed(-3 * H), feed(-6 * H)], NOW - D, NOW, 1);
    expect(s.avgIntervalMs).toBe(2.5 * H);
    expect(s.longestIntervalMs).toBe(3 * H);
  });
  it('feedIntervalSeries : derniers écarts, ordre chronologique', () => {
    const series = feedIntervalSeries([feed(-1 * H), feed(-3 * H), feed(-6 * H)], 12);
    expect(series.map((p) => p.gapMs)).toEqual([3 * H, 2 * H]);
  });
  it('série vide si moins de 2 boires', () => {
    expect(feedIntervalSeries([feed(-1 * H)])).toEqual([]);
  });
});

describe('Dashboard v2 — agrégation 7 jours (temps au sein)', () => {
  it('weeklyTrend accumule feeds/breastSec/pees/poops par jour', () => {
    const t = weeklyTrend(
      [
        feed(-1 * H, { feedType: 'left', durationSec: 600 }),
        feed(-2 * H, { feedType: 'formula', durationSec: 300 }),
        diaper(-1 * H, { pee: true, poop: true }),
      ],
      NOW,
    );
    expect(t[6].feeds).toBe(2);
    expect(t[6].breastSec).toBe(600);
    expect(t[6].pees).toBe(1);
    expect(t[6].poops).toBe(1);
  });
});

describe('Dashboard v2 — jour / nuit', () => {
  it('6h–18h = jour, sinon nuit (heure locale)', () => {
    const evs = [feed(-4 * H), feed(-1 * H), feed(-10 * H), feed(-16 * H)];
    const dn = dayNightSplit(evs, NOW - 7 * D, NOW);
    expect(dn.day).toBe(2);
    expect(dn.night).toBe(2);
    expect(dn.dayPct).toBeCloseTo(0.5);
  });
  it('pourcentages null si aucun boire', () => {
    expect(dayNightSplit([], NOW - 7 * D, NOW).dayPct).toBeNull();
  });
});

describe('Dashboard v2 — gauche / droite', () => {
  // NOTE : l'ancienne version de ce test utilisait `lastSide: 'both'`, une
  // valeur que la production ne peut PAS produire (isValidSession contraint
  // currentSide à 'left' | 'right' | null). Elle est remplacée par les cas
  // réellement observables.
  it('repli : unilatéral au bon côté, « both » 50/50, durées manquantes ignorées', () => {
    const evs = [
      feed(-1 * H, { feedType: 'left', lastSide: 'left', durationSec: 600 }),
      feed(-2 * H, { feedType: 'right', lastSide: 'right', durationSec: 300 }),
      feed(-3 * H, { feedType: 'both', lastSide: 'right', durationSec: 200 }),
      feed(-4 * H, { feedType: 'left', lastSide: 'left', durationSec: undefined }),
    ];
    const ss = sideSplit(evs, NOW - 7 * D, NOW);
    expect(ss.leftSec).toBe(700); // 600 + 100 (moitié des 200)
    expect(ss.rightSec).toBe(400); // 300 + 100
    expect(ss.leftPct).toBeCloseTo(700 / 1100);
    expect(ss.estimated).toBe(true); // aucune durée exacte : tout est déduit
    expect(ss.exactTotal).toBe(0);
  });
});

describe('Dashboard v2 — activité par heure', () => {
  it('compte par heure locale, ignore les supprimés', () => {
    const h = hourlyActivity([feed(-4 * H), feed(-1 * H), feed(-1 * H, { deleted: true })], NOW - 7 * D, NOW);
    expect(h).toHaveLength(24);
    expect(h[8]).toBe(1);
    expect(h[11]).toBe(1);
  });
});

describe('Dashboard v2 — observations', () => {
  it('aucune observation si données insuffisantes', () => {
    expect(computeInsights([], NOW)).toEqual([]);
    expect(computeInsights([feed(-1 * H)], NOW)).toEqual([]);
  });
  it('produit une observation (côté dominant) avec assez de données', () => {
    const evs = [];
    for (let i = 0; i < 6; i += 1) {
      evs.push(feed(-i * 6 * H - H, { feedType: 'left', lastSide: 'left', durationSec: 600 }));
    }
    const ins = computeInsights(evs, NOW);
    expect(ins.length).toBeGreaterThanOrEqual(1);
    expect(ins.length).toBeLessThanOrEqual(3);
    expect(ins.some((t) => /gauche/i.test(t))).toBe(true);
  });
});

describe('Dashboard v2 — agrégateur & compat anciennes données', () => {
  it('computeDashboard renvoie toutes les sections', () => {
    const d = computeDashboard([feed(-1 * H), diaper(-2 * H, { pee: true })], NOW);
    expect(d.trend).toHaveLength(7);
    expect(d.hourly).toHaveLength(24);
    expect(Array.isArray(d.intervals)).toBe(true);
    expect(Array.isArray(d.insights)).toBe(true);
  });
  it('anciennes structures compatibles (champs manquants, sans deleted)', () => {
    const legacyFeed = { id: 'l1', type: 'feed', start: new Date(NOW - 2 * H).toISOString(), feedType: 'left' };
    const legacyDiaper = { id: 'l2', type: 'diaper', time: new Date(NOW - 3 * H).toISOString(), pee: true };
    expect(() => computeDashboard([legacyFeed, legacyDiaper], NOW)).not.toThrow();
    const d = computeDashboard([legacyFeed, legacyDiaper], NOW);
    expect(d.last.lastFeedTs).toBe(NOW - 2 * H);
    expect(d.kpi.feedCount).toBe(1);
  });
});

describe('Dashboard v2 — bornes jour/nuit exactes', () => {
  it('06:00 compte en jour, 18:00 compte en nuit', () => {
    const at6 = feed(-6 * H); // 06:00 aujourd’hui (NOW = 12:00 local)
    const at18 = feed(-18 * H); // 18:00 la veille
    const dn = dayNightSplit([at6, at18], NOW - 7 * D, NOW);
    expect(dn.day).toBe(1); // 06:00 inclus -> jour
    expect(dn.night).toBe(1); // 18:00 exclu -> nuit
  });
});

// ── Sprint 1 : fiabilité ────────────────────────────────────────────────────

describe('Sprint 1 — boires en cours exclus des KPI', () => {
  it('isKpiEvent rejette un boire en cours, garde les anciens événements', () => {
    expect(isKpiEvent(feed(-1 * H, { inProgress: true }))).toBe(false);
    expect(isKpiEvent(feed(-1 * H, { inProgress: false }))).toBe(true);
    // Ancien événement sans le champ : conservé (test strict === true).
    expect(isKpiEvent(feed(-1 * H))).toBe(true);
  });

  it('exclu du compte, des durées et des quantités', () => {
    const evs = [
      feed(-1 * H, { durationSec: 600 }),
      feed(-2 * H, { inProgress: true, durationSec: 900, amountMl: 100 }),
    ];
    const s = windowStats(evs, NOW - D, NOW, 1);
    expect(s.feedCount).toBe(1);
    expect(s.breastSec).toBe(600);
    expect(s.totalMl).toBe(0);
  });

  it('exclu des intervalles, de la tendance, du jour/nuit, de la heatmap', () => {
    const evs = [
      feed(-1 * H),
      feed(-3 * H, { inProgress: true }),
      feed(-5 * H),
    ];
    // Sans le boire en cours : un seul écart de 4 h.
    const s = windowStats(evs, NOW - D, NOW, 1);
    expect(s.avgIntervalMs).toBe(4 * H);
    expect(feedIntervalSeries(evs).map((p) => p.gapMs)).toEqual([4 * H]);
    expect(weeklyTrend(evs, NOW)[6].feeds).toBe(2);
    expect(dayNightSplit(evs, NOW - 7 * D, NOW).total).toBe(2);
    expect(hourlyActivity(evs, NOW - 7 * D, NOW).reduce((a, b) => a + b, 0)).toBe(2);
  });

  it('exclu de « dernier boire » et de la répartition gauche/droite', () => {
    const evs = [
      feed(-1 * H, { inProgress: true, durationSec: 600, feedType: 'left' }),
      feed(-4 * H, { durationSec: 300, feedType: 'left' }),
    ];
    expect(lastEvents(evs).lastFeedTs).toBe(NOW - 4 * H);
    expect(sideSplit(evs, NOW - 7 * D, NOW).leftSec).toBe(300);
  });

  it('kpiEvents est vide si le seul événement est un boire en cours', () => {
    // Logique derrière l'état vide du tableau de bord : un boire encore en
    // cours ne doit pas faire croire qu'il y a des données à afficher.
    expect(kpiEvents([feed(-1 * H, { inProgress: true })])).toHaveLength(0);
    // Dès qu'un boire terminé existe, le tableau de bord a de quoi s'afficher.
    expect(kpiEvents([feed(-1 * H, { inProgress: true }), feed(-2 * H)])).toHaveLength(1);
    // Entrée non tableau : jamais d'exception.
    expect(kpiEvents(null)).toEqual([]);
  });

  it('l’événement en cours n’est pas retiré du tableau source', () => {
    const evs = [feed(-1 * H, { inProgress: true })];
    const copy = [...evs];
    computeDashboard(evs, NOW);
    expect(evs).toEqual(copy); // aucune mutation
    expect(evs).toHaveLength(1);
  });
});

describe('Sprint 1 — biais de bord des intervalles', () => {
  it('le dernier boire AVANT la fenêtre ancre le premier intervalle', () => {
    // Un seul boire dans la fenêtre : sans ancre, aucun intervalle.
    const evs = [feed(-2 * H), feed(-26 * H)];
    const s = windowStats(evs, NOW - D, NOW, 1);
    expect(s.longestIntervalMs).toBe(24 * H);
    expect(s.avgIntervalMs).toBe(24 * H);
  });

  it('plus long intervalle correct au bord : le jeûne nocturne survit', () => {
    // Boire à -25 h puis à -8 h : l'écart de 17 h franchit la borne des 24 h.
    const evs = [feed(-8 * H), feed(-25 * H), feed(-2 * H)];
    const s = windowStats(evs, NOW - D, NOW, 1);
    expect(s.longestIntervalMs).toBe(17 * H); // et non 6 h
  });

  it('aucune ancre disponible : comportement inchangé', () => {
    const evs = [feed(-1 * H), feed(-3 * H), feed(-6 * H)];
    const s = windowStats(evs, NOW - D, NOW, 1);
    expect(s.avgIntervalMs).toBe(2.5 * H);
    expect(s.longestIntervalMs).toBe(3 * H);
  });

  it('un boire en cours ne peut pas servir d’ancre', () => {
    const evs = [feed(-2 * H), feed(-26 * H, { inProgress: true })];
    expect(windowStats(evs, NOW - D, NOW, 1).longestIntervalMs).toBeNull();
  });

  it('un tombstone ne peut pas servir d’ancre', () => {
    const evs = [feed(-2 * H), feed(-26 * H, { deleted: true })];
    expect(windowStats(evs, NOW - D, NOW, 1).longestIntervalMs).toBeNull();
  });
});

describe('Sprint 1 — gauche / droite avec durées exactes', () => {
  it('session chronométrée « both », lastSide droit : durées exactes utilisées', () => {
    // Cas réel qui produisait le bug : 100 % du temps allait à `lastSide`.
    const evs = [
      feed(-1 * H, {
        feedType: 'both',
        lastSide: 'right',
        durationSec: 900,
        leftDurationSec: 600,
        rightDurationSec: 300,
      }),
    ];
    const ss = sideSplit(evs, NOW - 7 * D, NOW);
    expect(ss.leftSec).toBe(600); // et non 0
    expect(ss.rightSec).toBe(300); // et non 900
    expect(ss.estimated).toBe(false);
    expect(ss.exactTotal).toBe(900);
  });

  it('session chronométrée « both », lastSide gauche : symétrique', () => {
    const evs = [
      feed(-1 * H, {
        feedType: 'both',
        lastSide: 'left',
        durationSec: 500,
        leftDurationSec: 200,
        rightDurationSec: 300,
      }),
    ];
    const ss = sideSplit(evs, NOW - 7 * D, NOW);
    expect(ss.leftSec).toBe(200);
    expect(ss.rightSec).toBe(300);
  });

  it('ancien événement « both » sans durées exactes : repli 50/50', () => {
    const evs = [feed(-1 * H, { feedType: 'both', lastSide: 'right', durationSec: 400 })];
    const ss = sideSplit(evs, NOW - 7 * D, NOW);
    expect(ss.leftSec).toBe(200);
    expect(ss.rightSec).toBe(200);
    expect(ss.estimated).toBe(true);
  });

  it('événement unilatéral : toute la durée au bon côté', () => {
    const gauche = sideSplit([feed(-1 * H, { feedType: 'left', durationSec: 400 })], NOW - 7 * D, NOW);
    expect(gauche.leftSec).toBe(400);
    expect(gauche.rightSec).toBe(0);
    const droite = sideSplit([feed(-1 * H, { feedType: 'right', durationSec: 400 })], NOW - 7 * D, NOW);
    expect(droite.rightSec).toBe(400);
    expect(droite.leftSec).toBe(0);
  });

  it('mélange exact + ancien : les deux sources cohabitent, estimated = true', () => {
    const evs = [
      feed(-1 * H, {
        feedType: 'both',
        lastSide: 'right',
        durationSec: 900,
        leftDurationSec: 600,
        rightDurationSec: 300,
      }),
      feed(-2 * H, { feedType: 'both', durationSec: 400 }), // ancien -> 50/50
    ];
    const ss = sideSplit(evs, NOW - 7 * D, NOW);
    expect(ss.leftSec).toBe(800); // 600 + 200
    expect(ss.rightSec).toBe(500); // 300 + 200
    expect(ss.exactLeftSec).toBe(600); // sous-ensemble mesuré seulement
    expect(ss.estimated).toBe(true);
  });

  it('observation de côté dominant : mesurée vs estimée', () => {
    const exact = [];
    for (let i = 0; i < 6; i += 1) {
      exact.push(
        feed(-i * 6 * H - H, {
          feedType: 'both',
          lastSide: 'right',
          durationSec: 1000,
          leftDurationSec: 900,
          rightDurationSec: 100,
        }),
      );
    }
    // Mesuré : formulation affirmative, sans réserve.
    const insExact = computeInsights(exact, NOW);
    expect(insExact.some((t) => /gauche nettement dominant/i.test(t))).toBe(true);
    expect(insExact.some((t) => /estimé/i.test(t))).toBe(false);
    expect(insExact.some((t) => /semble/i.test(t))).toBe(false);

    const estime = [];
    for (let i = 0; i < 6; i += 1) {
      estime.push(feed(-i * 6 * H - H, { feedType: 'left', durationSec: 600 }));
    }
    // Estimé : formulation prudente et réserve explicite.
    const insEstime = computeInsights(estime, NOW);
    expect(insEstime.some((t) => /côté gauche semble dominant/i.test(t))).toBe(true);
    expect(insEstime.some((t) => /estimé/i.test(t))).toBe(true);
    expect(insEstime.some((t) => /nettement dominant/i.test(t))).toBe(false);
  });
});

describe('Sprint 1 — observations sur les couches', () => {
  // Construit n couches réparties sur une période de 7 jours donnée.
  function couches(n, offsetDays) {
    const out = [];
    for (let i = 0; i < n; i += 1) {
      out.push(diaper(-(offsetDays + i * 0.5) * D, { pee: true, poop: false }));
    }
    return out;
  }

  it('aucune couche enregistrée : aucun message de comparaison', () => {
    const evs = [];
    for (let i = 0; i < 6; i += 1) evs.push(feed(-i * 6 * H - H));
    const ins = computeInsights(evs, NOW);
    expect(ins.some((t) => /couches/i.test(t))).toBe(false);
    expect(ins.some((t) => /stable/i.test(t))).toBe(false);
  });

  it('une seule période suffisamment renseignée : message neutre, pas de « comparable »', () => {
    // 6 couches cette semaine, aucune la semaine précédente.
    const evs = couches(6, 0.5);
    const ins = computeInsights(evs, NOW);
    expect(ins).toContain('Données insuffisantes pour comparer les couches.');
    expect(ins.some((t) => /comparable/i.test(t))).toBe(false);
  });

  it('données suffisantes des deux côtés et proches : observation neutre correcte', () => {
    const evs = [...couches(6, 0.5), ...couches(6, 7.5)];
    const ins = computeInsights(evs, NOW);
    expect(ins).toContain('Nombre de couches comparable à la semaine précédente.');
  });

  it('sous le seuil des deux côtés : jamais de « comparable »', () => {
    const evs = [...couches(2, 0.5), ...couches(2, 7.5)];
    const ins = computeInsights(evs, NOW);
    expect(ins.some((t) => /comparable/i.test(t))).toBe(false);
    expect(ins).toContain('Données insuffisantes pour comparer les couches.');
  });

  it('MIN_DIAPERS_FOR_COMPARISON est documenté et strictement positif', () => {
    expect(MIN_DIAPERS_FOR_COMPARISON).toBeGreaterThan(0);
  });
});

describe('Sprint 1 — compatibilité des nouveaux champs', () => {
  it('un ancien événement sans les nouveaux champs reste exploitable', () => {
    const legacy = {
      id: 'old1',
      type: 'feed',
      start: new Date(NOW - 2 * H).toISOString(),
      feedType: 'both',
      durationSec: 600,
      // ni leftDurationSec, ni rightDurationSec, ni inProgress, ni deleted
    };
    expect(() => computeDashboard([legacy], NOW)).not.toThrow();
    const ss = sideSplit([legacy], NOW - 7 * D, NOW);
    expect(ss.leftSec).toBe(300);
    expect(ss.rightSec).toBe(300);
    expect(ss.estimated).toBe(true);
  });

  it('durées par côté nulles ou incohérentes : repli, jamais de NaN', () => {
    const evs = [
      feed(-1 * H, { feedType: 'both', durationSec: 400, leftDurationSec: 0, rightDurationSec: 0 }),
      feed(-2 * H, {
        feedType: 'both',
        durationSec: 400,
        leftDurationSec: 'x',
        rightDurationSec: null,
      }),
    ];
    const ss = sideSplit(evs, NOW - 7 * D, NOW);
    expect(Number.isFinite(ss.leftSec)).toBe(true);
    expect(Number.isFinite(ss.rightSec)).toBe(true);
    expect(ss.leftSec).toBe(400); // les deux retombent sur le 50/50
    expect(ss.rightSec).toBe(400);
  });

  it('computeDashboard expose hourlyTotal cohérent avec hourly', () => {
    const d = computeDashboard([feed(-1 * H), feed(-4 * H)], NOW);
    expect(d.hourlyTotal).toBe(d.hourly.reduce((a, b) => a + b, 0));
    expect(d.hourlyTotal).toBe(2);
  });
});
