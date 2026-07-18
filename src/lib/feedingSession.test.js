import { describe, it, expect, beforeEach } from 'vitest';
import {
  ACTIVE_FEEDING_KEY,
  LONG_SESSION_MS,
  createSession,
  startOrSwitchSide,
  pauseSession,
  resumeSession,
  setSessionNote,
  elapsedLeftMs,
  elapsedRightMs,
  totalMs,
  isRunning,
  isLong,
  finalizeToEvent,
  isValidSession,
  loadActiveFeeding,
  saveActiveFeeding,
  clearActiveFeeding,
} from './feedingSession.js';

const T0 = Date.parse('2026-07-18T08:00:00.000Z');
const S = 1000;
const MIN = 60 * S;

function makeLS() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    _map: map,
  };
}

beforeEach(() => {
  globalThis.localStorage = makeLS();
});

describe('démarrage d’une session', () => {
  it('crée une session active avec les bons champs', () => {
    const s = createSession('left', T0);
    expect(s.active).toBe(true);
    expect(typeof s.sessionId).toBe('string');
    expect(s.startedAt).toBe(new Date(T0).toISOString());
    expect(s.currentSide).toBe('left');
    expect(s.currentSegmentStartedAt).toBe(T0);
    expect(s.accumulatedLeftMs).toBe(0);
    expect(s.accumulatedRightMs).toBe(0);
    expect(s.paused).toBe(false);
    expect(s.feedingType).toBe('left');
  });
});

describe('temps calculé depuis les timestamps (jamais un compteur)', () => {
  it('total = temps écoulé depuis le début du segment', () => {
    const s = createSession('left', T0);
    expect(totalMs(s, T0)).toBe(0);
    expect(totalMs(s, T0 + 90 * S)).toBe(90 * S);
    expect(elapsedLeftMs(s, T0 + 90 * S)).toBe(90 * S);
    expect(elapsedRightMs(s, T0 + 90 * S)).toBe(0);
    expect(isRunning(s)).toBe(true);
  });

  it('une horloge qui recule n’enlève jamais de temps', () => {
    const s = createSession('left', T0);
    // now avant le début du segment -> contribution nulle, pas négative
    expect(totalMs(s, T0 - 5 * MIN)).toBe(0);
  });
});

describe('changement de sein et accumulation', () => {
  it('accumule le côté précédent puis démarre le nouveau segment', () => {
    let s = createSession('left', T0); // gauche démarre à T0
    s = startOrSwitchSide(s, 'right', T0 + 5 * MIN); // 5 min à gauche
    expect(s.accumulatedLeftMs).toBe(5 * MIN);
    expect(s.currentSide).toBe('right');
    expect(s.feedingType).toBe('both');
    // 3 min à droite
    expect(elapsedRightMs(s, T0 + 8 * MIN)).toBe(3 * MIN);
    expect(totalMs(s, T0 + 8 * MIN)).toBe(8 * MIN);
  });

  it('plusieurs changements de sein : accumulation cohérente', () => {
    let s = createSession('left', T0);
    s = startOrSwitchSide(s, 'right', T0 + 2 * MIN); // +2 gauche
    s = startOrSwitchSide(s, 'left', T0 + 5 * MIN); // +3 droite
    s = startOrSwitchSide(s, 'right', T0 + 6 * MIN); // +1 gauche
    // à T0+9 : +3 droite en cours
    expect(elapsedLeftMs(s, T0 + 9 * MIN)).toBe(3 * MIN); // 2 + 1
    expect(elapsedRightMs(s, T0 + 9 * MIN)).toBe(6 * MIN); // 3 + 3
    expect(totalMs(s, T0 + 9 * MIN)).toBe(9 * MIN);
    expect(s.feedingType).toBe('both');
  });
});

