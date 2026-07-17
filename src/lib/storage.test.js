import { describe, it, expect, beforeEach } from 'vitest';
import {
  saveEvents,
  loadEvents,
  saveBaby,
  loadBaby,
  saveOutbox,
  saveTheme,
  StorageWriteError,
} from './storage.js';
import { persistThenCommit } from './dataops.js';

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

describe('Point 1 — cohérence état/localStorage après échec (rollback du store)', () => {
  it('événements : échec de persistance -> localStorage conserve la valeur précédente', () => {
    const prev = [{ id: 'a', type: 'feed' }];
    saveEvents(prev);
    globalThis.localStorage.setItem = () => {
      throw quotaError();
    };
    // Le store fait exactement ceci : persister d'abord, ne committer que si OK.
    const r = persistThenCommit([...prev, { id: 'b', type: 'feed' }], saveEvents);
    expect(r.committed).toBe(false); // -> le store ne fait PAS setAllEvents (rollback)
    expect(loadEvents()).toEqual(prev); // localStorage cohérent : ancienne valeur
  });

  it('profil bébé : échec de persistance -> localStorage conserve le profil précédent', () => {
    const prev = { name: 'Léa', updatedAt: '2026-07-15T00:00:00Z' };
    saveBaby(prev);
    globalThis.localStorage.setItem = () => {
      throw quotaError();
    };
    const r = persistThenCommit({ name: 'Léa', photo: 'ENORME', updatedAt: 'x' }, saveBaby);
    expect(r.committed).toBe(false); // -> pas de setBabyState (rollback)
    expect(loadBaby()).toEqual(prev);
  });
});
