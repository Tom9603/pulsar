import { useEffect, useState, useCallback } from 'react';
import Modal from './Modal.jsx';
import Avatar from './Avatar.jsx';
import Icon from './Icon.jsx';
import { ProCard } from './MemberModal.jsx';
import FriendsListModal from './FriendsListModal.jsx';
import { api, mediaUrl } from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';

const STATUS_LABEL = { online: 'En ligne', idle: 'Absent', dnd: 'Ne pas déranger', meeting: 'En réunion', invisible: 'Hors ligne' };
const STATUS_OPTIONS = [
  { value: 'online', label: 'En ligne' }, { value: 'idle', label: 'Absent' },
  { value: 'dnd', label: 'Ne pas déranger' }, { value: 'meeting', label: 'En réunion' }, { value: 'invisible', label: 'Invisible' },
];

function memberSince(created) {
  if (!created) return null;
  const d = new Date(created.replace(' ', 'T') + 'Z');
  if (isNaN(d)) return null;
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
}

/** Fiche de profil en modale (soi ou un tiers) : bannière, statut, mutuels, actions. */
export default function ProfileModal({ userId, servers = [], onClose, onMessage, onEditProfile, onLogout, onOpenProfile }) {
  const { user: me, updateUser } = useAuth();
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [invite, setInvite] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [reportText, setReportText] = useState('');
  const [full, setFull] = useState(false);
  const [showContacts, setShowContacts] = useState(false);
  const [flash, setFlash] = useState('');

  const load = useCallback(() => {
    api(`/users/${userId}`).then(setData).catch((e) => setErr(e.message));
  }, [userId]);
  useEffect(() => { setData(null); setMenuOpen(false); setInvite(false); setReporting(false); setFull(false); load(); }, [userId, load]);

  if (err) return <Modal onClose={onClose}><div className="error-msg">{err}</div><div className="modal-actions"><button className="btn" onClick={onClose}>Fermer</button></div></Modal>;
  if (!data) return <Modal onClose={onClose}><p className="modal-sub">Chargement du profil…</p></Modal>;

  const u = data.user;
  const self = u.id === me.id;
  const rel = data.relationship;
  const banner = u.banner_url ? { background: `center/cover url(${mediaUrl(u.banner_url)})` } : { background: u.banner_color || 'linear-gradient(135deg, #241f3d, #10243a)' };
  const since = memberSince(u.created_at);

  const act = async (fn) => { try { await fn(); load(); } catch (e) { setFlash(e.message); setTimeout(() => setFlash(''), 2500); } };
  const changeStatus = async (status) => { const { user } = await api('/users/me', { method: 'PATCH', body: { status } }); updateUser(user); load(); };
  const removeContact = () => act(() => api(`/friends/${u.id}`, { method: 'DELETE' }));
  const block = () => act(() => api(`/friends/${u.id}/block`, { method: 'POST' }));
  const unblock = () => act(() => api(`/friends/${u.id}/block`, { method: 'DELETE' }));
  const addContact = () => act(() => api('/friends/request', { method: 'POST', body: { username: u.username } }));
  const acceptContact = () => act(() => api(`/friends/${u.id}/accept`, { method: 'POST' }));
  const inviteToServer = (sid) => act(async () => { await api(`/servers/${sid}/invite-user`, { method: 'POST', body: { userId: u.id } }); setInvite(false); setFlash('Invitation envoyée.'); setTimeout(() => setFlash(''), 2500); });
  async function sendReport() { try { await api(`/users/${u.id}/report`, { method: 'POST', body: { reason: reportText.trim() } }); setReporting(false); setReportText(''); setFlash('Signalement envoyé. Merci.'); setTimeout(() => setFlash(''), 2500); } catch (e) { setFlash(e.message); } }

  return (
    <>
      <Modal onClose={onClose} className="modal-profile">
        <div className="profile-banner" style={banner}>
          {!self && (
            <div className="profile-dots-wrap">
              <button className="profile-dots" title="Plus d’options" onClick={() => setMenuOpen((v) => !v)}><Icon name="ellipsis" /></button>
              {menuOpen && (
                <div className="profile-menu" onMouseLeave={() => setMenuOpen(false)}>
                  <button onClick={() => { setFull(true); setMenuOpen(false); }}>Voir le profil complet</button>
                  {rel === 'friends' && <button onClick={() => { removeContact(); setMenuOpen(false); }}>Retirer de vos contacts</button>}
                  {rel === 'blocked'
                    ? <button onClick={() => { unblock(); setMenuOpen(false); }}>Débloquer</button>
                    : <button onClick={() => { block(); setMenuOpen(false); }}>Bloquer</button>}
                  <button className="danger" onClick={() => { setReporting(true); setMenuOpen(false); }}>Signaler</button>
                </div>
              )}
            </div>
          )}
          <div className="profile-avatar-wrap"><Avatar user={u} size={84} status={STATUS_LABEL[u.status] ? u.status : 'offline'} /></div>
        </div>

        <div className="profile-body">
          <div className="profile-idline">
            <h2>{u.display_name}</h2>
            {u.pronouns && <span className="profile-pronouns">{u.pronouns}</span>}
          </div>
          <div className="profile-sub">@{u.username}</div>
          {u.headline && <div className="profile-headline">{u.headline}</div>}

          <div className="profile-status">
            <span className={`status-dot ${u.status || 'offline'}`} />
            {self ? (
              <select value={u.status} onChange={(e) => changeStatus(e.target.value)}>
                {STATUS_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            ) : <span>{STATUS_LABEL[u.status] || 'Hors ligne'}</span>}
          </div>

          {since && <div className="profile-meta"><Icon name="calendar" /> Membre depuis {since}</div>}
          {data.friends_count > 0 && (
            <button className="profile-link-btn" onClick={() => setShowContacts(true)}><Icon name="user-group" /> {data.friends_count} contact{data.friends_count > 1 ? 's' : ''}</button>
          )}

          {(rel === 'pending_in') && <div className="profile-pending">Cette personne souhaite vous ajouter.</div>}

          {(full || self) && <ProCard u={u} />}
          {(full || self) && u.about && <div className="field"><label>À propos</label><p style={{ fontSize: 14 }}>{u.about}</p></div>}

          {!self && data.mutual_servers.length > 0 && (
            <div className="profile-mutual">
              <label>Serveurs en commun · {data.mutual_servers.length}</label>
              <div className="mutual-servers">
                {data.mutual_servers.map((s) => (
                  <span key={s.id} className="mutual-server" title={s.name} style={{ background: s.icon_url ? undefined : s.icon_color }}>
                    {s.icon_url ? <img src={mediaUrl(s.icon_url)} alt="" /> : s.name.charAt(0).toUpperCase()}
                  </span>
                ))}
              </div>
            </div>
          )}
          {!self && data.mutual_contacts.length > 0 && (
            <div className="profile-mutual">
              <label>Contacts en commun · {data.mutual_contacts.length}</label>
              <div className="mutual-contacts">
                {data.mutual_contacts.map((c) => (
                  <button key={c.id} className="mutual-contact" title={c.display_name} onClick={() => onOpenProfile(c.id)}><Avatar user={c} size={30} /></button>
                ))}
              </div>
            </div>
          )}

          {flash && <div className="profile-flash">{flash}</div>}

          {reporting && (
            <div className="profile-report">
              <label>Motif du signalement</label>
              <textarea rows={2} value={reportText} onChange={(e) => setReportText(e.target.value)} placeholder="Décrivez le problème…" />
              <div className="profile-report-actions">
                <button className="btn btn-ghost" style={{ width: 'auto', padding: '6px 12px' }} onClick={() => setReporting(false)}>Annuler</button>
                <button className="btn btn-danger" style={{ width: 'auto', padding: '6px 12px' }} onClick={sendReport}>Envoyer le signalement</button>
              </div>
            </div>
          )}

          {invite && (
            <div className="profile-invite">
              <label>Inviter sur un serveur</label>
              {servers.length === 0 && <div className="contact-empty" style={{ padding: 10 }}>Vous n’avez pas encore de serveur.</div>}
              {servers.map((s) => (
                <button key={s.id} className="invite-server-row" onClick={() => inviteToServer(s.id)}>
                  <span className="mutual-server" style={{ background: s.icon_url ? undefined : s.icon_color }}>{s.icon_url ? <img src={mediaUrl(s.icon_url)} alt="" /> : s.name.charAt(0).toUpperCase()}</span>
                  {s.name}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="modal-actions profile-actions">
          <button className="btn btn-ghost" onClick={onClose}>Fermer</button>
          {self ? (
            <>
              <button className="btn btn-ghost" onClick={onLogout}><Icon name="right-from-bracket" /> Se déconnecter</button>
              <button className="btn" onClick={() => { onEditProfile(); onClose(); }}><Icon name="pen" /> Modifier le profil</button>
            </>
          ) : (
            <>
              {rel === 'none' && <button className="btn btn-ghost" onClick={addContact}><Icon name="user-plus" /> Ajouter</button>}
              {rel === 'pending_in' && <button className="btn btn-ghost" onClick={acceptContact}><Icon name="check" /> Accepter</button>}
              <button className="btn btn-ghost" onClick={() => setInvite((v) => !v)}><Icon name="paper-plane" /> Inviter à ›</button>
              <button className="btn" onClick={() => { onMessage(u); onClose(); }}><Icon name="message" /> Message privé</button>
            </>
          )}
        </div>
      </Modal>

      {showContacts && (
        <FriendsListModal userId={u.id} title={self ? 'Vos contacts' : `Contacts de ${u.display_name}`}
          onOpenProfile={(id) => { setShowContacts(false); onOpenProfile(id); }} onClose={() => setShowContacts(false)} />
      )}
    </>
  );
}
