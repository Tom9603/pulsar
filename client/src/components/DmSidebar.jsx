import { useState } from 'react';
import Avatar from './Avatar.jsx';
import Icon from './Icon.jsx';

/** Barre latérale des messages privés : bouton Amis + liste des conversations. */
export default function DmSidebar({ conversations, activeUserId, onlineIds, onSelect, onStartDm, onOpenFriends, friendsActive, onOpenSaved, savedActive, convMenu, onCall }) {
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

      {onOpenFriends && (
        <div className={`friends-entry ${friendsActive ? 'active' : ''}`} onClick={onOpenFriends}><Icon name="user-group" /> Contacts</div>
      )}
      {onOpenSaved && (
        <div className={`friends-entry ${savedActive ? 'active' : ''}`} onClick={onOpenSaved}><Icon name="circle-check" /> Tasks</div>
      )}

      <form onSubmit={start} style={{ padding: '10px 8px' }}>
        <input
          style={{ width: '100%', padding: '8px 10px', background: 'var(--bg-input)', border: 'none', borderRadius: 4, color: 'var(--text)', fontSize: 14 }}
          placeholder="Nom d’utilisateur à contacter…"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
        {error && <div style={{ color: '#ff9a9c', fontSize: 12, marginTop: 6 }}>{error}</div>}
      </form>

      <div className="dm-conv-label">Conversations</div>
      <div className="dm-conv-list">
        {conversations.length === 0 && (
          <p className="dm-conv-empty">Aucune conversation. Saisissez un nom d’utilisateur ci-dessus pour commencer.</p>
        )}
        {conversations.map((c) => (
          <div className="dm-conv-wrap" key={c.id}>
            <button
              className={`dm-conv ${c.id === activeUserId ? 'active' : ''}`}
              onClick={() => onSelect(c)}
              onContextMenu={convMenu?.(c)}
            >
              <Avatar user={c} size={38} status={online.has(c.id) ? c.status : 'offline'} />
              <div className="dm-conv-info">
                <div className="dm-conv-name">{c.display_name}</div>
                <div className="dm-conv-last">{c.last_content || '@' + c.username}</div>
              </div>
            </button>
            {onCall && (
              <button className="dm-conv-call" title={`Appeler ${c.display_name}`} onClick={(e) => { e.stopPropagation(); onCall(c); }}>
                <Icon name="phone" />
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
