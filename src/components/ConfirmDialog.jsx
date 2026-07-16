// Dialogue de confirmation (suppression, actions du foyer, etc.).
export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Supprimer',
  onConfirm,
  onCancel,
}) {
  if (!open) return null;
  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="modal-title">{title}</h2>
        {message && <p className="modal-message">{message}</p>}
        <div className="modal-actions">
          <button className="btn btn-ghost" onClick={onCancel}>
            Annuler
          </button>
          <button className="btn btn-danger" onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
