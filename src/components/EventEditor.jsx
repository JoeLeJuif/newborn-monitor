// Détail d'un événement : consulter, modifier ou supprimer (avec confirmation).
import { useState } from 'react';
import { useStore } from '../store/useStore.jsx';
import ConfirmDialog from './ConfirmDialog.jsx';
import { formatDateTime, formatDuration } from '../lib/time.js';
import {
  feedTypeLabel,
  feedTypeMeta,
  amountLabel,
  poopColorLabel,
  poopTextureLabel,
  sideLabel,
} from '../lib/constants.js';

function Row({ label, value }) {
  if (value == null || value === '') return null;
  return (
    <div className="detail-row">
      <span className="detail-label">{label}</span>
      <span className="detail-value">{value}</span>
    </div>
  );
}

export default function EventEditor({ navigate, goBack, id, onSaved }) {
  const { getEvent, deleteEvent } = useStore();
  const [confirm, setConfirm] = useState(false);
  const e = getEvent(id);

  if (!e) {
    return (
      <div className="screen form-screen">
        <header className="form-header">
          <button className="back-btn" onClick={goBack} aria-label="Retour">‹</button>
          <h1>Événement</h1>
        </header>
        <p className="empty">Événement introuvable.</p>
      </div>
    );
  }

  function doDelete() {
    deleteEvent(id);
    onSaved?.('Événement supprimé');
    goBack();
  }

  function edit() {
    if (e.type === 'feed') navigate('feed', { editId: id });
    else navigate('diaper', { editId: id });
  }

  const isFeed = e.type === 'feed';

  return (
    <div className="screen form-screen">
      <header className="form-header">
        <button className="back-btn" onClick={goBack} aria-label="Retour">‹</button>
        <h1>{isFeed ? 'Détail du boire' : 'Détail de la couche'}</h1>
      </header>

      <div className="detail-card">
        {isFeed ? (
          <>
            <Row label="Type" value={feedTypeLabel(e.feedType)} />
            <Row label="Début" value={formatDateTime(e.start)} />
            {feedTypeMeta(e.feedType).breast && (
              <>
                <Row label="Durée" value={formatDuration(e.durationSec)} />
                <Row label="Dernier sein" value={sideLabel(e.lastSide)} />
              </>
            )}
            {e.amountMl != null && <Row label="Quantité" value={`${e.amountMl} ml`} />}
            {e.inProgress && <Row label="État" value="En cours" />}
          </>
        ) : (
          <>
            <Row
              label="Type"
              value={e.pee && e.poop ? 'Pipi + caca' : e.pee ? 'Pipi' : 'Caca'}
            />
            <Row label="Heure" value={formatDateTime(e.time)} />
            {e.pee && <Row label="Quantité (pipi)" value={amountLabel(e.peeAmount)} />}
            {e.poop && (
              <>
                <Row label="Quantité (caca)" value={amountLabel(e.poopAmount)} />
                <Row label="Couleur" value={poopColorLabel(e.poopColor)} />
                <Row label="Texture" value={poopTextureLabel(e.poopTexture)} />
              </>
            )}
          </>
        )}
        <Row label="Note" value={e.note} />
      </div>

      <div className="editor-actions">
        <button className="btn btn-primary" onClick={edit}>
          ✎ Modifier
        </button>
        <button className="btn btn-danger" onClick={() => setConfirm(true)}>
          🗑 Supprimer
        </button>
      </div>

      <ConfirmDialog
        open={confirm}
        title="Supprimer cet événement ?"
        message="Cette action est définitive."
        onConfirm={doDelete}
        onCancel={() => setConfirm(false)}
      />
    </div>
  );
}
