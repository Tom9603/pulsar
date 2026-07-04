import { mediaUrl } from '../api.js';

/** Barre verticale des serveurs (à gauche) + bouton Messages privés en haut. */
export default function ServerRail({ servers, activeServerId, view, onSelect, onHome, onAdd, hasUnreadDm }) {
  return (
    <div className="server-rail">
      <div
        className={`server-icon home-icon ${view === 'dm' ? 'active' : ''}`}
        title="Messages privés"
        onClick={onHome}
      >
        💬
        {hasUnreadDm && <span className="rail-dot" />}
      </div>
      <div className="rail-divider" />

      {servers.map((s) => (
        <div
          key={s.id}
          className={`server-icon ${view === 'server' && s.id === activeServerId ? 'active' : ''}`}
          style={{ background: s.icon_color }}
          title={s.name}
          onClick={() => onSelect(s.id)}
        >
          {s.icon_url ? <img src={mediaUrl(s.icon_url)} alt="" /> : s.name.charAt(0).toUpperCase()}
        </div>
      ))}

      <div className="server-icon server-add" title="Ajouter un serveur" onClick={onAdd}>+</div>
    </div>
  );
}
