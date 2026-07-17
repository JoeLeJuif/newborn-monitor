// Store applicatif : événements + profil bébé.
//
// Architecture locale d'abord : lecture/écriture instantanées dans
// localStorage (fonctionne entièrement hors-ligne) ; la synchro Supabase est
// optionnelle et tourne en arrière-plan. Une erreur de synchro n'empêche
// jamais l'utilisation locale.
//
// Suppressions = tombstones (deleted:true) synchronisés entre appareils ;
// les vues ne reçoivent que les événements actifs via `events`.
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useCallback,
} from 'react';
import {
  loadEvents,
  saveEvents,
  loadBaby,
  saveBaby,
  loadHousehold,
  saveHousehold,
  loadOutbox,
  saveOutbox,
  enqueueOutbox,
  dequeueOutbox,
  loadMigratedFor,
  saveMigratedFor,
  loadTheme,
  newId,
  getDeviceId,
} from '../lib/storage.js';
import { nowISO } from '../lib/time.js';
import { outboxAfterDrain, validateBackup } from '../lib/dataops.js';
import * as sync from '../lib/sync.js';

const STORAGE_FULL_MSG =
  'Espace de stockage insuffisant : la dernière donnée n’a peut-être pas été ' +
  'enregistrée sur cet appareil. Exporte une sauvegarde et libère de l’espace ' +
  '(par ex. une photo du bébé trop lourde).';

const StoreContext = createContext(null);

// Pull de rattrapage périodique même si le temps réel est actif.
const CATCHUP_INTERVAL_MS = 5 * 60 * 1000;

