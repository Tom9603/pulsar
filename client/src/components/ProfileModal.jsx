import { useEffect, useState } from 'react';
import Modal from './Modal.jsx';
import Avatar from './Avatar.jsx';
import Icon from './Icon.jsx';
import { ProCard } from './MemberModal.jsx';
import { api } from '../api.js';

/** Fiche de profil affichée en modale (au clic sur un nom dans une conversation). */
export default function ProfileModal({ userId, currentUserId, onClose, onMessage, onEditProfile }) {
  const [u, setU] = useState(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    let cancelled = false;
    api(`/users/${userId}`).then(({ user }) => { if (!cancelled) setU(user); }).catch((e) => setErr(e.message));
    return () => { cancelled = true; };
  }, [userId]);

  const self = u && u.id === currentUserId;

  return (
    <Modal onClose={onClose}>
      {err && <div className="error-msg">{err}</div>}
      {!u && !err && <p className="modal-sub">Chargement du profil…</p>}
      {u && (
        <>
          <div className="profile-preview">
            <Avatar user={u} size={64} status={u.status} />
            <div>
              <div style={{ fontWeight: 700, fontSize: 18 }}>{u.display_name}</div>
              <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>@{u.username}</div>
              {u.headline && <div style={{ color: 'var(--accent)', fontSize: 13, marginTop: 2 }}>{u.headline}</div>}
            </div>
          </div>

          <ProCard u={u} />

          {u.about && (
            <div className="field">
              <label>À propos</label>
              <p style={{ fontSize: 14, color: 'var(--text)' }}>{u.about}</p>
            </div>
          )}

          <div className="modal-actions">
            <button className="btn btn-ghost" onClick={onClose}>Fermer</button>
            {self ? (
              <button className="btn" style={{ width: 'auto', padding: '8px 16px' }} onClick={() => { onEditProfile?.(); onClose(); }}>
                <Icon name="pen" /> Modifier mon profil
              </button>
            ) : (
              <button className="btn" style={{ width: 'auto', padding: '8px 16px' }} onClick={() => { onMessage?.(u); onClose(); }}>
                <Icon name="message" /> Message privé
              </button>
            )}
          </div>
        </>
      )}
    </Modal>
  );
}
