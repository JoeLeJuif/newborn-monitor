// Barre de navigation inférieure (pouce, une main).
const TABS = [
  { view: 'home', label: 'Accueil', icon: '🏠' },
  { view: 'history', label: 'Historique', icon: '📋' },
  { view: 'summary', label: 'Résumé', icon: '📊' },
  { view: 'export', label: 'Partager', icon: '📤' },
];

export default function BottomNav({ current, navigate }) {
  return (
    <nav className="bottom-nav">
      {TABS.map((t) => (
        <button
          key={t.view}
          className={`nav-btn ${current === t.view ? 'nav-active' : ''}`}
          onClick={() => navigate(t.view)}
          aria-current={current === t.view ? 'page' : undefined}
        >
          <span className="nav-icon" aria-hidden="true">{t.icon}</span>
          <span className="nav-label">{t.label}</span>
        </button>
      ))}
    </nav>
  );
}
