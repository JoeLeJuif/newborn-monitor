import { describe, it, expect, beforeEach } from 'vitest';
import {
  saveEvents,
  loadEvents,
  saveOutbox,
  saveTheme,
  StorageWriteError,
} from './storage.js';

function makeLS() {
  const map = new Map();
  const ls = {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, v),
    removeItem: (k) => map.delete(k),
  };
  return ls;
}

function quotaError() {
  const e = new Error('quota');
  e.name = 'QuotaExceededError';
  return e;
}

beforeEach(() => {
  globalThis.localStorage = makeLS();
});

describe('P1-3 — quota localStorage', () => {
  it('saveEvents lève StorageWriteError (quota) et ne prétend pas avoir sauvegardé', () => {
    // Écriture initiale réussie.
    saveEvents([{ id: 'a', type: 'feed' }]);
    expect(loadEvents()).toHaveLength(1);

    // Simule un quota dépassé sur les écritures suivantes.
    globalThis.localStorage.setItem = () => {
      throw quotaError();
    };

    let caught;
    try {
      saveEvents([{ id: 'a', type: 'feed' }, { id: 'b', type: 'feed' }]);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(StorageWriteError);
    expect(caught.quota).toBe(true);
    // L’ancienne valeur est conservée (échec = non persisté, pas de corruption).
    expect(loadEvents()).toHaveLength(1);
  });

  it('les écritures non critiques (outbox, thème) ne lèvent pas sur quota', () => {
    globalThis.localStorage.setItem = () => {
      throw quotaError();
    };
    expect(() => saveOutbox(['x'])).not.toThrow();
    expect(() => saveTheme('dark')).not.toThrow();
  });
});
