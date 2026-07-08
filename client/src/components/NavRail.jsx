import { mediaUrl } from '../api.js';
import Icon from './Icon.jsx';

const SECTIONS = [
  { id: 'home', icon: 'house', label: 'Accueil' },
  { id: 'dm', icon: 'comment', label: 'Messages' },
  { id: 'friends', icon: 'user-group', label: 'Contacts' },
  { id: 'saved', icon: 'circle-check', label: 'Tasks' },
];

/** Rail de navigation : sections de l'app (Accueil, Messages, Contacts, À faire) + serveurs. */
export default function NavRail({ section, servers, activeServerId, hasUnreadDm, todoCount = 0, onSection, onSelectServer, onAddServer, onFeedback, serverMenu }) {
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
            {s.id === 'dm' && hasUnreadDm && <span className="nav-dot" />}
            {s.id === 'saved' && todoCount > 0 && <span className="nav-count">{todoCount}</span>}
          </span>
          <span className="nav-label">{s.label}</span>
        </button>
      ))}

      <div className="nav-sep" />
      <div className="nav-servers">
        {servers.map((sv) => (
          <button
            key={sv.id}
            className={`nav-server ${section === 'server' && sv.id === activeServerId ? 'active' : ''}`}
            style={{ background: sv.icon_url ? undefined : sv.icon_color }}
            title={sv.name}
            onClick={() => onSelectServer(sv.id)}
            onContextMenu={serverMenu?.(sv)}
          >
            {sv.icon_url ? <img src={mediaUrl(sv.icon_url)} alt="" /> : sv.name.charAt(0).toUpperCase()}
          </button>
        ))}
        <button className="nav-server nav-add" title="Ajouter un serveur" onClick={onAddServer}><Icon name="plus" /></button>
      </div>

      <button className="nav-item nav-feedback" title="Donner mon avis" onClick={onFeedback}>
        <span className="nav-ico"><Icon name="comment-dots" /></span>
        <span className="nav-label">Feedback</span>
      </button>
    </nav>
  );
}
