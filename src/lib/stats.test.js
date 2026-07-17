import { describe, it, expect } from 'vitest';
import { computeStats, windowStats, weeklyTrend } from './stats.js';

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
