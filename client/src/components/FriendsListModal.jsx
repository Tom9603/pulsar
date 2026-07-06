import { useEffect, useState } from 'react';
import Modal from './Modal.jsx';
import Avatar from './Avatar.jsx';
import { api } from '../api.js';

/** Liste (scrollable) des contacts d'un utilisateur. Clic sur un contact → son profil. */
export default function FriendsListModal({ userId, title = 'Contacts', onOpenProfile, onClose }) {
  const [contacts, setContacts] = useState(null);

  useEffect(() => {
    api(`/users/${userId}/contacts`).then(({ contacts }) => setContacts(contacts)).catch(() => setContacts([]));
  }, [userId]);

  return (
    <Modal onClose={onClose}>
      <h2>{title}{contacts ? ` · ${contacts.length}` : ''}</h2>
      <div className="access-list" style={{ maxHeight: '52vh' }}>
        {contacts === null && <div className="contact-empty">Chargement…</div>}
        {contacts && contacts.length === 0 && <div className="contact-empty">Aucun contact à afficher.</div>}
        {contacts && contacts.map((c) => (
          <button key={c.id} className="access-row" style={{ width: '100%' }} onClick={() => onOpenProfile(c.id)}>
            <Avatar user={c} size={32} />
            <span className="access-name">
              {c.display_name}
              <span style={{ color: 'var(--text-muted)', fontSize: 12, marginLeft: 6 }}>@{c.username}</span>
            </span>
            {c.is_mine && <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>déjà en contact</span>}
          </button>
        ))}
      </div>
      <div className="modal-actions"><button className="btn" onClick={onClose}>Fermer</button></div>
    </Modal>
  );
}
