import { useRef, useState } from 'react';
import Modal from './Modal.jsx';
import Avatar from './Avatar.jsx';
import Icon from './Icon.jsx';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ#'.split('');

/** Répertoire de contacts façon appli smartphone : recherche, groupes alphabétiques, index A→Z. */
export default function ContactLibraryModal({ contacts, onlineIds, onOpenDm, onClose }) {
  const [q, setQ] = useState('');
  const online = new Set(onlineIds);
  const query = q.trim().toLowerCase();
  const scrollRef = useRef(null);

  const filtered = (query
    ? contacts.filter((c) => (c.display_name + ' @' + c.username).toLowerCase().includes(query))
    : contacts
  ).slice().sort((a, b) => (a.display_name || a.username).localeCompare(b.display_name || b.username, 'fr', { sensitivity: 'base' }));

  // Regroupe par première lettre (les non-lettres vont dans « # »)
  const groups = [];
  const indexOf = {};
  for (const c of filtered) {
    const first = (c.display_name || c.username || '#').trim().charAt(0).toUpperCase();
    const letter = /[A-ZÀ-Ý]/.test(first) ? (first.normalize('NFD')[0] || first) : '#';
    if (!(letter in indexOf)) { indexOf[letter] = groups.length; groups.push({ letter, items: [] }); }
    groups[indexOf[letter]].items.push(c);
  }
  const present = new Set(groups.map((g) => g.letter));

  const jumpTo = (letter) => {
    const el = scrollRef.current?.querySelector(`[data-letter="${letter}"]`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <Modal onClose={onClose} className="modal-contacts">
      <h2>Mes contacts{filtered.length ? ` · ${filtered.length}` : ''}</h2>
      <div className="field">
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher un contact…" />
      </div>

      <div className="contact-book">
        <div className="contact-scroll" ref={scrollRef}>
          {groups.length === 0 && <div className="contact-empty">Aucun contact trouvé.</div>}
          {groups.map((g) => (
            <div className="contact-group" key={g.letter} data-letter={g.letter}>
              <div className="contact-letter">{g.letter}</div>
              {g.items.map((c) => (
                <div className="contact-row" key={c.id}>
                  <Avatar user={c} size={38} status={online.has(c.id) ? c.status : 'offline'} />
                  <div className="contact-info">
                    <div className="contact-name">{c.display_name}</div>
                    <div className="contact-sub">@{c.username}</div>
                  </div>
                  <button className="contact-msg" title="Message privé" onClick={() => onOpenDm(c)}><Icon name="message" /></button>
                </div>
              ))}
            </div>
          ))}
        </div>

        {groups.length > 0 && (
          <div className="contact-index">
            {ALPHABET.map((l) => (
              <button key={l} className={present.has(l) ? '' : 'off'} disabled={!present.has(l)} onClick={() => jumpTo(l)}>{l}</button>
            ))}
          </div>
        )}
      </div>

      <div className="modal-actions">
        <button className="btn btn-ghost" onClick={onClose}>Fermer</button>
      </div>
    </Modal>
  );
}
