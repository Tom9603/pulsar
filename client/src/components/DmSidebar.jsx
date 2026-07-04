import { useState } from 'react';
import Avatar from './Avatar.jsx';

/** Barre latérale des messages privés : bouton Amis + liste des conversations. */
export default function DmSidebar({ conversations, activeUserId, onlineIds, onSelect, onStartDm, onOpenFriends, friendsActive }) {
  const [username, setUsername] = useState('');
  const [error, setError] = useState('');
  const online = new Set(onlineIds);

  async function start(e) {
    e.preventDefault();
    const name = username.trim();
    if (!name) return;
    setError('');
    try {
      await onStartDm(name);
      setUsername('');
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="channel-sidebar">
      <div className="sidebar-header" style={{ cursor: 'default' }}>
        <span>Messages privés</span>
      </div>

      <div
        className={`friends-entry ${friendsActive ? 'active' : ''}`}
        onClick={onOpenFriends}
      >
        👥 Amis
      </div>

      <form onSubmit={start} style={{ padding: '10px 8px' }}>
        <input
          style={{ width: '100%', padding: '8px 10px', background: 'var(--bg-input)', border: 'none', borderRadius: 4, color: 'var(--text)', fontSize: 14 }}
          placeholder="Nom d’utilisateur à contacter…"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
        {error && <div style={{ color: '#ff9a9c', fontSize: 12, marginTop: 6 }}>{error}</div>}
      </form>

      <div className="channel-list">
        {conversations.length === 0 && (
          <p style={{ color: 'var(--text-faint)', fontSize: 13, padding: '8px' }}>
            Aucune conversation. Saisis un nom d’utilisateur ci-dessus pour commencer.
          </p>
        )}
        {conversations.map((c) => (
          <div
            key={c.id}
            className={`member-row ${c.id === activeUserId ? 'active-dm' : ''}`}
            style={c.id === activeUserId ? { background: 'var(--bg-active)' } : undefined}
            onClick={() => onSelect(c)}
          >
            <Avatar user={c} size={32} status={online.has(c.id) ? c.status : 'offline'} />
            <div style={{ overflow: 'hidden' }}>
              <div className="m-name">{c.display_name}</div>
              <div style={{ fontSize: 12, color: 'var(--text-faint)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {c.last_content || '@' + c.username}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