describe('pause / reprise', () => {
  it('la pause fige le temps, la reprise repart sans le perdre', () => {
    let s = createSession('left', T0);
    s = pauseSession(s, T0 + 4 * MIN);
    expect(s.paused).toBe(true);
    expect(isRunning(s)).toBe(false);
    expect(s.accumulatedLeftMs).toBe(4 * MIN);
    // le temps n'avance pas pendant la pause
    expect(totalMs(s, T0 + 10 * MIN)).toBe(4 * MIN);
    // reprise 6 min plus tard
    s = resumeSession(s, T0 + 10 * MIN);
    expect(s.paused).toBe(false);
    expect(totalMs(s, T0 + 12 * MIN)).toBe(6 * MIN); // 4 accumulées + 2 nouvelles
  });
});

describe('finalisation (barre ou formulaire) : un seul événement', () => {
  it('produit les données d’un événement de boire au format actuel', () => {
    let s = createSession('left', T0);
    s = startOrSwitchSide(s, 'right', T0 + 5 * MIN);
    const ev = finalizeToEvent(s, T0 + 8 * MIN, { note: '  ok  ' });
    expect(ev).toEqual({
      type: 'feed',
      feedType: 'both',
      start: new Date(T0).toISOString(),
      durationSec: 8 * 60,
      amountMl: null,
      inProgress: false,
      lastSide: 'right',
      note: 'ok',
    });
  });

  it('finaliser une session absente renvoie null (garde double-clic)', () => {
    expect(finalizeToEvent(null)).toBeNull();
  });

  it('note de la session utilisée si aucune note passée', () => {
    let s = createSession('left', T0);
    s = setSessionNote(s, 'régurgitation');
    const ev = finalizeToEvent(s, T0 + 60 * S);
    expect(ev.note).toBe('régurgitation');
    expect(ev.durationSec).toBe(60);
  });
});

describe('persistance locale (restauration, invalide, suppression)', () => {
  it('sauvegarde puis restauration renvoie une session équivalente', () => {
    const s = createSession('left', T0);
    saveActiveFeeding(s);
    expect(globalThis.localStorage.getItem(ACTIVE_FEEDING_KEY)).toBeTruthy();
    const loaded = loadActiveFeeding();
    expect(loaded.sessionId).toBe(s.sessionId);
    expect(loaded.currentSide).toBe('left');
    expect(loaded.startedAt).toBe(s.startedAt);
  });

  it('restauration continue à calculer le bon temps (arrière-plan / verrouillage)', () => {
    const s = createSession('left', T0);
    saveActiveFeeding(s);
    const loaded = loadActiveFeeding();
    // 40 min plus tard (app en arrière-plan) : le temps est recalculé.
    expect(totalMs(loaded, T0 + 40 * MIN)).toBe(40 * MIN);
  });

  it('aucune session persistée -> load renvoie null (pas de barre)', () => {
    expect(loadActiveFeeding()).toBeNull();
  });

  it('JSON local invalide -> load renvoie null sans planter', () => {
    globalThis.localStorage.setItem(ACTIVE_FEEDING_KEY, '{ pas du json ');
    expect(() => loadActiveFeeding()).not.toThrow();
    expect(loadActiveFeeding()).toBeNull();
  });

  it('session persistée incomplète/invalide -> ignorée', () => {
    expect(isValidSession({ active: true })).toBe(false); // pas de sessionId/startedAt
    expect(isValidSession({ active: false, sessionId: 'x', startedAt: new Date(T0).toISOString(), accumulatedLeftMs: 0, accumulatedRightMs: 0 })).toBe(false);
    globalThis.localStorage.setItem(
      ACTIVE_FEEDING_KEY,
      JSON.stringify({ active: true, sessionId: 'x', startedAt: 'pas-une-date', accumulatedLeftMs: 0, accumulatedRightMs: 0 }),
    );
    expect(loadActiveFeeding()).toBeNull();
  });

  it('annulation / suppression : clear retire la clé', () => {
    saveActiveFeeding(createSession('left', T0));
    clearActiveFeeding();
    expect(globalThis.localStorage.getItem(ACTIVE_FEEDING_KEY)).toBeNull();
    expect(loadActiveFeeding()).toBeNull();
  });
});

