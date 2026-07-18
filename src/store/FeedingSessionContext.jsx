// État global d'une session de boire active (minuterie d'allaitement).
//
// La session survit aux changements de page : elle vit ici, au-dessus de la
// navigation, et non dans le formulaire de boire (qui est démonté quand on
// change d'onglet). Toute la logique de calcul est PURE (src/lib/feedingSession)
// et la persistance est locale + dédiée ; rien n'est envoyé à Supabase tant que
// le boire n'est pas terminé.
import {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { useStore } from './useStore.jsx';
import {
  loadActiveFeeding,
  saveActiveFeeding,
  clearActiveFeeding,
  startOrSwitchSide,
  pauseSession,
  resumeSession,
  setSessionNote,
  finalizeToEvent,
  isRunning,
} from '../lib/feedingSession.js';

const FeedingSessionContext = createContext(null);

export function FeedingSessionProvider({ children }) {
  const { addEvent } = useStore();

  // Restauration automatique d'une session active au démarrage / rechargement.
  const [session, setSession] = useState(() => loadActiveFeeding());

  // Miroir synchrone pour lire/écrire la session sans dépendre d'un re-render
  // (finalisation immédiate, garde anti-double-clic).
  const sessionRef = useRef(session);
  const finishingRef = useRef(false);

  // Persiste chaque changement (best effort) ; supprime la clé quand terminé.
  useEffect(() => {
    if (session) saveActiveFeeding(session);
    else clearActiveFeeding();
  }, [session]);

  // Applique une transition pure et met à jour le miroir immédiatement.
  const apply = useCallback((next) => {
    sessionRef.current = next;
    setSession(next);
  }, []);

  const startOrSwitch = useCallback(
    (side) => {
      finishingRef.current = false;
      apply(startOrSwitchSide(sessionRef.current, side));
    },
    [apply],
  );

  const pause = useCallback(() => apply(pauseSession(sessionRef.current)), [apply]);
  const resume = useCallback(() => apply(resumeSession(sessionRef.current)), [apply]);
  const updateNote = useCallback(
    (note) => {
      if (sessionRef.current) apply(setSessionNote(sessionRef.current, note));
    },
    [apply],
  );

  const cancel = useCallback(() => {
    finishingRef.current = false;
    apply(null);
  }, [apply]);

  // Finalisation : crée UN seul événement de boire, protégée contre le double
  // déclenchement (double-clic sur « Terminer », depuis la barre ou le formulaire).
  const finish = useCallback(
    (extra = {}) => {
      if (finishingRef.current) return null;
      const cur = sessionRef.current;
      if (!cur) return null;
      finishingRef.current = true;
      const data = finalizeToEvent(cur, Date.now(), extra);
      const created = addEvent(data);
      if (!created) {
        // Échec de persistance : on garde la session (temps non perdu) et on
        // autorise un nouvel essai. La bannière du store informe l'utilisateur.
        finishingRef.current = false;
        return null;
      }
      apply(null); // succès : session supprimée du contexte et de localStorage
      return created;
    },
    [addEvent, apply],
  );

  const value = {
    session,
    isActive: !!session,
    running: isRunning(session),
    startOrSwitch,
    pause,
    resume,
    updateNote,
    cancel,
    finish,
  };

  return (
    <FeedingSessionContext.Provider value={value}>
      {children}
    </FeedingSessionContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useFeedingSession() {
  const ctx = useContext(FeedingSessionContext);
  if (!ctx) throw new Error('useFeedingSession doit être utilisé dans FeedingSessionProvider');
  return ctx;
}
