import { useEffect, useState } from 'react';
import Modal from './Modal.jsx';
import Icon from './Icon.jsx';
import { listScheduled, scheduleMessage, cancelScheduled } from '../scheduled.js';

// Formate une Date au format attendu par un champ « datetime-local » (heure locale).
const toLocalInput = (d) => {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

// Affichage lisible d'une date programmée.
const fmt = (sec) => new Date(sec * 1000).toLocaleString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });

// Raccourcis proposés à l'utilisateur.
function presets() {
  const now = new Date();
  const inHour = new Date(now.getTime() + 3600 * 1000);
  const tomorrow9 = new Date(now); tomorrow9.setDate(now.getDate() + 1); tomorrow9.setHours(9, 0, 0, 0);
  const monday9 = new Date(now); monday9.setHours(9, 0, 0, 0);
  monday9.setDate(monday9.getDate() + (((8 - now.getDay()) % 7) || 7)); // prochain lundi
  return [
    { label: 'Dans 1 heure', d: inHour },
    { label: 'Demain 9 h', d: tomorrow9 },
    { label: 'Lundi 9 h', d: monday9 },
  ];
}

/**
 * Programmer un message pour plus tard, et gérer ceux en attente pour cette conversation.
 * - scope       : { channelId } (salon) ou { toUserId } (message privé)
 * - draft       : texte actuellement saisi dans la zone de message
 * - onScheduled : appelé après une programmation réussie (vide la saisie, ferme)
 */
export default function ScheduleModal({ scope, draft, onScheduled, onClose }) {
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState([]);

  const text = (draft || '').trim();
  const minValue = toLocalInput(new Date(Date.now() + 60 * 1000)); // au moins 1 min plus tard

  async function reload() {
    try {
      const { items } = await listScheduled();
      setPending(items.filter((i) => (scope.channelId ? i.channel_id === scope.channelId : i.recipient_id === scope.toUserId)));
    } catch { /* liste indisponible : on n'affiche rien */ }
  }
  useEffect(() => { reload(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function confirm() {
    setError('');
    if (!text) { setError('Écrivez d’abord votre message, puis programmez-le.'); return; }
    const sendAt = value ? Math.floor(new Date(value).getTime() / 1000) : NaN;
    if (!Number.isFinite(sendAt) || sendAt * 1000 <= Date.now()) { setError('Choisissez une date et une heure à venir.'); return; }
    setBusy(true);
    try {
      await scheduleMessage({ ...scope, content: text, sendAt });
      onScheduled();
    } catch (e) { setError(e.message); setBusy(false); }
  }

  async function cancel(id) {
    setPending((p) => p.filter((i) => i.id !== id)); // retrait optimiste
    try { await cancelScheduled(id); } catch { reload(); }
  }

  return (
    <Modal onClose={onClose} className="modal-schedule">
      <h2><Icon name="clock" /> Programmer un message</h2>
      <p className="modal-sub">Le message sera envoyé automatiquement à l’heure choisie, même si vous êtes déconnecté.</p>

      {error && <div className="error-msg">{error}</div>}

      {text ? (
        <div className="sched-preview">« {text.length > 140 ? text.slice(0, 140) + '…' : text} »</div>
      ) : (
        <div className="sched-hint">Écrivez votre message dans la zone de saisie, puis rouvrez cette fenêtre pour le programmer.</div>
      )}

      {text && (
        <>
          <div className="field">
            <label>Quand l’envoyer&nbsp;?</label>
            <div className="sched-presets">
              {presets().map((p) => (
                <button type="button" key={p.label} className={`sched-preset ${value === toLocalInput(p.d) ? 'active' : ''}`} onClick={() => setValue(toLocalInput(p.d))}>{p.label}</button>
              ))}
            </div>
            <input type="datetime-local" value={value} min={minValue} onChange={(e) => setValue(e.target.value)} />
          </div>

          <div className="modal-actions">
            <button className="btn btn-ghost" onClick={onClose}>Annuler</button>
            <button className="btn" onClick={confirm} disabled={busy}>{busy ? 'Programmation…' : 'Programmer'}</button>
          </div>
        </>
      )}

      {pending.length > 0 && (
        <div className="sched-list">
          <div className="sched-list-title">En attente d’envoi</div>
          {pending.map((i) => (
            <div className="sched-item" key={i.id}>
              <div className="sched-item-main">
                <span className="sched-item-when"><Icon name="clock" /> {fmt(i.send_at)}</span>
                <span className="sched-item-text">{i.content}</span>
              </div>
              <button type="button" className="sched-item-cancel" title="Annuler l’envoi" onClick={() => cancel(i.id)}><Icon name="xmark" /></button>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}
