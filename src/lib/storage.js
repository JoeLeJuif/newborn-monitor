// Couche de persistance locale (localStorage). Aucune donnée envoyée à un serveur.
// La structure (id, updatedAt, deviceId) prépare une future synchro entre parents.

const EVENTS_KEY = 'nt_events_v1';
const BABY_KEY = 'nt_baby_v1';
const THEME_KEY = 'nt_theme_v1';
const DEVICE_KEY = 'nt_device_v1';

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
