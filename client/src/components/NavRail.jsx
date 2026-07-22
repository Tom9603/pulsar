import { mediaUrl } from '../api.js';
import Icon from './Icon.jsx';
import HoverCard from './HoverCard.jsx';

/** Détails affichés au survol d'un serveur. */
function ServerDetails({ sv, isOwner }) {
  const members = sv.member_count || 0;
  return (
    <>
      <div className="hc-title">{sv.name}</div>
      <div className="hc-rows">
        <span className="hc-row">
          <Icon name={isOwner ? 'shield-halved' : 'user'} />
          {isOwner ? 'Vous êtes fondateur' : 'Membre'}
        </span>
        <span className="hc-row">
          <Icon name="user-group" />
          {members} membre{members > 1 ? 's' : ''}
        </span>
        {sv.mentions > 0 ? (
          <span className="hc-row hc-alert">
            <Icon name="at" />
            {sv.mentions} mention{sv.mentions > 1 ? 's' : ''} pour vous
          </span>
        ) : sv.unread ? (
          <span className="hc-row hc-alert"><Icon name="circle" /> Nouveaux messages</span>
        ) : (
          <span className="hc-row hc-calm"><Icon name="circle-check" /> À jour</span>
        )}
      </div>
    </>
  );
}

const SECTIONS = [
  { id: 'home', icon: 'house', label: 'Accueil' },
  { id: 'dm', icon: 'comment', label: 'Messages' },
  { id: 'friends', icon: 'user-group', label: 'Contacts' },
  { id: 'saved', icon: 'circle-check', label: 'Tasks' },
];

/** Rail de navigation : sections de l'app (Accueil, Messages, Contacts, À faire) + serveurs. */
export default function NavRail({ section, servers, activeServerId, hasUnreadDm, dmUnreadCount = 0, todoCount = 0, onSection, onSelectServer, onAddServer, onFeedback, onHelp, serverMenu, currentUserId }) {
  return (
    <nav className="navrail">
      {SECTIONS.map((s) => (
        <button
          key={s.id}
          className={`nav-item ${section === s.id ? 'active' : ''}`}
          onClick={() => onSection(s.id)}
        >
          <span className="nav-ico">
            <Icon name={s.icon} />
            {s.id === 'dm' && dmUnreadCount > 0 && <span className="nav-count">{dmUnreadCount > 9 ? '9+' : dmUnreadCount}</span>}
            {s.id === 'dm' && dmUnreadCount === 0 && hasUnreadDm && <span className="nav-dot" />}
            {s.id === 'saved' && todoCount > 0 && <span className="nav-count">{todoCount}</span>}
          </span>
          <span className="nav-label">{s.label}</span>
        </button>
      ))}

      <button className="nav-item nav-feedback" title="Donner mon avis" onClick={onFeedback}>
        <span className="nav-ico"><Icon name="comment-dots" /></span>
        <span className="nav-label">Feedback</span>
      </button>

      <div className="nav-sep" />
      <div className="nav-servers">
        {servers.map((sv) => (
          <div className="nav-server-wrap" key={sv.id}>
            <HoverCard content={<ServerDetails sv={sv} isOwner={sv.owner_id === currentUserId} />} className="hc-server">
              <button
                className={`nav-server ${section === 'server' && sv.id === activeServerId ? 'active' : ''}`}
                style={{ background: sv.icon_url ? undefined : sv.icon_color }}
                onClick={() => onSelectServer(sv.id)}
                onContextMenu={serverMenu?.(sv)}
              >
                {sv.icon_url ? <img src={mediaUrl(sv.icon_url)} alt="" /> : sv.name.charAt(0).toUpperCase()}
              </button>
            </HoverCard>
            {sv.mentions > 0
              ? <span className="nav-server-badge">{sv.mentions > 9 ? '9+' : sv.mentions}</span>
              : sv.unread ? <span className="nav-server-dot" /> : null}
          </div>
        ))}
        <HoverCard content="Ajouter un serveur">
          <button className="nav-server nav-add" onClick={onAddServer}><Icon name="plus" /></button>
        </HoverCard>
      </div>

      <button className="nav-item nav-help" title="Centre d'aide" onClick={onHelp}>
        <span className="nav-ico"><Icon name="life-ring" /></span>
        <span className="nav-label">Aide</span>
      </button>
    </nav>
  );
}
