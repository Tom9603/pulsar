import { useState } from 'react';
import Modal from './Modal.jsx';

/** Confirmation stylée (remplace window.confirm).
 *  `requireText` : si fourni, l'utilisateur doit taper ce mot pour confirmer. */
export default function ConfirmModal({ title = 'Confirmer', message, confirmLabel = 'Confirmer', danger, requireText, onConfirm, onClose }) {
  const [text, setText] = useState('');
  const ok = !requireText || text.trim().toLowerCase() === String(requireText).toLowerCase();
  const go = () => { if (ok) { onConfirm(); onClose(); } };
  return (
    <Modal onClose={onClose}>
      <h2>{title}</h2>
      {message && <p className="modal-sub" style={{ marginBottom: requireText ? 14 : 8 }}>{message}</p>}
      {requireText && (
        <input
          className="confirm-text-input" autoFocus value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') go(); }}
          placeholder={`Tapez « ${requireText} » pour confirmer`}
        />
      )}
      <div className="modal-actions">
        <button className="btn btn-ghost" onClick={onClose}>Annuler</button>
        <button className={`btn ${danger ? 'btn-danger' : ''}`} disabled={!ok} onClick={go}>{confirmLabel}</button>
      </div>
    </Modal>
  );
}
