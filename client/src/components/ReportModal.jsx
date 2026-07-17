import { useState } from 'react';
import { api } from '../api.js';
import { notify } from '../notice.js';
import Modal from './Modal.jsx';
import Icon from './Icon.jsx';

const REASONS = [
  { value: 'spam', label: 'Spam ou publicité' },
  { value: 'harcèlement', label: 'Harcèlement' },
  { value: 'contenu choquant', label: 'Contenu choquant' },
  { value: 'autre', label: 'Autre' },
];

/**
 * Fenêtre de signalement. « target » : { type: 'message'|'dm'|'user', id }.
 * Le serveur recopie le contenu incriminé : on n'envoie que la raison.
 */
export default function ReportModal({ target, onClose }) {
  const [reason, setReason] = useState('spam');
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    try {
      await api('/reports', { method: 'POST', body: { target_type: target.type, target_id: target.id, reason } });
      notify('Signalement envoyé. Merci, un administrateur va l’examiner.', 'success');
      onClose();
    } catch (e) { notify(e.message); setBusy(false); }
  }

  return (
    <Modal className="report-modal" onClose={onClose}>
      <h2><Icon name="flag" /> Signaler</h2>
      <p className="modal-sub">Aidez-nous à garder Pulsar sain. Un administrateur examinera ce signalement.</p>
      <div className="report-reasons">
        {REASONS.map((r) => (
          <label key={r.value} className={`report-reason ${reason === r.value ? 'active' : ''}`}>
            <input type="radio" name="reason" checked={reason === r.value} onChange={() => setReason(r.value)} />
            <span>{r.label}</span>
          </label>
        ))}
      </div>
      <div className="modal-actions">
        <button className="btn btn-ghost" onClick={onClose}>Annuler</button>
        <button className="btn" disabled={busy} onClick={submit}>{busy ? 'Envoi…' : 'Envoyer le signalement'}</button>
      </div>
    </Modal>
  );
}
