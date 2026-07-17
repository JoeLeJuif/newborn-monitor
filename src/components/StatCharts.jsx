// Petits graphiques réutilisables en SVG/CSS natifs (aucune dépendance).
// Couleurs via variables CSS -> mode sombre pris en charge automatiquement.

// Anneau de répartition (donut). segments: [{ value, className, ... }].
export function Donut({ segments, ariaLabel }) {
  const total = segments.reduce((a, s) => a + s.value, 0);
  const r = 42;
  const c = 2 * Math.PI * r;
  let offset = 0;
  return (
    <svg viewBox="0 0 100 100" className="donut" role="img" aria-label={ariaLabel}>
      <circle cx="50" cy="50" r={r} className="donut-track" fill="none" strokeWidth="14" />
      {total > 0 &&
        segments.map((s, i) => {
          const dash = (s.value / total) * c;
          const el = (
            <circle
              key={i}
              cx="50"
              cy="50"
              r={r}
              fill="none"
              strokeWidth="14"
              className={`donut-seg ${s.className}`}
              strokeDasharray={`${dash} ${c - dash}`}
              strokeDashoffset={-offset}
              transform="rotate(-90 50 50)"
            />
          );
          offset += dash;
          return el;
        })}
    </svg>
  );
}

// Barre de répartition horizontale empilée. segments: [{ value, className, label }].
export function SplitBar({ segments }) {
  const total = segments.reduce((a, s) => a + s.value, 0);
  if (total <= 0) return null;
  const label = segments
    .map((s) => `${s.label} ${Math.round((s.value / total) * 100)} %`)
    .join(', ');
  return (
    <div className="splitbar" role="img" aria-label={label}>
      {segments.map(
        (s, i) =>
          s.value > 0 && (
            <span
              key={i}
              className={`splitbar-seg ${s.className}`}
              style={{ width: `${(s.value / total) * 100}%` }}
            />
          ),
      )}
    </div>
  );
}

// Barres verticales (tendance 7 jours). data: [{...}], valueKey, labelOf, color, formatValue.
export function MetricBars({ data, valueKey, labelOf, color, formatValue }) {
  const vals = data.map((d) => Number(d[valueKey]) || 0);
  const max = Math.max(1, ...vals);
  return (
    <div className="mbars" role="img" aria-label="Tendance sur 7 jours">
      {data.map((d, i) => (
        <div className="mbar-col" key={i} title={`${labelOf(d)} : ${formatValue(vals[i])}`}>
          <span className="mbar-v">{vals[i] > 0 ? formatValue(vals[i]) : ''}</span>
          <div className="mbar-track">
            <div className={`mbar-fill ${color}`} style={{ height: `${(vals[i] / max) * 100}%` }} />
          </div>
          <span className="mbar-x">{labelOf(d)}</span>
        </div>
      ))}
    </div>
  );
}

// Barres des intervalles récents entre boires. points: [{ gapMs }].
export function IntervalBars({ points, formatGap }) {
  if (!points.length) return null;
  const max = Math.max(1, ...points.map((p) => p.gapMs));
  return (
    <div className="ibars" role="img" aria-label="Évolution des intervalles entre boires">
      {points.map((p, i) => (
        <div className="ibar-col" key={i} title={formatGap(p.gapMs)}>
          <div className="ibar-track">
            <div className="ibar-fill" style={{ height: `${(p.gapMs / max) * 100}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

// Bande horaire 0–24 h (heatmap simple). hours: number[24].
export function Heatmap({ hours }) {
  const max = Math.max(1, ...hours);
  return (
    <div className="heatmap">
      <div className="heat-cells" role="img" aria-label="Activité des boires par heure sur 7 jours">
        {hours.map((n, h) => (
          <span
            key={h}
            className="heat-cell"
            title={`${h} h : ${n} boire${n > 1 ? 's' : ''}`}
            style={{ opacity: n === 0 ? 0.1 : 0.28 + 0.72 * (n / max) }}
          />
        ))}
      </div>
      <div className="heat-axis">
        <span>0 h</span>
        <span>6 h</span>
        <span>12 h</span>
        <span>18 h</span>
        <span>24 h</span>
      </div>
      <div className="heat-legend">
        <span>Moins</span>
        <span className="heat-cell" style={{ opacity: 0.28 }} aria-hidden="true" />
        <span className="heat-cell" style={{ opacity: 0.55 }} aria-hidden="true" />
        <span className="heat-cell" style={{ opacity: 0.85 }} aria-hidden="true" />
        <span>Plus (max {max})</span>
      </div>
    </div>
  );
}
