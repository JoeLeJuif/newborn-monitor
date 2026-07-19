import { describe, it, expect } from 'vitest';
import { isSessionMode, sessionStatusLine } from './activeFeedingView.js';
import { createSession, pauseSession } from './feedingSession.js';

const START = Date.parse('2026-07-18T19:24:00.000Z');

describe('isSessionMode', () => {
  it('affiche le formulaire (pas le mode session) sans session active', () => {
    expect(isSessionMode(null, undefined)).toBe(false);
  });

  it('bascule en mode session quand un boire est actif sur un NOUVEAU boire', () => {
    const s = createSession('right', START);
    expect(isSessionMode(s, undefined)).toBe(true);
  });

  it("reste sur le formulaire en modification, même avec une session active", () => {
    const s = createSession('right', START);
    expect(isSessionMode(s, 'evt_123')).toBe(false);
  });
});

describe('sessionStatusLine', () => {
  it('nomme le sein actif et l\'heure de début', () => {
    const s = createSession('right', START);
    const line = sessionStatusLine(s);
    expect(line).toContain('Droit');
    expect(line).toContain('commencé à');
  });

  it('ne montre jamais « il y a X min » (le chrono le fait déjà)', () => {
    const s = createSession('left', START);
    expect(sessionStatusLine(s)).not.toContain('il y a');
  });

  it('signale l\'état en pause', () => {
    const paused = pauseSession(createSession('left', START), START + 1000);
    expect(sessionStatusLine(paused)).toContain('en pause');
  });

  it('ne montre pas « en pause » quand la minuterie tourne', () => {
    const s = createSession('left', START);
    expect(sessionStatusLine(s)).not.toContain('en pause');
  });

  it('renvoie une chaîne vide sans session', () => {
    expect(sessionStatusLine(null)).toBe('');
  });
});
