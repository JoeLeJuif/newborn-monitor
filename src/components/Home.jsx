// Écran d'accueil : 3 gros boutons + raccourci + tableau de bord.
import { useStore } from '../store/useStore.jsx';
import { dashboardStats } from '../lib/summary.js';
import {
  elapsedSince,
  formatBabyAge,
  formatDuration,
} from '../lib/time.js';
import { sideLabel } from '../lib/constants.js';
import { eventTime } from '../lib/summary.js';

function StatCard({ label, value, sub }) {
  return (
    <div className="stat-card">
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  );
}

const SYNC_BADGE = {
  syncing: { label: 'Synchronisation…', className: 'sync-dot-syncing' },
  synced: { label: 'Synchronisé', className: 'sync-dot-ok' },
  offline: { label: 'Hors ligne', className: 'sync-dot-off' },
  error: { label: 'Erreur de synchro', className: 'sync-dot-error' },
};

export default function Home({ navigate }) {
  const { events, baby, syncConfigured, household, syncStatus } = useStore();
  const s = dashboardStats(events);
  const badge = syncConfigured && household?.id ? SYNC_BADGE[syncStatus] : null;

  return (
    <div className="screen home">
      <header className="home-header">
        <div>
          <h1 className="app-title">{baby.name || 'Mon bébé'}</h1>
          {baby.birth && (
            <p className="app-subtitle">Âge : {formatBabyAge(baby.birth)}</p>
          )}
          {badge && (
            <button
              className="sync-badge"
              onClick={() => navigate('household')}
              aria-label={`Synchronisation : ${badge.label}`}
            >
              <span className={`sync-dot ${badge.className}`} aria-hidden="true" />
              {badge.label}
            </button>
          )}
        </div>
        <button
          className="icon-btn"
          aria-label="Profil du bébé"
          onClick={() => navigate('profile')}
        >
          👶
        </button>
      </header>

      <div className="big-actions">
        <button
          className="big-btn big-feed"
          onClick={() => navigate('feed')}
        >
          <span className="big-emoji" aria-hidden="true">🍼</span>
          Ajouter un boire
        </button>
        <div className="big-row">
          <button
            className="big-btn big-pee"
            onClick={() => navigate('diaper', { preset: 'pee' })}
          >
            <span className="big-emoji" aria-hidden="true">💧</span>
            Pipi
          </button>
          <button
            className="big-btn big-poop"
            onClick={() => navigate('diaper', { preset: 'poop' })}
          >
            <span className="big-emoji" aria-hidden="true">💩</span>
            Caca
          </button>
        </div>
        <button
          className="big-btn big-both"
          onClick={() => navigate('diaper', { preset: 'both' })}
        >
          <span className="big-emoji" aria-hidden="true">💧💩</span>
          Pipi + caca
        </button>
      </div>

      <section className="dashboard">
        <h2 className="section-title">Depuis le dernier…</h2>
        <div className="stat-grid">
          <StatCard
            label="Dernier boire"
            value={elapsedSince(s.lastFeed && eventTime(s.lastFeed))}
          />
          <StatCard
            label="Dernier pipi"
            value={elapsedSince(s.lastPee && eventTime(s.lastPee))}
          />
          <StatCard
            label="Dernier caca"
            value={elapsedSince(s.lastPoop && eventTime(s.lastPoop))}
          />
          <StatCard
            label="Dernier sein"
            value={s.lastSide ? sideLabel(s.lastSide) : '—'}
          />
        </div>

        <h2 className="section-title">Dernières 24 h</h2>
        <div className="stat-grid">
          <StatCard label="Boires" value={s.last24.feeds} />
          <StatCard label="Pipis" value={s.last24.pees} />
          <StatCard label="Cacas" value={s.last24.poops} />
          <StatCard label="Total lait" value={`${s.last24.totalMl} ml`} />
        </div>
        <div className="stat-grid single">
          <StatCard
            label="Temps total au sein (24 h)"
            value={formatDuration(s.last24.breastSec)}
          />
        </div>
      </section>

      <p className="disclaimer">
        Cette application sert à consigner et résumer vos observations. Elle ne
        fournit pas d'avis médical.
      </p>
    </div>
  );
}
