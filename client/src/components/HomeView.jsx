import Avatar from './Avatar.jsx';
import { mediaUrl } from '../api.js';

/** Écran d'accueil : tableau de bord (serveurs en cartes + messages récents + accès rapides). */
export default function HomeView({ user, servers, dmConversations, onlineIds, onOpenServer, onOpenDm, onOpenFriends, onOpenSaved, onAddServer }) {
  const online = new Set(onlineIds);
  const hour = new Date().getHours();
  const greet = hour < 6 ? 'Bonne nuit' : hour < 12 ? 'Bonjour' : hour < 18 ? 'Bon après-midi' : 'Bonsoir';

  return (
    <div className="home-view">
      <div className="home-inner">
        <div className="home-hero">
          <h1>{greet}, {user.display_name} <span className="home-spark">✦</span></h1>
          <p>Bienvenue sur Pulsar — reprends là où tu t’es arrêté.</p>
        </div>

        <div className="home-quick">
          <button className="quick-tile" onClick={onOpenFriends}><span>👥</span> Amis</button>
          <button className="quick-tile" onClick={onOpenSaved}><span>🔖</span> Sauvegardés</button>
          <button className="quick-tile add" onClick={onAddServer}><span>＋</span> Nouveau serveur</button>
        </div>

        <section className="home-section">
          <h2>Tes serveurs</h2>
          <div className="home-grid">
            {servers.map((s) => (
              <button key={s.id} className="server-card" onClick={() => onOpenServer(s.id)}>
                <span className="sc-icon" style={{ background: s.icon_url ? undefined : s.icon_color }}>
                  {s.icon_url ? <img src={mediaUrl(s.icon_url)} alt="" /> : s.name.charAt(0).toUpperCase()}
                </span>
                <span className="sc-name">{s.name}</span>
              </button>
            ))}
            <button className="server-card ghost" onClick={onAddServer}>
              <span className="sc-icon add">＋</span>
              <span className="sc-name">Créer / rejoindre</span>
            </button>
          </div>
        </section>

        <section className="home-section">
          <h2>Messages récents</h2>
          {dmConversations.length === 0 ? (
            <p className="home-empty">Aucune conversation. Va dans « Amis » pour démarrer.</p>
          ) : (
            <div className="home-dms">
              {dmConversations.slice(0, 8).map((c) => (
                <button key={c.id} className="dm-card" onClick={() => onOpenDm(c)}>
                  <Avatar user={c} size={40} status={online.has(c.id) ? c.status : 'offline'} />
                  <div className="dm-card-info">
                    <div className="dm-card-name">{c.display_name}</div>
                    <div className="dm-card-last">{c.last_content || '@' + c.username}</div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
