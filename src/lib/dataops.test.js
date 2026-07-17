import { describe, it, expect } from 'vitest';
import {
  outboxAfterDrain,
  validateBackup,
  prepareRestore,
  computeResizeDimensions,
  persistThenCommit,
} from './dataops.js';

function quotaError() {
  const e = new Error('quota');
  e.name = 'QuotaExceededError';
  return e;
}

const feed = (over = {}) => ({
  id: 'e1',
  type: 'feed',
  start: '2026-07-15T10:00:00.000Z',
  ...over,
});
const backup = (events) => ({ app: 'newborn-monitor', version: 1, events });

describe('P1-1 — drainage sélectif de l’outbox', () => {
  it('retire uniquement les ids réellement poussés', () => {
    expect(outboxAfterDrain(['a', 'b', 'c'], ['a', 'c'])).toEqual(['b']);
  });
  it('préserve un id ajouté pendant la synchronisation (concurrence)', () => {
    // Snapshot poussé = ['a'] ; 'b' ajouté à l’outbox pendant le push.
    const outboxAfterConcurrentAdd = ['a', 'b'];
    expect(outboxAfterDrain(outboxAfterConcurrentAdd, ['a'])).toEqual(['b']);
  });
  it('vide complètement si tout a été poussé', () => {
    expect(outboxAfterDrain(['a'], ['a'])).toEqual([]);
  });
  it('gère les entrées vides', () => {
    expect(outboxAfterDrain(undefined, ['a'])).toEqual([]);
    expect(outboxAfterDrain(['a'], undefined)).toEqual(['a']);
  });
});

describe('P1-4 — validation d’import JSON', () => {
  it('accepte un fichier valide', () => {
    const r = validateBackup(backup([feed(), { id: 'd1', type: 'diaper', time: '2026-07-15T11:00:00Z' }]));
    expect(r.ok).toBe(true);
    expect(r.events).toHaveLength(2);
  });

  it('accepte un ancien format compatible et le normalise', () => {
    // Sans champ deleted ni updatedAt.
    const r = validateBackup(backup([feed({ id: 'legacy', updatedAt: undefined, deleted: undefined })]));
    expect(r.ok).toBe(true);
    expect(r.events[0].deleted).toBe(false);
    expect(r.events[0].updatedAt).toBe('2026-07-15T10:00:00.000Z'); // repris de start
  });

  it('refuse un événement sans id', () => {
    const r = validateBackup(backup([feed({ id: '' })]));
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/invalide/i);
  });

  it('refuse un type invalide', () => {
    const r = validateBackup(backup([{ id: 'x', type: 'note', start: '2026-07-15T10:00:00Z' }]));
    expect(r.ok).toBe(false);
  });

  it('refuse une date invalide', () => {
    const r = validateBackup(backup([feed({ start: 'pas-une-date' })]));
    expect(r.ok).toBe(false);
  });

  it('refuse un fichier d’une autre app ou sans liste d’événements', () => {
    expect(validateBackup({ app: 'autre', events: [] }).ok).toBe(false);
    expect(validateBackup({ app: 'newborn-monitor' }).ok).toBe(false);
    expect(validateBackup(null).ok).toBe(false);
  });
});

describe('P1-2 — décision de restauration', () => {
  it('invalide : statut invalid, aucun événement à appliquer', () => {
    const d = prepareRestore(backup([feed({ id: '' })]), 5);
    expect(d.status).toBe('invalid');
    expect(d.events).toBeUndefined();
  });
  it('avec données locales : demande confirmation + nombre à remplacer', () => {
    const d = prepareRestore(backup([feed()]), 5);
    expect(d.status).toBe('confirm');
    expect(d.replaceCount).toBe(5);
    expect(d.events).toHaveLength(1);
  });
  it('sans données locales : applique directement', () => {
    const d = prepareRestore(backup([feed()]), 0);
    expect(d.status).toBe('apply');
  });
});

describe('Point 1 — persistThenCommit (rollback)', () => {
  it('succès : committed true, valeur transmise', () => {
    const written = [];
    const r = persistThenCommit(['x'], (v) => written.push(v));
    expect(r.committed).toBe(true);
    expect(r.value).toEqual(['x']);
    expect(written).toHaveLength(1);
  });
  it('échec (quota) : committed false, aucune valeur committée', () => {
    const r = persistThenCommit(['x'], () => {
      throw quotaError();
    });
    expect(r.committed).toBe(false);
    expect(r.value).toBeUndefined();
    expect(r.error.name).toBe('QuotaExceededError');
  });
});

describe('P1-3 — dimensions de redimensionnement', () => {
  it('réduit une grande image en conservant le ratio', () => {
    expect(computeResizeDimensions(4000, 3000, 1024)).toEqual({ width: 1024, height: 768 });
  });
  it('ne modifie pas une image déjà petite', () => {
    expect(computeResizeDimensions(800, 600, 1024)).toEqual({ width: 800, height: 600 });
  });
  it('gère les dimensions invalides sans planter', () => {
    expect(computeResizeDimensions(0, 0, 1024)).toEqual({ width: 0, height: 0 });
  });
});
