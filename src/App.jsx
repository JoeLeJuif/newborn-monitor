import { useCallback, useEffect, useState } from 'react';
import { StoreProvider, useStore } from './store/useStore.jsx';
import { loadTheme, saveTheme } from './lib/storage.js';
import Home from './components/Home.jsx';
import FeedForm from './components/FeedForm.jsx';
import DiaperForm from './components/DiaperForm.jsx';
import History from './components/History.jsx';
import EventEditor from './components/EventEditor.jsx';
import Kpi from './components/Kpi.jsx';
import BabyProfile from './components/BabyProfile.jsx';
import HouseholdSetup from './components/HouseholdSetup.jsx';
import ExportShare from './components/ExportShare.jsx';
import BottomNav from './components/BottomNav.jsx';
import Toast from './components/Toast.jsx';
import './App.css';

const TAB_VIEWS = ['home', 'history', 'summary', 'export'];
const THEME_ORDER = { auto: 'light', light: 'dark', dark: 'auto' };
const THEME_ICON = { auto: '🌗', light: '☀️', dark: '🌙' };

function App() {
  // Pile de navigation : [{ name, params }]
  const [stack, setStack] = useState([{ name: 'home', params: {} }]);
  const [theme, setTheme] = useState(() => loadTheme());
  const [toast, setToast] = useState('');

  const current = stack[stack.length - 1];

  // Applique le thème sur la racine du document.
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'auto') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', theme);
    saveTheme(theme);
  }, [theme]);

  const navigate = useCallback((name, params = {}) => {
    setStack((s) => {
      // Onglets : on repart de la racine pour éviter d'empiler.
      if (TAB_VIEWS.includes(name)) return [{ name, params }];
      return [...s, { name, params }];
    });
  }, []);

  const goBack = useCallback(() => {
    setStack((s) => (s.length > 1 ? s.slice(0, -1) : [{ name: 'home', params: {} }]));
  }, []);

  const showToast = useCallback((msg) => {
    setToast(msg);
    setTimeout(() => setToast(''), 2200);
  }, []);

  function render() {
    const { name, params } = current;
    switch (name) {
      case 'home':
        return <Home navigate={navigate} />;
      case 'feed':
        return (
          <FeedForm
            navigate={navigate}
            goBack={goBack}
            editId={params.editId}
            onSaved={showToast}
          />
        );
      case 'diaper':
        return (
          <DiaperForm
            goBack={goBack}
            editId={params.editId}
            preset={params.preset}
            onSaved={showToast}
          />
        );
      case 'history':
        return <History navigate={navigate} />;
      case 'event':
        return (
          <EventEditor
            navigate={navigate}
            goBack={goBack}
            id={params.id}
            onSaved={showToast}
          />
        );
      case 'summary':
        return <Kpi navigate={navigate} />;
      case 'profile':
        return <BabyProfile navigate={navigate} goBack={goBack} onSaved={showToast} />;
      case 'household':
        return <HouseholdSetup goBack={goBack} onSaved={showToast} />;
      case 'export':
        return <ExportShare onSaved={showToast} />;
      default:
        return <Home navigate={navigate} />;
    }
  }

  const showNav = TAB_VIEWS.includes(current.name);

  return (
    <div className={`app ${showNav ? 'with-nav' : ''}`}>
      <button
        className="theme-toggle"
        onClick={() => setTheme((t) => THEME_ORDER[t])}
        aria-label="Changer le thème"
        title={`Thème : ${theme}`}
      >
        {THEME_ICON[theme]}
      </button>

      <StorageBanner />
      <main className="app-main">{render()}</main>

      {showNav && <BottomNav current={current.name} navigate={navigate} />}
      <Toast message={toast} />
    </div>
  );
}

// Bannière persistante en cas d'échec de persistance locale (quota, etc.).
function StorageBanner() {
  const { storageError, clearStorageError } = useStore();
  if (!storageError) return null;
  return (
    <div className="storage-banner" role="alert">
      <span>{storageError}</span>
      <button onClick={clearStorageError} aria-label="Fermer">✕</button>
    </div>
  );
}

export default function AppRoot() {
  return (
    <StoreProvider>
      <App />
    </StoreProvider>
  );
}
