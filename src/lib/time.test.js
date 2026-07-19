import { describe, it, expect, vi, afterEach } from 'vitest';
import { elapsedSince, formatDuration } from './time.js';

const T0 = new Date('2026-07-15T12:00:00').getTime();
const MIN = 60000;

afterEach(() => {
  vi.useRealTimers();
});

describe('elapsedSince — horloge injectable', () => {
  it('absence de date -> tiret', () => {
    expect(elapsedSince(null)).toBe('—');
    expect(elapsedSince('')).toBe('—');
  });

  it('moins d’une minute -> « à l’instant »', () => {
    const iso = new Date(T0).toISOString();
    expect(elapsedSince(iso, T0 + 30000)).toBe("à l'instant");
  });

  it('le texte évolue avec l’horloge, sans attendre réellement', () => {
    const iso = new Date(T0).toISOString();
    // Même événement, trois instants simulés : la valeur DOIT changer.
    const a = elapsedSince(iso, T0 + 1 * MIN);
    const b = elapsedSince(iso, T0 + 45 * MIN);
    const c = elapsedSince(iso, T0 + 135 * MIN);
    expect(a).toBe(`il y a ${formatDuration(60)}`);
    expect(b).toBe(`il y a ${formatDuration(45 * 60)}`);
    expect(c).toBe(`il y a ${formatDuration(135 * 60)}`);
    expect(new Set([a, b, c]).size).toBe(3);
  });

  it('sans nowMs explicite, utilise l’horloge courante (simulée)', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(T0));
    const iso = new Date(T0 - 2 * MIN).toISOString();
    const avant = elapsedSince(iso);

    // Avance de 60 minutes SANS attente réelle : c'est exactement ce que le
    // tick d'une minute du tableau de bord provoque en production.
    vi.setSystemTime(new Date(T0 + 60 * MIN));
    const apres = elapsedSince(iso);

    expect(avant).not.toBe(apres);
    expect(apres).toBe(`il y a ${formatDuration(62 * 60)}`);
  });

  it('une horloge qui recule ne produit pas de durée négative affichée', () => {
    const iso = new Date(T0).toISOString();
    // nowMs antérieur à l'événement : diffSec < 60 -> « à l'instant ».
    expect(elapsedSince(iso, T0 - 5 * MIN)).toBe("à l'instant");
  });
});
