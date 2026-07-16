// Synchronisation multi-appareils : créer / rejoindre / gérer un foyer,
// sauvegarde et restauration locales. Aucun écran de connexion visible.
import { useRef, useState } from 'react';
import { useStore } from '../store/useStore.jsx';
import { normalizeCode } from '../lib/sync.js';
import { downloadFile } from '../lib/export.js';
import ConfirmDialog from './ConfirmDialog.jsx';

const STATUS_LABEL = {
  off: 'Synchro désactivée',
  syncing: 'Synchronisation…',
  synced: 'Synchronisé',
  offline: 'Hors ligne',
  error: 'Erreur de synchronisation',
};

export default function HouseholdSetup({ goBack, onSaved }) {
  const {
    events,
    syncConfigured,
    household,
    syncStatus,
    createHousehold,
    joinHousehold,
    leaveHousehold,
    regenerateCode,
    revokeCode,
    resync,
    exportBackup,
    restoreBackup,
  } = useStore();
  const [codeInput, setCodeInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [uploadLocal, setUploadLocal] = useState(true);
  // Choix demandé quand un appareil avec des données rejoint un foyer.
  const [joinChoice, setJoinChoice] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [confirmRegen, setConfirmRegen] = useState(false);
  const [confirmRevoke, setConfirmRevoke] = useState(false);
  const fileRef = useRef(null);

  const hasLocalData = events.length > 0;

  function fileStamp() {
    return new Date().toISOString().slice(0, 10);
  }

  function doExportBackup() {
    downloadFile(
      `newborn-monitor-sauvegarde-${fileStamp()}.json`,
      JSON.stringify(exportBackup(), null, 2),
      'application/json;charset=utf-8',
    );
    onSaved?.('Sauvegarde exportée');
  }

  function doRestoreBackup(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        restoreBackup(JSON.parse(reader.result));
        onSaved?.('Sauvegarde restaurée');
        setError('');
      } catch {
        setError('Fichier de sauvegarde invalide.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  }

  async function onCreate() {
    setBusy(true);
    setError('');
    try {
      await createHousehold(uploadLocal);
      onSaved?.('Foyer créé');
    } catch {
      setError('Impossible de créer le foyer. Vérifie ta connexion.');
    } finally {
      setBusy(false);
    }
  }

  function onJoinClick() {
    if (!normalizeCode(codeInput)) return;
    setError('');
    if (hasLocalData) setJoinChoice(true);
    else doJoin('merge');
  }

  async function doJoin(strategy) {
    setJoinChoice(false);
    setBusy(true);
    setError('');
    try {
      const ok = await joinHousehold(codeInput, strategy);
      if (ok) onSaved?.('Foyer rejoint');
      else setError('Code introuvable ou révoqué.');
    } catch {
      setError('Connexion impossible. Vérifie ta connexion.');
    } finally {
      setBusy(false);
    }
  }

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(household.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  }

  async function shareCode() {
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Newborn Monitor',
          text: `Code du foyer Newborn Monitor : ${household.code}`,
        });
        return;
      } catch {
        /* partage annulé */
      }
    }
    copyCode();
  }

  async function doRegenerate() {
    setConfirmRegen(false);
    setBusy(true);
    try {
      await regenerateCode();
      onSaved?.('Nouveau code généré');
    } catch {
      setError('Impossible de régénérer le code.');
    } finally {
      setBusy(false);
    }
  }

  async function doRevoke() {
    setConfirmRevoke(false);
    setBusy(true);
    try {
      await revokeCode();
      onSaved?.('Code révoqué');
    } catch {
      setError('Impossible de révoquer le code.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="screen form-screen">
      <header className="form-header">
        <button className="back-btn" onClick={goBack} aria-label="Retour">‹</button>
        <h1>Synchronisation</h1>
      </header>

      {/* Sauvegarde locale, toujours disponible */}
      <div className="card-section" style={{ marginBottom: 18 }}>
        <label className="field-label">Sauvegarde locale</label>
        <div className="export-actions">
          <button className="btn btn-secondary" onClick={doExportBackup}>
            ⬇ Exporter une sauvegarde (JSON)
          </button>
          <button
            className="btn btn-ghost"
            onClick={() => fileRef.current?.click()}
          >
            Restaurer une sauvegarde…
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json"
            hidden
            onChange={doRestoreBackup}
          />
        </div>
      </div>

      {!syncConfigured ? (
        <div className="card-section">
          <p className="help-text">
            La synchronisation multi-appareils n'est pas configurée sur cette
            version. L'application fonctionne normalement sur cet appareil et
            les données restent enregistrées localement.
          </p>
        </div>
      ) : household?.id ? (
        <>
          <div className="card-section" style={{ marginBottom: 18 }}>
            <label className="field-label">Statut</label>
            <p className="sync-status">{STATUS_LABEL[syncStatus] || syncStatus}</p>
          </div>

          <div className="field">
            <label className="field-label">Code d'invitation du foyer</label>
            {household.code ? (
              <>
                <p className="help-text">
                  Partage ce code avec l'autre parent : sur son appareil,
                  « Rejoindre un foyer » puis entrer ce code. Garde-le privé.
                </p>
                <code className="household-code">{household.code}</code>
              </>
            ) : (
              <p className="help-text">
                Aucun code actif sur cet appareil. Régénère un code pour
                inviter un autre appareil.
              </p>
            )}
            <div className="export-actions">
              {household.code && (
                <>
                  <button className="btn btn-primary" onClick={shareCode}>
                    📤 Partager le code
                  </button>
                  <button className="btn btn-secondary" onClick={copyCode}>
                    {copied ? '✓ Copié' : '📋 Copier le code'}
                  </button>
                </>
              )}
              <button className="btn btn-secondary" onClick={resync} disabled={busy}>
                ↻ Synchroniser maintenant
              </button>
              <button
                className="btn btn-ghost"
                onClick={() => setConfirmRegen(true)}
                disabled={busy}
              >
                Régénérer le code d'invitation
              </button>
              {household.code && (
                <button
                  className="btn btn-ghost"
                  onClick={() => setConfirmRevoke(true)}
                  disabled={busy}
                >
                  Révoquer le code d'invitation
                </button>
              )}
              <button
                className="btn btn-ghost"
                onClick={() => setConfirmLeave(true)}
              >
                Quitter le foyer (garde les données locales)
              </button>
            </div>
          </div>
        </>
      ) : (
        <>
          <div className="card-section" style={{ marginBottom: 18 }}>
            <p className="help-text">
              Synchronise les données entre plusieurs appareils grâce à un code
              de foyer (ex. NBM7-K4PX-W9QF). Aucun compte requis.
            </p>
          </div>

          {hasLocalData && (
            <label className="toggle-row">
              <input
                type="checkbox"
                checked={uploadLocal}
                onChange={(e) => setUploadLocal(e.target.checked)}
              />
              <span>
                Téléverser les données de cet appareil dans le foyer
                (recommandé)
              </span>
            </label>
          )}

          <button
            className="btn btn-primary btn-save"
            onClick={onCreate}
            disabled={busy}
          >
            ➕ Créer un foyer
          </button>

          <div className="field" style={{ marginTop: 24 }}>
            <label className="field-label">Rejoindre un foyer existant</label>
            <input
              className="text-input"
              type="text"
              placeholder="Code du foyer (ex. NBM7-K4PX-W9QF)"
              value={codeInput}
              onChange={(e) => setCodeInput(e.target.value)}
              autoCapitalize="characters"
            />
            <button
              className="btn btn-secondary"
              onClick={onJoinClick}
              disabled={busy || !normalizeCode(codeInput)}
              style={{ marginTop: 10 }}
            >
              Rejoindre
            </button>
          </div>

          {joinChoice && (
            <div className="modal-backdrop" onClick={() => setJoinChoice(false)}>
              <div
                className="modal"
                role="dialog"
                aria-modal="true"
                onClick={(e) => e.stopPropagation()}
              >
                <h2 className="modal-title">Cet appareil contient déjà des données</h2>
                <p className="modal-message">
                  Que faire des {events.length} événements locaux en rejoignant
                  ce foyer ?
                </p>
                <div className="export-actions">
                  <button className="btn btn-primary" onClick={() => doJoin('merge')}>
                    Fusionner (recommandé)
                  </button>
                  <button className="btn btn-danger" onClick={() => doJoin('replace')}>
                    Remplacer les données locales
                  </button>
                  <button className="btn btn-ghost" onClick={() => setJoinChoice(false)}>
                    Annuler
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {error && <p className="form-error">{error}</p>}

      <ConfirmDialog
        open={confirmLeave}
        title="Quitter le foyer ?"
        message="Les données restent sur cet appareil, mais ne seront plus synchronisées."
        confirmLabel="Quitter"
        onConfirm={() => {
          setConfirmLeave(false);
          leaveHousehold();
          onSaved?.('Foyer quitté');
        }}
        onCancel={() => setConfirmLeave(false)}
      />
      <ConfirmDialog
        open={confirmRegen}
        title="Régénérer le code ?"
        message="L'ancien code ne fonctionnera plus. Les appareils déjà membres restent connectés."
        confirmLabel="Régénérer"
        onConfirm={doRegenerate}
        onCancel={() => setConfirmRegen(false)}
      />
      <ConfirmDialog
        open={confirmRevoke}
        title="Révoquer le code ?"
        message="Plus personne ne pourra rejoindre le foyer avec ce code. Les membres actuels restent connectés."
        confirmLabel="Révoquer"
        onConfirm={doRevoke}
        onCancel={() => setConfirmRevoke(false)}
      />
    </div>
  );
}
