// Couche de persistance locale (localStorage). Aucune donnée envoyée à un serveur.
// La structure (id, updatedAt, deviceId) prépare une future synchro entre parents.

const EVENTS_KEY = 'nt_events_v1';
const BABY_KEY = 'nt_baby_v1';
const THEME_KEY = 'nt_theme_v1';
const DEVICE_KEY = 'nt_device_v1';
const HOUSEHOLD_KEY = 'nt_household_v1';
const OUTBOX_KEY = 'nt_outbox_v1';
const MIGRATED_KEY = 'nt_migrated_v1';

function safeParse(raw, fallback) {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function getDeviceId() {
  let id = localStorage.getItem(DEVICE_KEY);
  if (!id) {
    id = 'dev_' + Math.random().toString(36).slice(2, 10);
    localStorage.setItem(DEVICE_KEY, id);
  }
  return id;
}

export function newId() {
  // UUID généré côté client (les anciens ids « evt_… » restent acceptés).
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return (
    'evt_' +
    Date.now().toString(36) +
    '_' +
    Math.random().toString(36).slice(2, 8)
  );
}

export function loadEvents() {
  return safeParse(localStorage.getItem(EVENTS_KEY), []);
}

export function saveEvents(events) {
  localStorage.setItem(EVENTS_KEY, JSON.stringify(events));
}

export function loadBaby() {
  return safeParse(localStorage.getItem(BABY_KEY), {
    name: '',
    birth: '',
    birthWeight: '',
    currentWeight: '',
    sex: '',
    photo: '',
  });
}

export function saveBaby(baby) {
  localStorage.setItem(BABY_KEY, JSON.stringify(baby));
}

export function loadTheme() {
  return localStorage.getItem(THEME_KEY) || 'auto';
}

export function saveTheme(theme) {
  localStorage.setItem(THEME_KEY, theme);
}

// Foyer pour la synchro multi-appareils : { id: uuid, code: 'NBM7-K4PX-W9QF' }.
// Le code affiché est conservé localement seulement (la base n'en garde que le hash).
export function loadHousehold() {
  return safeParse(localStorage.getItem(HOUSEHOLD_KEY), null);
}

export function saveHousehold(household) {
  if (household && household.id) {
    localStorage.setItem(HOUSEHOLD_KEY, JSON.stringify(household));
  } else {
    localStorage.removeItem(HOUSEHOLD_KEY);
  }
}

// File d'attente persistante d'ids d'événements à pousser (outbox).
export function loadOutbox() {
  return safeParse(localStorage.getItem(OUTBOX_KEY), []);
}

export function saveOutbox(ids) {
  localStorage.setItem(OUTBOX_KEY, JSON.stringify(ids));
}

export function enqueueOutbox(id) {
  const ids = loadOutbox();
  if (!ids.includes(id)) saveOutbox([...ids, id]);
}

export function dequeueOutbox(id) {
  saveOutbox(loadOutbox().filter((x) => x !== id));
}

// Id du foyer pour lequel le téléversement initial des données locales a déjà
// été fait (rend la migration idempotente, sans doublons si relancée).
export function loadMigratedFor() {
  return localStorage.getItem(MIGRATED_KEY) || '';
}

export function saveMigratedFor(householdId) {
  if (householdId) localStorage.setItem(MIGRATED_KEY, householdId);
  else localStorage.removeItem(MIGRATED_KEY);
}
