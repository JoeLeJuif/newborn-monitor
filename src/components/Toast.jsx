// Confirmation visuelle éphémère après un enregistrement.
export default function Toast({ message }) {
  if (!message) return null;
  return (
    <div className="toast" role="status" aria-live="polite">
      <span className="toast-check" aria-hidden="true">✓</span>
      {message}
    </div>
  );
}
