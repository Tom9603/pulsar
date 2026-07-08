import { useState } from 'react';
import Icon from './Icon.jsx';
import { ctx } from '../contextmenu.js';

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
  onManageAccess,
  onDeleteServer,
  onLeaveServer,
  onManageRoles,
  onServerSettings,
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [adding, setAdding] = useState(null); // 'text' | 'voice' | null
  const [newName, setNewName] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [clientLabel, setClientLabel] = useState('');
  const [invited, setInvited] = useState([]); // ids invités à l'espace privé
  const [collapsed, setCollapsed] = useState({});

  if (!detail) return <div className="channel-sidebar" />;

  const manageChannels = can('MANAGE_CHANNELS');
  const categories = detail.categories || [];
  const textChannels = detail.channels.filter((c) => c.type === 'text');
  const voiceChannels = detail.channels.filter((c) => c.type === 'voice');
  const uncategorized = textChannels.filter((c) => !c.category_id);
  const otherMembers = (detail.members || []).filter((m) => m.id !== detail.server.owner_id);

  function startAdd(type) {
    setAdding(type); setNewName(''); setIsPrivate(false); setClientLabel(''); setInvited([]);
  }

  async function submitChannel(e) {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    await onCreateChannel(name, adding, adding === 'text'
      ? { private: isPrivate, client_label: clientLabel.trim(), member_ids: isPrivate ? invited : [] }
      : {});
    setAdding(null); setNewName(''); setIsPrivate(false); setClientLabel(''); setInvited([]);
  }

  const toggleInvite = (id) => setInvited((v) => (v.includes(id) ? v.filter((x) => x !== id) : [...v, id]));

  const renderText = (c) => (
    <ChannelRow key={c.id} channel={c} active={c.id === activeChannelId}
      canManage={manageChannels} canDelete={manageChannels && detail.channels.length > 1}
      onSelect={() => onSelectChannel(c.id)} onDelete={() => onDeleteChannel(c.id)}
      onManageAccess={() => onManageAccess(c)} />
  );

  return (
    <div className="channel-sidebar">
      <div className={`sidebar-header ${menuOpen ? 'open' : ''}`} onClick={() => setMenuOpen((v) => !v)}>
        <span className="sh-name">{detail.server.name}</span>
        <span className="chevron"><Icon name={menuOpen ? 'chevron-up' : 'chevron-down'} /></span>
      </div>

      {menuOpen && (
        <div className="server-menu">
          <div className="sm-invite">
            <div className="sm-label">Code d’invitation</div>
            <div className="sm-invite-row">
              <code>{detail.server.invite_code}</code>
              <button className={copied ? 'ok' : ''} onClick={() => { navigator.clipboard?.writeText(detail.server.invite_code); setCopied(true); setTimeout(() => setCopied(false), 1600); }}>
                <Icon name={copied ? 'check' : 'copy'} /> {copied ? 'Copié' : 'Copier'}
              </button>
            </div>
          </div>

          {(can('MANAGE_SERVER') || can('MANAGE_ROLES')) && (
            <div className="sm-items">
              {can('MANAGE_SERVER') && (
                <button className="sm-item" onClick={() => { setMenuOpen(false); onServerSettings(); }}>
                  <Icon name="gear" /> <span>Paramètres du serveur</span> <Icon name="chevron-right" />
                </button>
              )}
              {can('MANAGE_ROLES') && (
                <button className="sm-item" onClick={() => { setMenuOpen(false); onManageRoles(); }}>
                  <Icon name="shield-halved" /> <span>Gérer les rôles</span> <Icon name="chevron-right" />
                </button>
              )}
            </div>
          )}

          <div className="sm-items sm-danger">
            <button className="sm-item danger" onClick={() => { setMenuOpen(false); (isOwner ? onDeleteServer : onLeaveServer)(); }}>
              <Icon name={isOwner ? 'trash' : 'right-from-bracket'} /> <span>{isOwner ? 'Supprimer le serveur' : 'Quitter le serveur'}</span>
            </button>
          </div>
        </div>
      )}

      <div className="channel-list">
        <div className="channel-category">
          <span>Salons textuels</span>
          {manageChannels && <button title="Créer un salon textuel" onClick={() => startAdd('text')}><Icon name="plus" /></button>}
        </div>
        {uncategorized.map(renderText)}

        {categories.map((cat) => {
          const chans = textChannels.filter((c) => c.category_id === cat.id);
          const isCollapsed = collapsed[cat.id];
          return (
            <div key={cat.id}>
              <div className="channel-category cat-header" onClick={() => setCollapsed((s) => ({ ...s, [cat.id]: !s[cat.id] }))}>
                <span><Icon name={isCollapsed ? 'chevron-right' : 'chevron-down'} /> {cat.name}</span>
              </div>
              {!isCollapsed && chans.map(renderText)}
            </div>
          );
        })}

        <div className="channel-category">
          <span>Salons vocaux</span>
          {manageChannels && <button title="Créer un salon vocal" onClick={() => startAdd('voice')}><Icon name="plus" /></button>}
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
                  <span><Icon name={m.muted ? 'microphone-slash' : 'headphones'} /></span> {m.user.display_name}
                </div>
              ))}
            </div>
          </div>
        ))}

        {adding && (
          <form onSubmit={submitChannel} className="channel-add-form">
            <input
              className="channel-add-input"
              autoFocus
              placeholder={`nom du salon ${adding === 'voice' ? 'vocal' : 'textuel'}`}
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
            />
            {adding === 'text' && (
              <>
                <input
                  className="channel-add-input"
                  placeholder="Projet / client (optionnel)"
                  value={clientLabel}
                  onChange={(e) => setClientLabel(e.target.value)}
                />
                <label className="channel-add-check">
                  <input type="checkbox" checked={isPrivate} onChange={(e) => setIsPrivate(e.target.checked)} />
                  <Icon name="lock" /> Espace client (accès restreint)
                </label>
                {isPrivate && (
                  <div className="channel-add-invite">
                    <div className="cai-title">Inviter dans cet espace :</div>
                    {otherMembers.length === 0 && <div className="cai-empty">Aucun autre membre à inviter pour l’instant.</div>}
                    {otherMembers.map((m) => (
                      <label key={m.id} className="cai-row">
                        <input type="checkbox" checked={invited.includes(m.id)} onChange={() => toggleInvite(m.id)} />
                        {m.display_name}
                      </label>
                    ))}
                  </div>
                )}
              </>
            )}
            <div className="channel-add-actions">
              <button type="button" className="btn btn-ghost" style={{ width: 'auto', padding: '5px 10px', fontSize: 12 }} onClick={() => setAdding(null)}>Annuler</button>
              <button type="submit" className="btn" style={{ width: 'auto', padding: '5px 12px', fontSize: 12 }}>Créer</button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

function ChannelRow({ channel, active, connected, canManage, canDelete, onSelect, onDelete, onManageAccess }) {
  const unread = channel.type === 'text' && channel.unread && !active;
  return (
    <div className={`channel-item ${active ? 'active' : ''} ${unread ? 'unread' : ''}`} onClick={onSelect}
      onContextMenu={ctx([
        { label: 'Ouvrir', icon: 'arrow-right', onClick: onSelect },
        canManage && channel.private && onManageAccess && { label: 'Gérer l’accès', icon: 'user-gear', onClick: onManageAccess },
        { label: 'Copier le nom', icon: 'copy', onClick: () => navigator.clipboard?.writeText(channel.name) },
        canDelete && { sep: true },
        canDelete && { label: 'Supprimer le salon', icon: 'trash', danger: true, onClick: onDelete },
      ])}>
      <span className="hash"><Icon name={channel.type === 'voice' ? 'volume-high' : channel.private ? 'lock' : 'align-left'} /></span>
      <span className="name">{channel.name}</span>
      {channel.client_label && <span className="channel-tag" title={`Projet / client : ${channel.client_label}`}>{channel.client_label}</span>}
      {connected && <span title="Connecté au vocal" style={{ color: 'var(--online)', fontSize: 11 }}>●</span>}
      {channel.mentions > 0 && <span className="mention-badge">{channel.mentions}</span>}
      {canManage && channel.private && onManageAccess && (
        <button className="del" title="Gérer l’accès" onClick={(e) => { e.stopPropagation(); onManageAccess(); }}><Icon name="user-gear" /></button>
      )}
      {canDelete && (
        <button className="del" title="Supprimer le salon" onClick={(e) => { e.stopPropagation(); onDelete(); }}><Icon name="xmark" /></button>
      )}
    </div>
  );
}
