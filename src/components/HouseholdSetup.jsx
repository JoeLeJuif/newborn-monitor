// Synchronisation multi-appareils : créer / rejoindre / gérer un foyer,
// sauvegarde et restauration locales. Aucun écran de connexion visible.
import { useRef, useState } from 'react';
import { useStore } from '../store/useStore.jsx';
import { normalizeCode } from '../lib/sync.js';
import { prepareRestore } from '../lib/dataops.js';
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
  // Confirmation explicite avant de téléverser les données locales vers un foyer.
  const [confirmCreate, setConfirmCreate] = useState(false);
  // Import en attente de confirmation : { data, replaceCount } (P1-2).
  const [restorePending, setRestorePending] = useState(null);
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

  // P1-2 + P1-4 : valide le fichier, refuse si invalide (aucune modification),
  // et exige une confirmation + sauvegarde préalable avant de remplacer des
  // données locales existantes.
  function doRestoreBackup(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setError('');
      let data;
      try {
        data = JSON.parse(reader.result);
      } catch {
        setError('Fichier illisible : JSON invalide.');
        return;
      }
      const decision = prepareRestore(data, events.length);
      if (decision.status === 'invalid') {
        setError(decision.error); // rien n'est modifié
        return;
      }
      if (decision.status === 'apply') {
        // Aucune donnée locale à remplacer.
        applyRestore(data);
        return;
      }
      // status 'confirm' : sauvegarde automatique des données actuelles, puis
      // confirmation explicite avant remplacement.
      doExportBackup();
      setRestorePending({ data, replaceCount: decision.replaceCount });
    };
    reader.readAsText(file);
    e.target.value = '';
  }

  function applyRestore(data) {
    try {
      restoreBackup(data);
      onSaved?.('Sauvegarde restaurée');
      setError('');
    } catch (err) {
      setError(err?.message || 'Sauvegarde invalide.');
    }
  }

  // Clic « Créer un foyer » : s'il y a des données locales, on exige une
  // confirmation explicite (avec sauvegarde automatique) avant tout téléversement.
  function onCreateClick() {
    setError('');
    if (hasLocalData) setConfirmCreate(true);
    else onCreate(false);
  }

  // uploadLocal=true : sauvegarde JSON téléchargée d'abord, puis téléversement.
  // Les données locales ne sont jamais effacées.
  async function onCreate(uploadLocal) {
    setConfirmCreate(false);
    if (uploadLocal) doExportBackup(); // sauvegarde auto avant migration
    setBusy(true);
    setError('');
    try {
      await createHousehold(uploadLocal);
      onSaved?.(uploadLocal ? 'Foyer créé, données téléversées' : 'Foyer créé');
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
        <h1>Sauvegarde et migration</h1>
      </header>

      {/* Sauvegarde locale, toujours disponible */}
      <div className="card-section" style={{ marginBottom: 18 }}>
        <label className="field-label">
          Sauvegarde locale — {events.length} événement{events.length > 1 ? 's' : ''} sur cet appareil
        </label>
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
            <p className="help-text">
              {events.length} événement{events.length > 1 ? 's' : ''} sur cet
              appareil. En créant un foyer, une sauvegarde JSON sera téléchargée
              puis ces données seront téléversées. Elles ne seront jamais
              effacées de cet appareil.
            </p>
          )}

          <button
            className="btn btn-primary btn-save"
            onClick={onCreateClick}
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

          {confirmCreate && (
            <div className="modal-backdrop" onClick={() => setConfirmCreate(false)}>
              <div
                className="modal"
                role="dialog"
                aria-modal="true"
                onClick={(e) => e.stopPropagation()}
              >
                <h2 className="modal-title">Créer un foyer et téléverser</h2>
                <p className="modal-message">
                  {`${events.length} événement${events.length > 1 ? 's' : ''} local${events.length > 1 ? 'aux' : ''} trouvé${events.length > 1 ? 's' : ''} sur cet appareil.`}{' '}
                  Une sauvegarde JSON va d'abord être téléchargée, puis les
                  données seront téléversées dans le nouveau foyer. Rien n'est
                  jamais effacé localement.
                </p>
                <div className="export-actions">
                  <button className="btn btn-primary" onClick={() => onCreate(true)}>
                    Sauvegarder et téléverser
                  </button>
                  <button className="btn btn-ghost" onClick={() => onCreate(false)}>
                    Créer sans téléverser
                  </button>
                  <button className="btn btn-ghost" onClick={() => setConfirmCreate(false)}>
                    Annuler
                  </button>
                </div>
              </div>
            </div>
          )}

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

      {restorePending && (
        <div className="modal-backdrop" onClick={() => setRestorePending(null)}>
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="modal-title">Remplacer les données locales ?</h2>
            <p className="modal-message">
              {`Cette restauration va remplacer ${restorePending.replaceCount} événement${restorePending.replaceCount > 1 ? 's' : ''} sur cet appareil.`}{' '}
              Une sauvegarde de tes données actuelles vient d'être téléchargée.
              Les données du foyer (Supabase) ne sont pas supprimées.
            </p>
            <div className="export-actions">
              <button
                className="btn btn-danger"
                onClick={() => {
                  const pending = restorePending;
                  setRestorePending(null);
                  applyRestore(pending.data);
                }}
              >
                Remplacer maintenant
              </button>
              <button className="btn btn-ghost" onClick={() => setRestorePending(null)}>
                Annuler
              </button>
            </div>
          </div>
        </div>
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
