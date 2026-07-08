import { useEffect, useState } from 'react';
import Modal from './Modal.jsx';
import Avatar from './Avatar.jsx';
import Icon from './Icon.jsx';
import { api } from '../api.js';

const WORD = 'supprimer';

/** Quitter / supprimer un serveur, avec les garde-fous :
 *  - membre : taper « supprimer », aucun autre membre n'est notifié du départ ;
 *  - fondateur avec d'autres membres : céder la propriété + taper « supprimer » ;
 *  - fondateur seul : suppression définitive (taper « supprimer »). */
export default function LeaveServerModal({ server, currentUserId, onDone, onClose }) {
  const isOwner = server.owner_id === currentUserId;
  const [members, setMembers] = useState(null); // null = chargement
  const [newOwner, setNewOwner] = useState(null);
  const [word, setWord] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api(`/servers/${server.id}`).then((d) => setMembers(d.members || [])).catch(() => setMembers([]));
  }, [server.id]);

  const count = members ? members.length : (server.member_count ?? 1);
  const alone = count <= 1;
  const others = (members || []).filter((m) => m.id !== currentUserId);
  const mustTransfer = isOwner && !alone;

  const title = isOwner
    ? (alone ? 'Supprimer le serveur' : 'Quitter et céder le serveur')
    : 'Quitter le serveur';
  const confirmLabel = isOwner && alone ? 'Supprimer définitivement' : 'Quitter le serveur';

  async function submit() {
    setError('');
    if (mustTransfer && !newOwner) { setError('Choisissez le membre à qui céder le serveur.'); return; }
    if (word.trim().toLowerCase() !== WORD) { setError(`Pour confirmer, tapez « ${WORD} ».`); return; }
    setBusy(true);
    try {
      if (mustTransfer) await api(`/servers/${server.id}/transfer`, { method: 'POST', body: { userId: newOwner } });
      if (isOwner && alone) await api(`/servers/${server.id}`, { method: 'DELETE' });
      else await api(`/servers/${server.id}/leave`, { method: 'POST' });
      onDone?.();
      onClose();
    } catch (e) { setError(e.message); setBusy(false); }
  }

  return (
    <Modal onClose={onClose} className="modal-leave">
      <h2>{title} « {server.name} »</h2>

      {isOwner && alone && (
        <p className="modal-sub">Vous êtes le dernier membre. Le serveur et tout son contenu seront <strong>supprimés définitivement</strong>. C'est irréversible.</p>
      )}
      {!isOwner && (
        <p className="modal-sub">Vous quittez ce serveur. <strong>Aucun membre ni le fondateur ne sera notifié</strong> de votre départ. Le serveur continue d'exister pour les autres.</p>
      )}
      {mustTransfer && (
        <>
          <p className="modal-sub">En tant que fondateur, vous devez <strong>céder le serveur</strong> à un autre membre avant de partir. Il ne sera pas supprimé.</p>
          <div className="field">
            <label>Céder le serveur à</label>
            <div className="leave-members">
              {members === null && <p className="leave-loading">Chargement des membres…</p>}
              {others.map((m) => (
                <button key={m.id} type="button" className={`leave-member ${newOwner === m.id ? 'sel' : ''}`} onClick={() => setNewOwner(m.id)}>
                  <Avatar user={m} size={28} />
                  <span className="lm-name">{m.display_name}</span>
                  {newOwner === m.id && <Icon name="check" />}
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      <div className="field">
        <label>Pour confirmer, tapez « {WORD} »</label>
        <input value={word} onChange={(e) => setWord(e.target.value)} placeholder={WORD} spellCheck={false} autoFocus />
      </div>

      {error && <div className="error-msg">{error}</div>}

      <div className="modal-actions">
        <button className="btn btn-ghost" onClick={onClose}>Annuler</button>
        <button className="btn btn-danger" onClick={submit} disabled={busy || members === null}>{busy ? '…' : confirmLabel}</button>
      </div>
    </Modal>
  );
}
