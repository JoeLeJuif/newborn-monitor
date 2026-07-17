// Page principale « KPI » : actions rapides puis tableau de bord complet
// (derniers événements, indicateurs 24 h, tendances et graphiques) sur une
// seule page — plus besoin d'ouvrir une page « Statistiques » distincte.
// Composition uniquement : aucun calcul ici (voir KpiDashboard / stats.js).
import QuickActions from './QuickActions.jsx';
import KpiDashboard from './KpiDashboard.jsx';

export default function Kpi({ navigate }) {
  return (
    <div className="screen">
      <h1 className="page-title">KPI</h1>

      {/* A. Actions rapides — toujours visibles avant les graphiques */}
      <QuickActions navigate={navigate} />

      {/* B/C/D. Derniers événements, KPI 24 h, tendances et graphiques */}
      <KpiDashboard />

      <p className="disclaimer">
        Ces indicateurs servent au suivi quotidien et ne remplacent pas un avis
        médical.
      </p>
    </div>
  );
}
