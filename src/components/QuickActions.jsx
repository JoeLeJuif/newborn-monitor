// Actions rapides : enregistrer un boire, un pipi ou une selle.
// JSX partagé entre l'accueil et la page KPI (source unique, pas de doublon).
export default function QuickActions({ navigate }) {
  return (
    <div className="big-actions">
      <button className="big-btn big-feed" onClick={() => navigate('feed')}>
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
  );
}
