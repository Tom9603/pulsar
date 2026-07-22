import { useEffect, useState, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import Modal from './Modal.jsx';
import Avatar from './Avatar.jsx';
import Icon from './Icon.jsx';
import { ProCard } from './MemberModal.jsx';
import FriendsListModal from './FriendsListModal.jsx';
import CustomStatus from './CustomStatus.jsx';
import AvatarPickerModal from './AvatarPickerModal.jsx';
import { api, mediaUrl, uploadImage } from '../api.js';
import { fileToImageDataUrl } from '../imagefile.js';
import { openMenu } from '../contextmenu.js';
import { assetToDataUrl } from '../avatars.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useConfirm } from '../context/ConfirmContext.jsx';

const STATUS_LABEL = { online: 'En ligne', idle: 'Absent', dnd: 'Ne pas déranger', meeting: 'En réunion', invisible: 'Hors ligne' };
const STATUS_OPTIONS = [
  { value: 'online', label: 'En ligne' }, { value: 'idle', label: 'Absent' },
  { value: 'dnd', label: 'Ne pas déranger' }, { value: 'meeting', label: 'En réunion' }, { value: 'invisible', label: 'Hors ligne' },
];

function memberSince(created) {
  if (!created) return null;
  const d = new Date(created.replace(' ', 'T') + 'Z');
  if (isNaN(d)) return null;
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
}

/** Fiche de profil en modale (soi ou un tiers) : bannière, statut, mutuels, actions. */
export default function ProfileModal({ userId, servers = [], onClose, onMessage, onEditProfile, onLogout, onOpenProfile, onOpenServer, canAdmin = false, onOpenAdmin }) {
  const { user: me, updateUser } = useAuth();
  const confirm = useConfirm();
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [invite, setInvite] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [reportText, setReportText] = useState('');
  const [full, setFull] = useState(false);
  const [showContacts, setShowContacts] = useState(false);
  const [flash, setFlash] = useState('');
  const [serverTip, setServerTip] = useState(null); // { server, x, y } — mini-aperçu au survol
  const [avatarPickerOpen, setAvatarPickerOpen] = useState(false);
  const avatarInputRef = useRef(null);
  const bannerInputRef = useRef(null);

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
  const hasExtra = !!(u.company || u.location || u.website || u.email_pro || u.phone || (u.skills || '').trim() || u.cv_summary || u.cv_url || u.about || (u.socials && u.socials !== '{}'));
  const openMutualServer = (s) => { setServerTip(null); onClose(); onOpenServer?.(s.id); };

  const act = async (fn) => { try { await fn(); load(); } catch (e) { setFlash(e.message); setTimeout(() => setFlash(''), 2500); } };
  const changeStatus = async (status) => { const { user } = await api('/users/me', { method: 'PATCH', body: { status } }); updateUser(user); load(); };
  const removeContact = async () => {
    if (await confirm({
      title: `Retirer ${u.display_name} de vos contacts ?`,
      message: 'Vous ne serez plus en contact. Il faudra une nouvelle invitation pour le redevenir.',
      confirmLabel: 'Retirer', danger: true,
    })) act(() => api(`/friends/${u.id}`, { method: 'DELETE' }));
  };
  const block = async () => {
    if (await confirm({
      title: `Bloquer ${u.display_name} ?`,
      message: 'Cette personne ne pourra plus vous écrire ni vous inviter, et sera retirée de vos contacts. Vous pourrez la débloquer à tout moment.',
      confirmLabel: 'Bloquer', danger: true,
    })) act(() => api(`/friends/${u.id}/block`, { method: 'POST' }));
  };
  const unblock = () => act(() => api(`/friends/${u.id}/block`, { method: 'DELETE' }));
  const addContact = () => act(() => api('/friends/request', { method: 'POST', body: { username: u.username } }));
  const acceptContact = () => act(() => api(`/friends/${u.id}/accept`, { method: 'POST' }));
  const inviteToServer = (sid) => act(async () => { await api(`/servers/${sid}/invite-user`, { method: 'POST', body: { userId: u.id } }); setInvite(false); setFlash('Invitation envoyée.'); setTimeout(() => setFlash(''), 2500); });
  async function sendReport() { try { await api(`/users/${u.id}/report`, { method: 'POST', body: { reason: reportText.trim() } }); setReporting(false); setReportText(''); setFlash('Signalement envoyé. Merci.'); setTimeout(() => setFlash(''), 2500); } catch (e) { setFlash(e.message); } }

  // --- Modifier photo / bannière DIRECTEMENT depuis le résumé (soi-même) ---
  const patchMe = async (body) => { const { user } = await api('/users/me', { method: 'PATCH', body }); updateUser(user); await load(); };
  const flashOk = (msg) => { setFlash(msg); setTimeout(() => setFlash(''), 2000); };
  async function confirmReplacePhoto() {
    if (u.avatar_source !== 'upload' || !u.avatar_url) return true;
    return confirm({ title: 'Remplacer votre photo ?', message: 'Vous avez importé une photo depuis votre ordinateur. La remplacer la retirera de votre profil.', confirmLabel: 'Remplacer' });
  }
  async function onPickAvatarFile(e) {
    const file = e.target.files?.[0]; e.target.value = '';
    if (!file) return;
    if (file.size > 1.5 * 1024 * 1024) { flashOk('Image trop lourde (1,5 Mo max).'); return; }
    if (!(await confirmReplacePhoto())) return;
    try { const url = await uploadImage(await fileToImageDataUrl(file, { max: 256, square: true })); await patchMe({ avatar_url: url, avatar_source: 'upload' }); flashOk('Photo mise à jour.'); }
    catch (err) { flashOk(err.message); }
  }
  async function onPickAvatarPreset(assetUrl) {
    if (!(await confirmReplacePhoto())) return;
    try { const url = await uploadImage(await assetToDataUrl(assetUrl)); await patchMe({ avatar_url: url, avatar_source: 'preset' }); setAvatarPickerOpen(false); flashOk('Avatar mis à jour.'); }
    catch (err) { flashOk(err.message); }
  }
  async function onPickBannerFile(e) {
    const file = e.target.files?.[0]; e.target.value = '';
    if (!file) return;
    if (file.size > 3 * 1024 * 1024) { flashOk('Image trop lourde (3 Mo max).'); return; }
    try { const url = await uploadImage(await fileToImageDataUrl(file, { max: 1280, square: false })); await patchMe({ banner_url: url }); flashOk('Bannière mise à jour.'); }
    catch (err) { flashOk(err.message); }
  }
  const avatarMenu = (e) => {
    e.preventDefault(); e.stopPropagation();
    const items = [];
    if (u.avatar_url) items.push({ label: 'Afficher la photo', icon: 'eye', onClick: () => setFull(false) || window.open(mediaUrl(u.avatar_url), '_blank') });
    items.push({ label: u.avatar_url ? 'Changer la photo' : 'Ajouter une photo', icon: 'image', onClick: () => avatarInputRef.current?.click() });
    items.push({ label: 'Choisir un avatar', icon: 'user-astronaut', onClick: () => setAvatarPickerOpen(true) });
    if (u.avatar_url) items.push({ sep: true }, { label: 'Supprimer la photo', icon: 'trash', danger: true, onClick: () => patchMe({ avatar_url: null, avatar_source: null }) });
    openMenu(e.clientX, e.clientY, items);
  };
  const bannerMenu = (e) => {
    e.preventDefault(); e.stopPropagation();
    const items = [];
    items.push({ label: u.banner_url ? 'Changer la bannière' : 'Ajouter une bannière', icon: 'image', onClick: () => bannerInputRef.current?.click() });
    if (u.banner_url) items.push({ sep: true }, { label: 'Retirer la bannière', icon: 'trash', danger: true, onClick: () => patchMe({ banner_url: null }) });
    openMenu(e.clientX, e.clientY, items);
  };

  return (
    <>
      <Modal onClose={onClose} className="modal-profile">
        <div className={`profile-banner ${self ? 'is-self-editable' : ''}`} style={banner}>
          {self && (
            <>
              <input ref={avatarInputRef} type="file" accept="image/*" hidden onChange={onPickAvatarFile} />
              <input ref={bannerInputRef} type="file" accept="image/*,image/gif" hidden onChange={onPickBannerFile} />
              <button type="button" className="edit-pencil banner-pencil" title="Modifier la bannière" onClick={bannerMenu}><Icon name="pencil" /></button>
            </>
          )}
          {!self && (
            <div className="profile-dots-wrap">
              <button className="profile-dots" title="Plus d’options" onClick={() => setMenuOpen((v) => !v)}><Icon name="ellipsis" /></button>
              {menuOpen && (
                <div className="profile-menu" onMouseLeave={() => setMenuOpen(false)}>
                  {rel === 'friends' && <button onClick={() => { removeContact(); setMenuOpen(false); }}>Retirer de vos contacts</button>}
                  {rel === 'blocked'
                    ? <button onClick={() => { unblock(); setMenuOpen(false); }}>Débloquer</button>
                    : <button onClick={() => { block(); setMenuOpen(false); }}>Bloquer</button>}
                  <button className="danger" onClick={() => { setReporting(true); setMenuOpen(false); }}>Signaler</button>
                </div>
              )}
            </div>
          )}
          <div className="profile-avatar-wrap">
            <Avatar user={u} size={84} status={STATUS_LABEL[u.status] ? u.status : 'offline'} />
            {self && <button type="button" className="edit-pencil avatar-pencil" title="Modifier la photo" onClick={avatarMenu}><Icon name="pencil" /></button>}
          </div>
        </div>

        <div className="profile-body">
          <div className="profile-toprow">
            <div className="profile-id">
              <div className="profile-idline">
                <h2>{u.display_name}</h2>
                {u.pronouns && <span className="profile-pronouns">{u.pronouns}</span>}
              </div>
              <div className="profile-sub">@{u.username}</div>
              {u.headline && <div className="profile-headline">{u.headline}</div>}
              <CustomStatus user={u} className="cs-profile" />
            </div>
            <div className="profile-primary">
              {self
                ? <button className="btn" onClick={() => { onEditProfile(); onClose(); }}><Icon name="pen" /> Modifier le profil</button>
                : <button className="btn" onClick={() => { onMessage(u); onClose(); }}><Icon name="message" /> Message privé</button>}
            </div>
          </div>

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
          {!self && (
            <button className="profile-link-btn" onClick={() => setFull((v) => !v)}>
              <Icon name={full ? 'chevron-up' : 'id-card'} /> {full ? 'Réduire le profil' : 'Voir le profil complet'}
            </button>
          )}

          {(rel === 'pending_in') && <div className="profile-pending">Cette personne souhaite vous ajouter.</div>}

          {(full || self) && <ProCard u={u} />}
          {(full || self) && u.about && <div className="field"><label>À propos</label><p style={{ fontSize: 14 }}>{u.about}</p></div>}
          {full && !self && !hasExtra && <p className="profile-empty-extra">Ce membre n'a pas encore renseigné d'informations supplémentaires.</p>}

          {!self && data.mutual_servers.length > 0 && (
            <div className="profile-mutual">
              <label>Serveurs en commun · {data.mutual_servers.length}</label>
              <div className="mutual-servers">
                {data.mutual_servers.map((s) => (
                  <button key={s.id} className="mutual-server clickable" style={{ background: s.icon_url ? undefined : s.icon_color }}
                    onClick={() => openMutualServer(s)}
                    onMouseEnter={(e) => setServerTip({ server: s, x: e.clientX, y: e.clientY })}
                    onMouseMove={(e) => setServerTip((t) => (t && t.server.id === s.id ? { ...t, x: e.clientX, y: e.clientY } : t))}
                    onMouseLeave={() => setServerTip(null)}>
                    {s.icon_url ? <img src={mediaUrl(s.icon_url)} alt="" /> : s.name.charAt(0).toUpperCase()}
                  </button>
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
          <div className="pm-left">
            {self ? (
              <>
                {canAdmin && <button className="btn btn-ghost pm-admin" onClick={() => onOpenAdmin?.()}><Icon name="shield-halved" /> Administration</button>}
                <button className="btn btn-ghost pm-logout" onClick={onLogout}><Icon name="right-from-bracket" /> Se déconnecter</button>
              </>
            ) : (
              <>
                {rel === 'none' && <button className="btn btn-ghost" onClick={addContact}><Icon name="user-plus" /> Ajouter en contact</button>}
                {rel === 'pending_in' && <button className="btn btn-ghost" onClick={acceptContact}><Icon name="check" /> Accepter la demande</button>}
                <button className="btn btn-ghost" onClick={() => setInvite((v) => !v)}><Icon name="paper-plane" /> Inviter à ›</button>
              </>
            )}
          </div>
          <button className="btn btn-ghost" onClick={onClose}>Fermer</button>
        </div>
      </Modal>

      {serverTip && createPortal(
        <div className="server-tip" style={serverTip.x > window.innerWidth - 250
          ? { right: window.innerWidth - serverTip.x + 16, top: serverTip.y + 14 }
          : { left: serverTip.x + 16, top: serverTip.y + 14 }}>
          <span className="server-tip-icon" style={{ background: serverTip.server.icon_url ? undefined : serverTip.server.icon_color }}>
            {serverTip.server.icon_url ? <img src={mediaUrl(serverTip.server.icon_url)} alt="" /> : serverTip.server.name.charAt(0).toUpperCase()}
          </span>
          <div className="server-tip-info">
            <div className="server-tip-name">{serverTip.server.name}</div>
            <div className="server-tip-sub">{serverTip.server.member_count ? `${serverTip.server.member_count} membre${serverTip.server.member_count > 1 ? 's' : ''}` : 'Serveur en commun'} · cliquez pour ouvrir</div>
          </div>
        </div>,
        document.body
      )}

      {showContacts && (
        <FriendsListModal userId={u.id} title={self ? 'Vos contacts' : `Contacts de ${u.display_name}`}
          onOpenProfile={(id) => { setShowContacts(false); onOpenProfile(id); }} onClose={() => setShowContacts(false)} />
      )}

      {avatarPickerOpen && <AvatarPickerModal onPick={onPickAvatarPreset} onClose={() => setAvatarPickerOpen(false)} />}
    </>
  );
}
