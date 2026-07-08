import { useEffect, useState, useCallback } from 'react';
import { api } from '../api.js';
import { getSocket } from '../socket.js';
import Avatar from './Avatar.jsx';
import Icon from './Icon.jsx';
import { ctx } from '../contextmenu.js';

/** Écran « Amis » : liste, demandes reçues/envoyées, ajout, blocage. */
export default function FriendsPanel({ onlineIds, onOpenDm, onOpenProfile }) {
  const [data, setData] = useState({ friends: [], incoming: [], outgoing: [], blocked: [] });
  const [username, setUsername] = useState('');
  const [msg, setMsg] = useState('');
  const online = new Set(onlineIds);

  const load = useCallback(() => { api('/friends').then(setData).catch(() => {}); }, []);

  useEffect(() => {
    load();
    const socket = getSocket();
    socket.on('friends:changed', load);
    return () => socket.off('friends:changed', load);
  }, [load]);

  async function addFriend(e) {
    e.preventDefault();
    setMsg('');
    try {
      const r = await api('/friends/request', { method: 'POST', body: { username: username.trim() } });
      setMsg(r.status === 'accepted' ? 'Vous êtes maintenant en contact !' : 'Invitation envoyée.');
      setUsername('');
      load();
    } catch (err) { setMsg(err.message); }
  }

  const act = async (path, method = 'POST') => { try { await api(path, { method }); load(); } catch (e) { setMsg(e.message); } };

  const profileItem = (id) => (onOpenProfile ? { label: 'Voir le profil', icon: 'user', onClick: () => onOpenProfile(id) } : null);

  const Row = ({ u, menu, children }) => (
    <div className="friend-row" onContextMenu={menu}>
      <Avatar user={u} size={32} status={online.has(u.id) ? u.status : 'offline'} />
      <div className="friend-info">
        <div className="friend-name">{u.display_name}</div>
        <div className="friend-sub">@{u.username}</div>
      </div>
      <div className="friend-actions">{children}</div>
    </div>
  );

  return (
    <div className="main-content">
      <div className="content-header"><span><Icon name="user-group" /> Contacts</span></div>
      <div className="friends-body">
        <form className="add-friend" onSubmit={addFriend}>
          <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Ajouter un contact par nom d’utilisateur…" />
          <button className="btn" style={{ width: 'auto', padding: '0 18px' }}>Envoyer</button>
        </form>
        {msg && <div className="friend-msg">{msg}</div>}

        {data.incoming.length > 0 && (
          <section>
            <h3>Invitations reçues · {data.incoming.length}</h3>
            {data.incoming.map((u) => (
              <Row key={u.id} u={u} menu={ctx([
                { label: 'Accepter l’invitation', icon: 'check', onClick: () => act(`/friends/${u.id}/accept`) },
                profileItem(u.id),
                { sep: true },
                { label: 'Refuser', icon: 'xmark', danger: true, onClick: () => act(`/friends/${u.id}`, 'DELETE') },
              ])}>
                <button className="btn" style={{ width: 'auto', padding: '4px 12px', fontSize: 13 }} onClick={() => act(`/friends/${u.id}/accept`)}>Accepter</button>
                <button className="btn btn-ghost" style={{ width: 'auto', padding: '4px 12px', fontSize: 13 }} onClick={() => act(`/friends/${u.id}`, 'DELETE')}>Refuser</button>
              </Row>
            ))}
          </section>
        )}

        <section>
          <h3>Contacts · {data.friends.length}</h3>
          {data.friends.length === 0 && <p className="friends-empty">Aucun contact pour l’instant. Ajoutez-en un ci-dessus !</p>}
          {data.friends.map((u) => (
            <Row key={u.id} u={u} menu={ctx([
              { label: 'Envoyer un message', icon: 'message', onClick: () => onOpenDm(u) },
              profileItem(u.id),
              { sep: true },
              { label: 'Retirer le contact', icon: 'user-minus', danger: true, onClick: () => act(`/friends/${u.id}`, 'DELETE') },
              { label: 'Bloquer', icon: 'ban', danger: true, onClick: () => act(`/friends/${u.id}/block`) },
            ])}>
              <button className="btn" style={{ width: 'auto', padding: '4px 12px', fontSize: 13 }} onClick={() => onOpenDm(u)}><Icon name="message" /> Message</button>
              <button className="btn btn-ghost" style={{ width: 'auto', padding: '4px 12px', fontSize: 13 }} onClick={() => act(`/friends/${u.id}`, 'DELETE')}>Retirer</button>
              <button className="btn btn-danger" style={{ width: 'auto', padding: '4px 12px', fontSize: 13 }} onClick={() => act(`/friends/${u.id}/block`)}>Bloquer</button>
            </Row>
          ))}
        </section>

        {data.outgoing.length > 0 && (
          <section>
            <h3>Invitations envoyées · {data.outgoing.length}</h3>
            {data.outgoing.map((u) => (
              <Row key={u.id} u={u} menu={ctx([
                profileItem(u.id),
                { label: 'Annuler l’invitation', icon: 'xmark', danger: true, onClick: () => act(`/friends/${u.id}`, 'DELETE') },
              ])}>
                <button className="btn btn-ghost" style={{ width: 'auto', padding: '4px 12px', fontSize: 13 }} onClick={() => act(`/friends/${u.id}`, 'DELETE')}>Annuler</button>
              </Row>
            ))}
          </section>
        )}

        {data.blocked.length > 0 && (
          <section>
            <h3>Bloqués · {data.blocked.length}</h3>
            {data.blocked.map((u) => (
              <Row key={u.id} u={u} menu={ctx([
                { label: 'Débloquer', icon: 'unlock', onClick: () => act(`/friends/${u.id}/block`, 'DELETE') },
              ])}>
                <button className="btn btn-ghost" style={{ width: 'auto', padding: '4px 12px', fontSize: 13 }} onClick={() => act(`/friends/${u.id}/block`, 'DELETE')}>Débloquer</button>
              </Row>
            ))}
          </section>
        )}
      </div>
    </div>
  );
}
