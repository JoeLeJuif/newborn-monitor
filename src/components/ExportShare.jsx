// Export / partage d'un résumé des dernières 24 h (texte ou CSV).
import { useState } from 'react';
import { useStore } from '../store/useStore.jsx';
import { buildTextSummary, buildCSV, downloadFile } from '../lib/export.js';

export default function ExportShare({ onSaved }) {
  const { events, baby } = useStore();
  const [copied, setCopied] = useState(false);
  const text = buildTextSummary(events, baby, 24);

  async function share() {
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Suivi du nouveau-né', text });
        return;
      } catch {
        // partage annulé — on ne fait rien
      }
    }
    copy();
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      onSaved?.('Résumé copié');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      onSaved?.('Copie impossible');
    }
  }

  function fileStamp() {
    return new Date().toISOString().slice(0, 10);
  }

  return (
    <div className="screen">
      <h1 className="page-title">Exporter / partager</h1>
      <p className="help-text">
        Résumé des dernières 24 h, à partager avec une infirmière, un médecin,
        une consultante en allaitement ou l'autre parent.
      </p>

      <div className="export-actions">
        <button className="btn btn-primary" onClick={share}>
          📤 Partager le résumé
        </button>
        <button className="btn btn-secondary" onClick={copy}>
          {copied ? '✓ Copié' : '📋 Copier le texte'}
        </button>
        <button
          className="btn btn-secondary"
          onClick={() =>
            downloadFile(
              `suivi-bebe-${fileStamp()}.txt`,
              text,
              'text/plain;charset=utf-8',
            )
          }
        >
          ⬇ Télécharger (.txt)
        </button>
        <button
          className="btn btn-secondary"
          onClick={() =>
            downloadFile(
              `suivi-bebe-${fileStamp()}.csv`,
              buildCSV(events, 24),
              'text/csv;charset=utf-8',
            )
          }
        >
          ⬇ Télécharger (.csv)
        </button>
      </div>

      <label className="field-label">Aperçu</label>
      <pre className="export-preview">{text}</pre>
    </div>
  );
}
