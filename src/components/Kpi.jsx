// Page principale « KPI » : page d'analyse (pas d'action). Le tableau de bord
// complet (derniers événements, indicateurs 24 h, tendances, graphiques,
// observations) commence directement sous le titre. Les actions rapides restent
// sur l'Accueil (QuickActions), non dupliquées ici.
// Composition uniquement : aucun calcul ici (voir KpiDashboard / stats.js).
import KpiDashboard from './KpiDashboard.jsx';

export default function Kpi() {
  return (
    <div className="screen">
      <h1 className="page-title">KPI</h1>

      {/* Derniers événements, KPI 24 h, tendances et graphiques, observations */}
      <KpiDashboard />

      <p className="disclaimer">
        Ces indicateurs servent au suivi quotidien et ne remplacent pas un avis
        médical.
      </p>
    </div>
  );
}
