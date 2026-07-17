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
  it('répartit la durée, les deux = 50/50, ignore durées manquantes', () => {
    const evs = [
      feed(-1 * H, { feedType: 'left', lastSide: 'left', durationSec: 600 }),
      feed(-2 * H, { feedType: 'right', lastSide: 'right', durationSec: 300 }),
      feed(-3 * H, { feedType: 'both', lastSide: 'both', durationSec: 200 }),
      feed(-4 * H, { feedType: 'left', lastSide: 'left', durationSec: undefined }),
    ];
    const ss = sideSplit(evs, NOW - 7 * D, NOW);
    expect(ss.leftSec).toBe(700);
    expect(ss.rightSec).toBe(400);
    expect(ss.leftPct).toBeCloseTo(700 / 1100);
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
