// Utilitaires de temps — tout en français, format 24 h.

export function nowISO() {
  return new Date().toISOString();
}

// Convertit une Date en valeur pour <input type="datetime-local"> (heure locale).
export function toLocalInputValue(date) {
  const d = new Date(date);
  const pad = (n) => String(n).padStart(2, '0');
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}`
  );
}

// Lit une valeur de <input type="datetime-local"> en ISO.
export function fromLocalInputValue(value) {
  return new Date(value).toISOString();
}

// Durée en secondes -> "1 h 05" ou "12 min" ou "45 s".
export function formatDuration(totalSec) {
  const s = Math.max(0, Math.round(totalSec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h} h ${String(m).padStart(2, '0')}`;
  if (m > 0) return `${m} min ${String(sec).padStart(2, '0')}`;
  return `${sec} s`;
}

// Durée courte pour la minuterie -> "05:07".
export function formatTimer(totalSec) {
  const s = Math.max(0, Math.round(totalSec));
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

// Chronomètre lisible -> "MM:SS", ou "H:MM:SS" au-delà d'une heure.
export function formatStopwatch(totalSec) {
  const s = Math.max(0, Math.round(totalSec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n) => String(n).padStart(2, '0');
  if (h > 0) return `${h}:${pad(m)}:${pad(sec)}`;
  return `${pad(m)}:${pad(sec)}`;
}

// Temps écoulé depuis une date -> "il y a 2 h 15" ; renvoie "—" si absent.
export function elapsedSince(iso) {
  if (!iso) return '—';
  const diffSec = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diffSec < 60) return "à l'instant";
  return `il y a ${formatDuration(diffSec)}`;
}

// Âge du bébé à partir de la date de naissance.
export function babyAge(birthISO) {
  if (!birthISO) return null;
  const diffMs = Date.now() - new Date(birthISO).getTime();
  const totalMin = Math.floor(diffMs / 60000);
  const days = Math.floor(totalMin / 1440);
  const hours = Math.floor((totalMin % 1440) / 60);
  const totalHours = Math.floor(totalMin / 60);
  return { days, hours, totalHours, totalMin };
}

export function formatBabyAge(birthISO) {
  const age = babyAge(birthISO);
  if (!age) return '—';
  if (age.days < 1) {
    return `${age.totalHours} h`;
  }
  const dLabel = age.days > 1 ? 'jours' : 'jour';
  return `${age.days} ${dLabel} ${age.hours} h`;
}

// Date/heure lisible -> "lun. 14 juil., 03:12".
export function formatDateTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('fr-CA', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// Heure seule -> "03:12".
export function formatTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('fr-CA', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

// Clé de journée locale (YYYY-MM-DD) pour regrouper l'historique.
export function dayKey(iso) {
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function formatDayHeading(iso) {
  const d = new Date(iso);
  const today = dayKey(nowISO());
  const yest = dayKey(new Date(Date.now() - 86400000).toISOString());
  const k = dayKey(iso);
  if (k === today) return "Aujourd'hui";
  if (k === yest) return 'Hier';
  return d.toLocaleDateString('fr-CA', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}
