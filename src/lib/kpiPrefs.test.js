import { describe, it, expect, beforeEach } from 'vitest';
import {
  PERIODS,
  DEFAULT_PERIOD_ID,
  DEFAULT_KPI_PREFS,
  KPI_PREFS_KEY,
  periodById,
  normalizeKpiPrefs,
  loadKpiPrefs,
  saveKpiPrefs,
  resetKpiPrefs,
} from './kpiPrefs.js';

// localStorage minimal — le projet n'embarque pas d'environnement DOM.
function fakeStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    _map: map,
  };
}

beforeEach(() => {
  globalThis.localStorage = fakeStorage();
});

describe('Sprint 3 — périodes', () => {
  it('les cinq périodes attendues, « Tout » sans borne de jours', () => {
    expect(PERIODS.map((p) => p.id)).toEqual(['24h', '3d', '7d', '30d', 'all']);
    expect(PERIODS.find((p) => p.id === 'all').days).toBeNull();
    expect(PERIODS.find((p) => p.id === '7d').days).toBe(7);
  });

  it('periodById retombe sur le défaut si l’identifiant est inconnu', () => {
    expect(periodById('30d').days).toBe(30);
    expect(periodById('inexistant').id).toBe(DEFAULT_PERIOD_ID);
    expect(periodById(undefined).id).toBe(DEFAULT_PERIOD_ID);
  });

  it('le défaut est 24 h : le comportement historique est conservé', () => {
    expect(DEFAULT_KPI_PREFS.period).toBe('24h');
    expect(periodById(DEFAULT_PERIOD_ID).days).toBe(1);
  });
});

describe('Sprint 3 — persistance locale', () => {
  it('aucune préférence enregistrée : défauts', () => {
    expect(loadKpiPrefs()).toEqual({ ...DEFAULT_KPI_PREFS });
  });

  it('un changement de période survit à une relecture', () => {
    saveKpiPrefs({ ...DEFAULT_KPI_PREFS, period: '7d' });
    expect(loadKpiPrefs().period).toBe('7d');
  });

  it('JSON corrompu : défauts, aucune exception', () => {
    globalThis.localStorage.setItem(KPI_PREFS_KEY, '{ceci n’est pas du JSON');
    expect(() => loadKpiPrefs()).not.toThrow();
    expect(loadKpiPrefs().period).toBe(DEFAULT_PERIOD_ID);
  });

  it('période inconnue en stockage : ramenée au défaut', () => {
    globalThis.localStorage.setItem(KPI_PREFS_KEY, JSON.stringify({ period: '99j' }));
    expect(loadKpiPrefs().period).toBe(DEFAULT_PERIOD_ID);
  });

  it('normalisation : listes réservées toujours présentes et assainies', () => {
    const p = normalizeKpiPrefs({ period: '3d', hiddenCards: ['a', 2, null, 'b'], order: 'pas-un-tableau' });
    expect(p.period).toBe('3d');
    expect(p.hiddenCards).toEqual(['a', 'b']);
    expect(p.order).toEqual([]);
    expect(p.favorites).toEqual([]);
    expect(p.v).toBe(1);
  });

  it('réinitialisation : retour aux défauts et clé retirée', () => {
    saveKpiPrefs({ ...DEFAULT_KPI_PREFS, period: '30d' });
    expect(resetKpiPrefs()).toEqual({ ...DEFAULT_KPI_PREFS });
    expect(globalThis.localStorage.getItem(KPI_PREFS_KEY)).toBeNull();
  });

  it('absence totale de localStorage : aucune exception', () => {
    delete globalThis.localStorage;
    expect(() => loadKpiPrefs()).not.toThrow();
    expect(() => saveKpiPrefs(DEFAULT_KPI_PREFS)).not.toThrow();
    expect(loadKpiPrefs().period).toBe(DEFAULT_PERIOD_ID);
  });
});
