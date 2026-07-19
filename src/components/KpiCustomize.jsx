// Panneau de personnalisation du tableau de bord KPI.
//
// Toute la logique de disposition (ordre, favoris, masquage, garde-fous) vit
// dans des fonctions PURES et testées (kpiRegistry.js / kpiPrefs.js). Ce
// composant ne fait que présenter ces opérations et déléguer aux callbacks du
// parent — il ne calcule pas de statistique et ne persiste rien lui-même.
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { KPI_TILES, KPI_SECTIONS, applyOrder, canMove, visibleCount, titleFor } from '../lib/kpiRegistry.js';

// Un id est masquable tant qu'il reste au moins un autre élément visible :
// on ne permet jamais de tout masquer d'un coup.
function canHide(prefs, id) {
  if ((prefs.hiddenCards || []).includes(id)) return true; // ré-afficher : toujours permis
  return visibleCount(prefs.hiddenCards) > 1;
}

function Row({ entry, label, group, prefs, ops, onBlockedHide }) {
  const hidden = (prefs.hiddenCards || []).includes(entry.id);
  const favorite = (prefs.favorites || []).includes(entry.id);
  const list = group === 'tiles' ? KPI_TILES : KPI_SECTIONS;
  const upOk = canMove(list, prefs.order, prefs.favorites, entry.id, -1);
  const downOk = canMove(list, prefs.order, prefs.favorites, entry.id, +1);

  return (
    <li className={`cz-row ${hidden ? 'cz-hidden' : ''}`}>
      <span className="cz-title">
        {favorite && <span className="cz-fav-dot" aria-hidden="true">★</span>}
        {label}
      </span>
      <div className="cz-controls">
        <button
          type="button"
          className={`cz-btn ${favorite ? 'cz-btn-on' : ''}`}
          aria-pressed={favorite}
          aria-label={`${favorite ? 'Retirer' : 'Ajouter'} ${label} ${favorite ? 'des' : 'aux'} favoris`}
          onClick={() => ops.onToggleFavorite(entry.id)}
        >
          <span aria-hidden="true">{favorite ? '★' : '☆'}</span>
        </button>
        <button
          type="button"
          className="cz-btn"
          disabled={!upOk}
          aria-label={`Monter ${label}`}
          onClick={() => ops.onMove(group, entry.id, -1)}
        >
          <span aria-hidden="true">↑</span>
        </button>
        <button
          type="button"
          className="cz-btn"
          disabled={!downOk}
          aria-label={`Descendre ${label}`}
          onClick={() => ops.onMove(group, entry.id, +1)}
        >
          <span aria-hidden="true">↓</span>
        </button>
        <button
          type="button"
          className="cz-btn cz-btn-text"
          aria-pressed={hidden}
          aria-label={`${hidden ? 'Afficher' : 'Masquer'} ${label}`}
          onClick={() => {
            if (!hidden && !canHide(prefs, entry.id)) {
              onBlockedHide();
              return;
            }
            ops.onToggleHidden(entry.id);
          }}
        >
          {hidden ? 'Afficher' : 'Masquer'}
        </button>
      </div>
    </li>
  );
}

export default function KpiCustomize({ open, onClose, prefs, periodLabel, ops, savedMessage }) {
  const dialogRef = useRef(null);
  const [blocked, setBlocked] = useState('');
  const [confirmReset, setConfirmReset] = useState(false);

  // Focus initial + piège de focus + Échap. Rétabli à la fermeture.
  useEffect(() => {
    if (!open) return undefined;
    const node = dialogRef.current;
    const first = node?.querySelector('.cz-close');
    first?.focus();
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;
      const focusables = node.querySelectorAll(
        'button:not([disabled]), [href], input, [tabindex]:not([tabindex="-1"])',
      );
      if (!focusables.length) return;
      const list = Array.from(focusables);
      const firstEl = list[0];
      const lastEl = list[list.length - 1];
      if (e.shiftKey && document.activeElement === firstEl) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && document.activeElement === lastEl) {
        e.preventDefault();
        firstEl.focus();
      }
    };
    node.addEventListener('keydown', onKey);
    return () => node.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!blocked) return undefined;
    const id = setTimeout(() => setBlocked(''), 4000);
    return () => clearTimeout(id);
  }, [blocked]);

  if (!open) return null;

  // Les lignes suivent l'ordre RÉELLEMENT affiché (ordre personnalisé + favoris
  // en tête), pour que Monter / Descendre déplacent visiblement l'élément dans
  // le panneau comme sur le tableau de bord.
  const groups = [
    {
      key: 'tiles',
      title: 'Cartes résumé',
      entries: applyOrder(KPI_TILES, prefs.order, prefs.favorites),
      label: (e) => e.label,
    },
    {
      key: 'sections',
      title: 'Sections',
      entries: applyOrder(KPI_SECTIONS, prefs.order, prefs.favorites),
      label: (e) => titleFor(e, periodLabel),
    },
  ];

  // Portail sur <body> : le panneau échappe ainsi au conteneur transformé
  // `.screen` (animation fade), qui sinon « capturerait » le backdrop en
  // position: fixed et le centrerait dans le document au lieu du viewport.
  return createPortal(
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal customize-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cz-title"
        ref={dialogRef}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="cz-head">
          <h2 className="modal-title" id="cz-title">Personnaliser l'affichage</h2>
          <button type="button" className="cz-close" aria-label="Fermer" onClick={onClose}>
            ✕
          </button>
        </div>

        <p className="cz-hint">
          Affiche, masque, réordonne ou épingle les éléments. Les réglages
          restent sur cet appareil.
        </p>

        {/* Confirmation d'enregistrement, temporisée par le parent pour ne pas
            se répéter à chaque clic. */}
        <p className="cz-saved" role="status" aria-live="polite">{savedMessage || ''}</p>

        {blocked && (
          <p className="cz-blocked" role="status">{blocked}</p>
        )}

        {groups.map((g) => (
          <section key={g.key} className="cz-group" aria-label={g.title}>
            <h3 className="cz-group-title">{g.title}</h3>
            <ul className="cz-list">
              {g.entries.map((entry) => (
                <Row
                  key={entry.id}
                  entry={entry}
                  label={g.label(entry)}
                  group={g.key}
                  prefs={prefs}
                  ops={ops}
                  onBlockedHide={() => setBlocked('Au moins un élément doit rester affiché.')}
                />
              ))}
            </ul>
          </section>
        ))}

        <div className="cz-footer">
          {confirmReset ? (
            <div className="cz-confirm" role="group" aria-label="Confirmer la réinitialisation">
              <span>Restaurer l'affichage par défaut ?</span>
              <div className="cz-confirm-actions">
                <button type="button" className="btn btn-ghost" onClick={() => setConfirmReset(false)}>
                  Annuler
                </button>
                <button
                  type="button"
                  className="btn"
                  onClick={() => {
                    ops.onReset();
                    setConfirmReset(false);
                  }}
                >
                  Restaurer
                </button>
              </div>
            </div>
          ) : (
            <button type="button" className="btn btn-ghost cz-reset" onClick={() => setConfirmReset(true)}>
              Restaurer l'affichage par défaut
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
