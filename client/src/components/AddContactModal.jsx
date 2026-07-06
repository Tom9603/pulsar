import { useState } from 'react';
import Modal from './Modal.jsx';
import Avatar from './Avatar.jsx';
import { api } from '../api.js';

/** Sur-modale : envoyer une demande de contact avec un message d'accompagnement. */
export default function AddContactModal({ target, onClose, onSent }) {
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function send() {
    setBusy(true); setError('');
    try {
      await api('/friends/request', { method: 'POST', body: { username: target.username, message: message.trim() } });
      onSent?.();
      onClose();
    } catch (e) { setError(e.message); setBusy(false); }
  }

  return (
    <Modal onClose={onClose}>
      <div className="profile-preview">
        <Avatar user={target} size={48} />
        <div>
          <div style={{ fontWeight: 700 }}>Ajouter {target.display_name}</div>
          <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>@{target.username}</div>
        </div>
      </div>
      {error && <div className="error-msg">{error}</div>}
      <div className="field">
        <label>Message d’accompagnement (optionnel)</label>
        <textarea rows={3} maxLength={300} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Bonjour, je souhaiterais vous ajouter à mes contacts…" />
      </div>
      <div className="modal-actions">
        <button className="btn btn-ghost" onClick={onClose}>Annuler</button>
        <button className="btn" onClick={send} disabled={busy}>{busy ? 'Envoi…' : 'Envoyer la demande'}</button>
      </div>
    </Modal>
  );
}
