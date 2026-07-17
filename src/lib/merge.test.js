import { describe, it, expect } from 'vitest';
import { mergeEvents } from './sync.js';
import { normalizeEvent } from './dataops.js';

// Événement de test (feed) ; updatedAt explicite.
const ev = (id, updatedAt, over = {}) => ({
  id,
  type: 'feed',
  start: '2026-07-01T10:00:00.000Z',
  updatedAt,
  deleted: false,
  ...over,
});

// mergeEvents(local, incoming) : `incoming` = ce qui est tiré de Supabase.
describe('Point 2 — restauration / updatedAt / conflits de sync', () => {
  it('sauvegarde ANCIENNE n’écrase pas un événement distant plus récent', () => {
    const localImport = [ev('a', '2026-07-01T00:00:00.000Z', { note: 'ancien import' })];
    const remoteNewer = [ev('a', '2026-07-14T00:00:00.000Z', { note: 'distant récent' })];
    const merged = mergeEvents(localImport, remoteNewer);
    const a = merged.find((x) => x.id === 'a');
    expect(a.updatedAt).toBe('2026-07-14T00:00:00.000Z');
    expect(a.note).toBe('distant récent'); // le distant l’emporte
  });

  it('sauvegarde RÉCENTE écrase un événement distant plus ancien', () => {
    const localNewer = [ev('a', '2026-07-20T00:00:00.000Z', { note: 'local récent' })];
    const remoteOlder = [ev('a', '2026-07-05T00:00:00.000Z', { note: 'distant ancien' })];
    const merged = mergeEvents(localNewer, remoteOlder);
    expect(merged.find((x) => x.id === 'a').note).toBe('local récent');
  });

  it('ancien format sans updatedAt : repli sur la date de survenue (jamais now)', () => {
    const n = normalizeEvent({ id: 'a', type: 'feed', start: '2026-07-01T10:00:00.000Z' });
    expect(n.updatedAt).toBe('2026-07-01T10:00:00.000Z'); // pas d’horodatage artificiel récent
    // et en conflit avec un distant plus récent, le distant gagne
    const merged = mergeEvents([n], [ev('a', '2026-07-14T00:00:00.000Z', { note: 'distant' })]);
    expect(merged.find((x) => x.id === 'a').note).toBe('distant');
  });

  it('tombstone distante plus récente l’emporte (pas de résurrection)', () => {
    const localActive = [ev('a', '2026-07-01T00:00:00.000Z')];
    const remoteTombstone = [ev('a', '2026-07-16T00:00:00.000Z', { deleted: true })];
    const merged = mergeEvents(localActive, remoteTombstone);
    expect(merged.find((x) => x.id === 'a').deleted).toBe(true);
  });
});
