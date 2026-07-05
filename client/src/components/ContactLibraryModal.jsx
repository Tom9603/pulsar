import { useState } from 'react';
import Modal from './Modal.jsx';
import Avatar from './Avatar.jsx';
import Icon from './Icon.jsx';

/** Bibliothèque de contacts : recherche + accès rapide à la conversation. */
export default function ContactLibraryModal({ contacts, onlineIds, onOpenDm, onClose }) {
  const [q, setQ] = useState('');
  const online = new Set(onlineIds);
  const query = q.trim().toLowerCase();
  const filtered = query
    ? contacts.filter((c) => (c.display_name + ' @' + c.username).toLowerCase().includes(query))
    : contacts;

  return (
    <Modal onClose={onClose}>
      <h2>Bibliothèque de contacts</h2>
      <div className="field">
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher un contact…" />
      </div>
      <div className="contact-lib">
        {filtered.length === 0 && <div className="contact-empty">Aucun contact trouvé.</div>}
        {filtered.map((c) => (
          <div className="contact-row" key={c.id}>
            <Avatar user={c} size={38} status={online.has(c.id) ? c.status : 'offline'} />
            <div className="contact-info">
              <div className="contact-name">{c.display_name}</div>
              <div className="contact-sub">@{c.username}</div>
            </div>
            <button className="btn" style={{ width: 'auto', padding: '6px 14px', fontSize: 13 }} onClick={() => onOpenDm(c)}><Icon name="message" /> Message</button>
          </div>
        ))}
      </div>
      <div className="modal-actions">
        <button className="btn btn-ghost" onClick={onClose}>Fermer</button>
      </div>
    </Modal>
  );
}
