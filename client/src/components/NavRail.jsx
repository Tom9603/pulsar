import { mediaUrl } from '../api.js';

const SECTIONS = [
  { id: 'home', icon: '🏠', label: 'Accueil' },
  { id: 'dm', icon: '💬', label: 'Messages' },
  { id: 'friends', icon: '👥', label: 'Contacts' },
  { id: 'saved', icon: '✅', label: 'À faire' },
];

/** Rail de navigation : sections de l'app (Accueil, Messages, Contacts, À faire) + serveurs. */
export default function NavRail({ section, servers, activeServerId, hasUnreadDm, todoCount = 0, onSection, onSelectServer, onAddServer }) {
  return (
    <nav className="navrail">
      {SECTIONS.map((s) => (
        <button
          key={s.id}
          className={`nav-item ${section === s.id ? 'active' : ''}`}
          onClick={() => onSection(s.id)}
        >
          <span className="nav-ico">
            {s.icon}
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
          >
            {sv.icon_url ? <img src={mediaUrl(sv.icon_url)} alt="" /> : sv.name.charAt(0).toUpperCase()}
          </button>
        ))}
        <button className="nav-server nav-add" title="Ajouter un serveur" onClick={onAddServer}>+</button>
      </div>
    </nav>
  );
}
