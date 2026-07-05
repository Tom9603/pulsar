import { useState } from 'react';
import Modal from './Modal.jsx';
import Avatar from './Avatar.jsx';
import { api } from '../api.js';

/** Gérer qui a accès à un espace client (salon privé). */
export default function ChannelAccessModal({ channel, members, serverId, ownerId, onClose, onChanged }) {
  const [ids, setIds] = useState(new Set(channel.member_ids || []));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function toggle(m) {
    setBusy(true); setError('');
    const has = ids.has(m.id);
    try {
      if (has) await api(`/servers/${serverId}/channels/${channel.id}/members/${m.id}`, { method: 'DELETE' });
      else await api(`/servers/${serverId}/channels/${channel.id}/members`, { method: 'POST', body: { userId: m.id } });
      setIds((prev) => { const n = new Set(prev); has ? n.delete(m.id) : n.add(m.id); return n; });
      onChanged?.();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  return (
    <Modal onClose={onClose}>
      <h2>Accès à 🔒 {channel.name}</h2>
      <p className="modal-sub">Seules les personnes cochées voient ce salon. Idéal pour inviter un client sur son projet sans lui ouvrir le reste.</p>
      {error && <div className="error-msg">{error}</div>}
      <div className="access-list">
        {members.map((m) => {
          const isOwnerMember = m.id === ownerId;
          const checked = ids.has(m.id) || isOwnerMember;
          return (
            <label key={m.id} className="access-row">
              <input type="checkbox" checked={checked} disabled={busy || isOwnerMember} onChange={() => toggle(m)} />
              <Avatar user={m} size={28} />
              <span className="access-name">{m.display_name}{isOwnerMember && ' 👑'}</span>
            </label>
          );
        })}
      </div>
      <div className="modal-actions">
        <button className="btn" onClick={onClose}>Terminé</button>
      </div>
    </Modal>
  );
}
