import { useState } from 'react';

/** Liste des salons du serveur actif (textuels + vocaux, par catégorie) + menu du serveur. */
export default function ChannelSidebar({
  detail,
  isOwner,
  can,
  activeChannelId,
  voiceStates,
  connectedChannelId,
  onSelectChannel,
  onCreateChannel,
  onDeleteChannel,
  onDeleteServer,
  onLeaveServer,
  onManageRoles,
  onServerSettings,
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [adding, setAdding] = useState(null); // 'text' | 'voice' | null
  const [newName, setNewName] = useState('');
  const [collapsed, setCollapsed] = useState({});

  if (!detail) return <div className="channel-sidebar" />;

  const manageChannels = can('MANAGE_CHANNELS');
  const categories = detail.categories || [];
  const textChannels = detail.channels.filter((c) => c.type === 'text');
  const voiceChannels = detail.channels.filter((c) => c.type === 'voice');
  const uncategorized = textChannels.filter((c) => !c.category_id);

  async function submitChannel(e) {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    await onCreateChannel(name, adding);
    setNewName('');
    setAdding(null);
  }

  const renderText = (c) => (
    <ChannelRow key={c.id} channel={c} active={c.id === activeChannelId}
      canDelete={manageChannels && detail.channels.length > 1}
      onSelect={() => onSelectChannel(c.id)} onDelete={() => onDeleteChannel(c.id)} />
  );

  return (
    <div className="channel-sidebar">
      <div className="sidebar-header" onClick={() => setMenuOpen((v) => !v)}>
        <span>{detail.server.name}</span>
        <span className="chevron">{menuOpen ? '✕' : '▾'}</span>
      </div>

      {menuOpen && (
        <div style={{ padding: '8px', borderBottom: '1px solid #10121750' }}>
          <div className="invite-box">
            <code>{detail.server.invite_code}</code>
            <button onClick={() => navigator.clipboard?.writeText(detail.server.invite_code)}>Copier</button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
            {can('MANAGE_SERVER') && (
              <button className="btn btn-ghost" style={{ padding: '6px 12px', fontSize: 13 }} onClick={() => { setMenuOpen(false); onServerSettings(); }}>
                ⚙️ Paramètres du serveur
              </button>
            )}
            {can('MANAGE_ROLES') && (
              <button className="btn btn-ghost" style={{ padding: '6px 12px', fontSize: 13 }} onClick={() => { setMenuOpen(false); onManageRoles(); }}>
                🛡️ Gérer les rôles
              </button>
            )}
            {isOwner ? (
              <button className="btn btn-danger" style={{ padding: '6px 12px', fontSize: 13 }} onClick={onDeleteServer}>Supprimer le serveur</button>
            ) : (
              <button className="btn btn-danger" style={{ padding: '6px 12px', fontSize: 13 }} onClick={onLeaveServer}>Quitter le serveur</button>
            )}
          </div>
        </div>
      )}

      <div className="channel-list">
        <div className="channel-category">
          <span>Salons textuels</span>
          {manageChannels && <button title="Créer un salon textuel" onClick={() => { setAdding('text'); setNewName(''); }}>+</button>}
        </div>
        {uncategorized.map(renderText)}

        {categories.map((cat) => {
          const chans = textChannels.filter((c) => c.category_id === cat.id);
          const isCollapsed = collapsed[cat.id];
          return (
            <div key={cat.id}>
              <div className="channel-category cat-header" onClick={() => setCollapsed((s) => ({ ...s, [cat.id]: !s[cat.id] }))}>
                <span>{isCollapsed ? '▸' : '▾'} {cat.name}</span>
              </div>
              {!isCollapsed && chans.map(renderText)}
            </div>
          );
        })}

        <div className="channel-category">
          <span>Salons vocaux</span>
          {manageChannels && <button title="Créer un salon vocal" onClick={() => { setAdding('voice'); setNewName(''); }}>+</button>}
        </div>
        {voiceChannels.map((c) => (
          <div key={c.id}>
            <ChannelRow channel={c} active={c.id === activeChannelId}
              connected={connectedChannelId === c.id}
              canDelete={manageChannels && detail.channels.length > 1}
              onSelect={() => onSelectChannel(c.id)} onDelete={() => onDeleteChannel(c.id)} />
            <div className="voice-occupants">
              {(voiceStates[c.id] || []).map((m) => (
                <div className={`voice-occupant ${m.speaking ? 'speaking' : ''}`} key={m.socketId}>
                  <span>{m.muted ? '🔇' : '🎧'}</span> {m.user.display_name}
                </div>
              ))}
            </div>
          </div>
        ))}

        {adding && (
          <form onSubmit={submitChannel} style={{ padding: '8px' }}>
            <input
              style={{ width: '100%', padding: '8px 10px', background: 'var(--bg-input)', border: 'none', borderRadius: 4, color: 'var(--text)' }}
              autoFocus
              placeholder={`nom du salon ${adding === 'voice' ? 'vocal' : 'textuel'}`}
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onBlur={() => !newName && setAdding(null)}
            />
          </form>
        )}
      </div>
    </div>
  );
}

function ChannelRow({ channel, active, connected, canDelete, onSelect, onDelete }) {
  const unread = channel.type === 'text' && channel.unread && !active;
  return (
    <div className={`channel-item ${active ? 'active' : ''} ${unread ? 'unread' : ''}`} onClick={onSelect}>
      <span className="hash">{channel.type === 'voice' ? '🔊' : '#'}</span>
      <span className="name">{channel.name}</span>
      {connected && <span title="Connecté au vocal" style={{ color: 'var(--online)', fontSize: 11 }}>●</span>}
      {channel.mentions > 0 && <span className="mention-badge">{channel.mentions}</span>}
      {canDelete && (
        <button className="del" title="Supprimer le salon" onClick={(e) => { e.stopPropagation(); onDelete(); }}>✕</button>
      )}
    </div>
  );
}
