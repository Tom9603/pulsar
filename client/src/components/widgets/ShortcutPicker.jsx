import { useMemo, useState } from 'react';
import Modal from '../Modal.jsx';
import Icon from '../Icon.jsx';
import Avatar from '../Avatar.jsx';

/**
 * Choix des raccourcis d'un widget « Raccourcis » : serveurs, conversations
 * et écrans de l'application. On coche ce qu'on veut voir, dans l'ordre où
 * on le coche.
 */
const SECTIONS = [
  { id: 'home', label: 'Accueil', icon: 'house' },
  { id: 'dm', label: 'Messages privés', icon: 'comments' },
  { id: 'friends', label: 'Contacts', icon: 'user-group' },
  { id: 'saved', label: 'Tâches', icon: 'circle-check' },
];

const keyOf = (it) => `${it.kind}:${it.id}`;

export default function ShortcutPicker({ item, servers, conversations, onSave, onClose }) {
  const [items, setItems] = useState(() => (Array.isArray(item.config?.items) ? item.config.items : []));
  const [q, setQ] = useState('');
  const chosen = useMemo(() => new Set(items.map(keyOf)), [items]);

  const toggle = (entry) => {
    setItems((cur) => (chosen.has(keyOf(entry)) ? cur.filter((c) => keyOf(c) !== keyOf(entry)) : [...cur, entry]));
  };

  const match = (label) => !q.trim() || label.toLowerCase().includes(q.trim().toLowerCase());

  const Row = ({ entry, children }) => (
    <button
      className={`wg-pick-row ${chosen.has(keyOf(entry)) ? 'on' : ''}`}
      onClick={() => toggle(entry)}
      type="button"
    >
      {children}
      <span className="wg-pick-check"><Icon name={chosen.has(keyOf(entry)) ? 'circle-check' : 'plus'} /></span>
    </button>
  );

  return (
    <Modal className="modal-shortcuts" onClose={onClose}>
      <h2>Vos raccourcis</h2>
      <p className="modal-sub">Cochez ce que vous voulez atteindre en un clic depuis l’accueil. L’ordre suit vos choix.</p>

      <div className="wg-pick-search">
        <Icon name="magnifying-glass" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filtrer par nom…" />
      </div>

      <div className="wg-pick-scroll">
        <div className="wg-pick-title">Écrans</div>
        <div className="wg-pick-list">
          {SECTIONS.filter((s) => match(s.label)).map((s) => (
            <Row key={s.id} entry={{ kind: 'section', id: s.id, label: s.label, icon: s.icon }}>
              <span className="wg-pick-icon"><Icon name={s.icon} /></span>
              <span className="wg-pick-name">{s.label}</span>
            </Row>
          ))}
        </div>

        {servers.length > 0 && (
          <>
            <div className="wg-pick-title">Serveurs</div>
            <div className="wg-pick-list">
              {servers.filter((s) => match(s.name)).map((s) => (
                <Row key={s.id} entry={{ kind: 'server', id: s.id, label: s.name, color: s.icon_color, avatar: s.icon_url, icon: 'server' }}>
                  <span className="wg-pick-icon" style={{ background: s.icon_url ? undefined : s.icon_color }}>
                    {s.icon_url ? <img src={s.icon_url} alt="" /> : s.name.charAt(0).toUpperCase()}
                  </span>
                  <span className="wg-pick-name">{s.name}</span>
                </Row>
              ))}
            </div>
          </>
        )}

        {conversations.length > 0 && (
          <>
            <div className="wg-pick-title">Conversations</div>
            <div className="wg-pick-list">
              {conversations.filter((c) => match(c.display_name || c.username)).map((c) => (
                <Row key={c.id} entry={{ kind: 'dm', id: c.id, label: c.display_name, avatar: c.avatar_url, icon: 'comment' }}>
                  <Avatar user={c} size={28} />
                  <span className="wg-pick-name">{c.display_name}</span>
                </Row>
              ))}
            </div>
          </>
        )}
      </div>

      <div className="modal-actions">
        <button className="btn btn-ghost" onClick={onClose}>Annuler</button>
        <button className="btn" onClick={() => onSave({ ...item, config: { ...(item.config || {}), items } })}>
          Enregistrer {items.length ? `· ${items.length}` : ''}
        </button>
      </div>
    </Modal>
  );
}