export function StoreProvider({ children }) {
  // allEvents contient aussi les tombstones ; `events` = vue active filtrée.
  const [allEvents, setAllEvents] = useState(() => loadEvents());
  const [baby, setBabyState] = useState(() => loadBaby());
  const [household, setHouseholdState] = useState(() => loadHousehold());
  // off | syncing | synced | offline | error
  const [syncStatus, setSyncStatus] = useState('off');
  // Message d'erreur de persistance locale (quota dépassé, etc.).
  const [storageError, setStorageError] = useState('');
  const deviceId = useRef(getDeviceId());
  const babyFirst = useRef(true);

  // Miroirs pour les fonctions async (mis à jour hors rendu).
  const allRef = useRef(allEvents);
  const babyRef = useRef(baby);
  const householdRef = useRef(household);
  const syncingRef = useRef(false);

  const syncEnabled = sync.isSyncConfigured && Boolean(household?.id);

  useEffect(() => {
    allRef.current = allEvents;
    try {
      saveEvents(allEvents);
    } catch {
      // Persistance échouée (quota) : prévenir sans faire croire à un succès.
      setStorageError(STORAGE_FULL_MSG);
    }
  }, [allEvents]);

  useEffect(() => {
    babyRef.current = baby;
    if (babyFirst.current) {
      babyFirst.current = false;
      return;
    }
    try {
      saveBaby(baby);
    } catch {
      setStorageError(STORAGE_FULL_MSG);
    }
  }, [baby]);

  useEffect(() => {
    householdRef.current = household;
  }, [household]);

  // Vue active (sans tombstones).
  const events = useMemo(() => allEvents.filter((e) => !e.deleted), [allEvents]);

  // ── Fusions (temps réel + pulls) ──
  const mergeIncomingEvents = useCallback((incoming) => {
    setAllEvents((prev) => sync.mergeEvents(prev, incoming));
  }, []);

  const mergeIncomingBaby = useCallback((remoteBaby) => {
    setBabyState((prev) =>
      !prev?.updatedAt ||
      new Date(remoteBaby.updatedAt) >= new Date(prev.updatedAt)
        ? remoteBaby
        : prev,
    );
  }, []);

  // ── Poussée immédiate d'une mutation (outbox d'abord : rien ne se perd) ──
  const pushOne = useCallback((ev) => {
    enqueueOutbox(ev.id);
    const hid = householdRef.current?.id;
    if (!sync.isSyncConfigured || !hid) return;
    sync
      .pushEvents(hid, [ev])
      .then(() => dequeueOutbox(ev.id))
      .catch(() => {
        // Reste dans l'outbox ; sera rejoué à la prochaine synchro.
      });
  }, []);

  // ── Mutations locales (toujours instantanées) ──
  function addEvent(data) {
    const ev = {
      id: newId(),
      createdAt: nowISO(),
      updatedAt: nowISO(),
      deviceId: deviceId.current,
      deleted: false,
      ...data,
    };
    setAllEvents((prev) => [...prev, ev]);
    pushOne(ev);
    return ev;
  }

  function updateEvent(id, patch) {
    let updated = null;
    setAllEvents((prev) =>
      prev.map((e) => {
        if (e.id !== id) return e;
        updated = { ...e, ...patch, updatedAt: nowISO() };
        return updated;
      }),
    );
    if (updated) pushOne(updated);
  }

  function deleteEvent(id) {
    let tombstone = null;
    setAllEvents((prev) =>
      prev.map((e) => {
        if (e.id !== id) return e;
        tombstone = { ...e, deleted: true, updatedAt: nowISO() };
        return tombstone;
      }),
    );
    if (tombstone) pushOne(tombstone);
  }

  function getEvent(id) {
    return allEvents.find((e) => e.id === id && !e.deleted) || null;
  }

  function setBaby(next) {
    const stamped = { ...next, updatedAt: nowISO() };
    setBabyState(stamped);
    const hid = householdRef.current?.id;
    if (sync.isSyncConfigured && hid) {
      sync.pushBaby(hid, stamped).catch(() => {});
    }
  }

  // ── Synchronisation complète : pull + fusion, puis drainage de l'outbox.
  // Idempotente (upsert par id, gardé par updated_at côté serveur) : rejouable
  // sans doublon ; une vieille écriture hors-ligne n'écrase jamais une version
  // distante plus récente.
  const runFullSync = useCallback(async () => {
    const hid = householdRef.current?.id;
    if (!sync.isSyncConfigured || !hid) return;
    if (syncingRef.current) return;
    syncingRef.current = true;
    setSyncStatus('syncing');
    try {
      await sync.ensureAuth();
      // 1. Tirer et fusionner.
      const [remoteEvents, remoteBaby] = await Promise.all([
        sync.pullEvents(hid),
        sync.pullBaby(hid),
      ]);
      mergeIncomingEvents(remoteEvents);
      if (remoteBaby) mergeIncomingBaby(remoteBaby);
      // 2. Pousser : tout le local au premier passage pour ce foyer
      //    (migration initiale), sinon seulement l'outbox.
      const needInitialUpload = loadMigratedFor() !== hid;
      const outboxSnapshot = loadOutbox();
      const toPush = needInitialUpload
        ? allRef.current
        : allRef.current.filter((e) => outboxSnapshot.includes(e.id));
      const drainedIds = toPush.map((e) => e.id);
      if (toPush.length) await sync.pushEvents(hid, toPush);
      if (needInitialUpload) saveMigratedFor(hid);
      // Retire seulement les ids réellement poussés ; préserve tout id ajouté
      // à l'outbox pendant la synchronisation (concurrence).
      saveOutbox(outboxAfterDrain(loadOutbox(), drainedIds));
      // 3. Profil bébé (gardé par updated_at côté serveur).
      const b = babyRef.current;
      if (b?.updatedAt && (b.name || b.birth || b.birthWeight)) {
        await sync.pushBaby(hid, b);
      }
      setSyncStatus('synced');
    } catch {
      setSyncStatus(navigator.onLine === false ? 'offline' : 'error');
    } finally {
      syncingRef.current = false;
    }
  }, [mergeIncomingEvents, mergeIncomingBaby]);

  // Démarrage + temps réel + rattrapage (premier plan, reconnexion, minuterie).
  useEffect(() => {
    if (!syncEnabled) return;
    // Pull initial au montage / changement de foyer.
    runFullSync();
    const unsub = sync.subscribeHousehold(household.id, {
      onEvents: mergeIncomingEvents,
      onBaby: mergeIncomingBaby,
    });
    const onVisible = () => {
      if (document.visibilityState === 'visible') runFullSync();
    };
    const onOnline = () => runFullSync();
    const onOffline = () => setSyncStatus('offline');
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') runFullSync();
    }, CATCHUP_INTERVAL_MS);
    return () => {
      unsub();
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      clearInterval(timer);
    };
  }, [syncEnabled, household?.id, runFullSync, mergeIncomingEvents, mergeIncomingBaby]);

  // ── Actions foyer ──
  // uploadLocal=false : les données déjà présentes sur cet appareil ne sont
  // pas téléversées (elles restent locales).
  async function createHousehold(uploadLocal = true) {
    const { householdId, code } = await sync.createHousehold();
    if (!uploadLocal) saveMigratedFor(householdId);
    else saveMigratedFor('');
    const h = { id: householdId, code };
    saveHousehold(h);
    setHouseholdState(h);
    return code;
  }

  // strategy: 'merge' (fusionner local + distant) | 'replace' (le distant
  // remplace les données locales). Jamais de suppression silencieuse : le
  // choix est explicite dans l'interface.
  async function joinHousehold(codeInput, strategy = 'merge') {
    const hid = await sync.joinHousehold(codeInput);
    if (!hid) return false;
    if (strategy === 'replace') {
      setAllEvents([]);
      setBabyState(loadBabyDefaults());
      saveOutbox([]);
      saveMigratedFor(hid); // rien à téléverser
    } else {
      saveMigratedFor(''); // fusion : téléverser le local au premier sync
    }
    const h = { id: hid, code: sync.formatCode(codeInput) };
    saveHousehold(h);
    setHouseholdState(h);
    return true;
  }

  function leaveHousehold() {
    saveHousehold(null);
    saveOutbox([]);
    saveMigratedFor('');
    setHouseholdState(null);
    setSyncStatus('off');
  }

  async function regenerateCode() {
    const hid = householdRef.current?.id;
    const code = await sync.regenerateInvite(hid);
    const h = { id: hid, code };
    saveHousehold(h);
    setHouseholdState(h);
    return code;
  }

  async function revokeCode() {
    const hid = householdRef.current?.id;
    await sync.revokeInvites(hid);
    const h = { id: hid, code: '' };
    saveHousehold(h);
    setHouseholdState(h);
  }

  // ── Sauvegarde locale (JSON) ──
  // Inclut le profil du bébé et l'historique complet (boires/pipis/cacas avec
  // dates, heures, durées, quantités, couleurs, textures, notes) + paramètres.
  function exportBackup() {
    return {
      app: 'newborn-monitor',
      version: 1,
      exportedAt: nowISO(),
      deviceId: deviceId.current,
      settings: { theme: loadTheme() },
      baby,
      events: allEvents, // tombstones inclus (fidélité complète)
    };
  }

  // Ne remplace jamais les données locales avec un import invalide (valide
  // d'abord). Ne supprime aucune donnée Supabase : au prochain sync, l'upsert
  // est gardé par updated_at et le pull refusionne les événements distants.
  function restoreBackup(data) {
    const v = validateBackup(data);
    if (!v.ok) throw new Error(v.error);
    setAllEvents(v.events);
    if (data.baby) setBabyState(data.baby);
    saveMigratedFor(''); // forcer un téléversement complet au prochain sync
  }

  const value = {
    events,
    baby,
    setBaby,
    addEvent,
    updateEvent,
    deleteEvent,
    getEvent,
    // synchro
    syncConfigured: sync.isSyncConfigured,
    household,
    syncStatus,
    storageError,
    clearStorageError: () => setStorageError(''),
    createHousehold,
    joinHousehold,
    leaveHousehold,
    regenerateCode,
    revokeCode,
    resync: runFullSync,
    exportBackup,
    restoreBackup,
  };

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

function loadBabyDefaults() {
  return {
    name: '',
    birth: '',
    birthWeight: '',
    currentWeight: '',
    sex: '',
    photo: '',
  };
}

// eslint-disable-next-line react-refresh/only-export-components
export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore doit être utilisé dans StoreProvider');
  return ctx;
}
