import { useEffect, useState } from 'react';
import Avatar from './Avatar.jsx';
import Icon from './Icon.jsx';
import { api, mediaUrl } from '../api.js';
import ContactLibraryModal from './ContactLibraryModal.jsx';

/** Écran d'accueil : tableau de bord (serveurs, messages récents, contacts). */
export default function HomeView({ user, servers, dmConversations, onlineIds, onOpenServer, onOpenDm, onOpenFriends, onOpenSaved, onAddServer, serverMenu, dmMenu }) {
  const [contacts, setContacts] = useState([]);
  const [library, setLibrary] = useState(false);
  const online = new Set(onlineIds);
  const hour = new Date().getHours();
  const greet = hour < 6 ? 'Bonne nuit' : hour < 12 ? 'Bonjour' : hour < 18 ? 'Bon après-midi' : 'Bonsoir';

  useEffect(() => { api('/friends').then(({ friends }) => setContacts(friends || [])).catch(() => {}); }, []);

  return (
    <div className="home-view">
      <div className="home-inner">
        <div className="home-hero">
          <h1>{greet}, {user.display_name} <span className="home-spark">✦</span></h1>
          <p>Bienvenue sur Pulsar, reprenez là où vous vous êtes arrêté.</p>
        </div>

        <div className="home-quick">
          <button className="quick-tile" onClick={onOpenFriends}><span><Icon name="user-group" /></span> Contacts</button>
          <button className="quick-tile" onClick={onOpenSaved}><span><Icon name="circle-check" /></span> Tasks</button>
          <button className="quick-tile add" onClick={onAddServer}><span><Icon name="plus" /></span> Nouveau serveur</button>
        </div>

        <section className="home-section">
          <h2>Vos serveurs</h2>
          {servers.length === 0 ? (
            <p className="home-empty">Aucun serveur pour l’instant, créez-en un via « Nouveau serveur ».</p>
          ) : (
            <div className="home-grid">
              {servers.map((s) => (
                <button key={s.id} className="server-card" onClick={() => onOpenServer(s.id)} onContextMenu={serverMenu?.(s)}>
                  <span className="sc-icon" style={{ background: s.icon_url ? undefined : s.icon_color }}>
                    {s.icon_url ? <img src={mediaUrl(s.icon_url)} alt="" /> : s.name.charAt(0).toUpperCase()}
                  </span>
                  <span className="sc-name">{s.name}</span>
                </button>
              ))}
            </div>
          )}
        </section>

        <section className="home-section">
          <h2>Messages récents</h2>
          {dmConversations.length === 0 ? (
            <p className="home-empty">Aucune conversation. Ajoutez un contact pour démarrer un échange.</p>
          ) : (
            <div className="home-dms">
              {dmConversations.slice(0, 20).map((c) => (
                <button key={c.id} className="dm-card" onClick={() => onOpenDm(c)} onContextMenu={dmMenu?.(c)}>
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

        <section className="home-section">
          <div className="home-section-head">
            <h2>Vos contacts{contacts.length ? ` · ${contacts.length}` : ''}</h2>
            {contacts.length > 0 && (
              <button className="home-more" onClick={() => setLibrary(true)}><Icon name="address-book" /> Voir tous mes contacts</button>
            )}
          </div>
          {contacts.length === 0 ? (
            <p className="home-empty">Aucun contact. <button className="link-btn" onClick={onOpenFriends}>Ajoutez votre premier contact</button>.</p>
          ) : (
            <div className="home-dms">
              {contacts.slice(0, 20).map((c) => (
                <button key={c.id} className="dm-card" onClick={() => onOpenDm(c)} onContextMenu={dmMenu?.(c)}>
                  <Avatar user={c} size={40} status={online.has(c.id) ? c.status : 'offline'} />
                  <div className="dm-card-info">
                    <div className="dm-card-name">{c.display_name}</div>
                    <div className="dm-card-last">@{c.username}</div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>
      </div>

      {library && (
        <ContactLibraryModal contacts={contacts} onlineIds={onlineIds} onOpenDm={(c) => { setLibrary(false); onOpenDm(c); }} onClose={() => setLibrary(false)} />
      )}
    </div>
  );
}