describe('session longue : avertissement non bloquant', () => {
  it('isLong à partir du seuil, sans invalider la session', () => {
    const s = createSession('left', T0);
    expect(isLong(s, T0 + LONG_SESSION_MS - 1)).toBe(false);
    expect(isLong(s, T0 + LONG_SESSION_MS)).toBe(true);
    // la session reste valide (jamais supprimée automatiquement)
    saveActiveFeeding(s);
    expect(loadActiveFeeding()).not.toBeNull();
  });
});

describe('données sans côté (robustesse)', () => {
  it('setSessionNote et finalize tolèrent une session sans temps accumulé', () => {
    const s = createSession('left', T0);
    const ev = finalizeToEvent(s, T0); // 0 s
    expect(ev.durationSec).toBe(0);
    expect(ev.lastSide).toBe('left');
  });
});

describe('nouveau boire pendant une session active (pas de seconde session)', () => {
  it('startOrSwitchSide sur une session existante conserve le même sessionId', () => {
    const s = createSession('left', T0);
    const s2 = startOrSwitchSide(s, 'right', T0 + 2 * MIN);
    // Même session (aucune seconde session chronométrée créée en parallèle).
    expect(s2.sessionId).toBe(s.sessionId);
    expect(s2.startedAt).toBe(s.startedAt);
  });
});

describe('échec de finalisation : la session n’est pas perdue', () => {
  it('finalizeToEvent est pure et ne modifie pas la session (peut être conservée)', () => {
    const s = createSession('left', T0);
    const snapshot = JSON.parse(JSON.stringify(s));
    const ev = finalizeToEvent(s, T0 + 3 * MIN);
    expect(ev).not.toBeNull();
    // La session d'origine est intacte : si addEvent échoue, on peut la garder.
    expect(s).toEqual(snapshot);
  });
});

describe('double finalisation : un seul événement', () => {
  it('après finalisation (session vidée), un second appel renvoie null', () => {
    let s = createSession('left', T0);
    const first = finalizeToEvent(s, T0 + 60 * S);
    expect(first).not.toBeNull();
    // La barre/formulaire supprime la session après succès -> second appel null.
    s = null;
    const second = finalizeToEvent(s, T0 + 61 * S);
    expect(second).toBeNull();
  });
});

describe('startedAt final exact + total = gauche + droite', () => {
  it('startedAt = début réel (pas l’heure de finalisation) et durée = G + D', () => {
    let s = createSession('left', T0);
    s = startOrSwitchSide(s, 'right', T0 + 4 * MIN); // 4 min gauche
    // finalisation bien plus tard : 6 min à droite
    const nowMs = T0 + 10 * MIN;
    const left = elapsedLeftMs(s, nowMs);
    const right = elapsedRightMs(s, nowMs);
    const ev = finalizeToEvent(s, nowMs);
    expect(ev.start).toBe(new Date(T0).toISOString()); // début réel, pas nowMs
    expect(left).toBe(4 * MIN);
    expect(right).toBe(6 * MIN);
    expect(ev.durationSec).toBe(Math.round((left + right) / 1000)); // total = G + D
    expect(ev.durationSec).toBe(10 * 60);
  });
});

describe('notes conservées après navigation / restauration', () => {
  it('la note saisie survit à la persistance et se retrouve à la finalisation', () => {
    let s = createSession('left', T0);
    s = setSessionNote(s, "Bébé s'est endormi");
    saveActiveFeeding(s); // navigation : la session est persistée
    const restored = loadActiveFeeding(); // retour / rechargement
    expect(restored.note).toBe("Bébé s'est endormi");
    const ev = finalizeToEvent(restored, T0 + 5 * MIN);
    expect(ev.note).toBe("Bébé s'est endormi");
  });
});
