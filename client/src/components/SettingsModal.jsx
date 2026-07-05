import { useState } from 'react';
import Modal from './Modal.jsx';
import Avatar from './Avatar.jsx';
import { api, uploadFile, mediaUrl } from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { isSoundEnabled, setSoundEnabled, isDesktopEnabled, setDesktopEnabled } from '../notify.js';

const COLORS = ['#5865F2', '#EB459E', '#57F287', '#FAA61A', '#ED4245', '#3498DB', '#9B59B6', '#14b8a6', '#e67e22'];
const STATUSES = [
  { value: 'online', label: '🟢 En ligne' },
  { value: 'idle', label: '🌙 Absent' },
  { value: 'dnd', label: '⛔ Ne pas déranger' },
  { value: 'invisible', label: '⚪ Invisible' },
];

const MENU = [
  { group: 'Mon profil', items: [{ id: 'identity', label: '🪪 Identité' }, { id: 'pro', label: '💼 Fiche professionnelle' }] },
  { group: 'Application', items: [{ id: 'notif', label: '🔔 Notifications' }] },
  { group: 'Compte', items: [{ id: 'account', label: '🔐 Sécurité & compte' }] },
];

/** Réglages : profil, fiche pro (+ CV), notifications, compte — en menus. */
export default function SettingsModal({ onClose }) {
  const { user, updateUser, logout } = useAuth();
  const [menu, setMenu] = useState('identity');

  // Profil
  const [displayName, setDisplayName] = useState(user.display_name);
  const [avatarColor, setAvatarColor] = useState(user.avatar_color);
  const [avatarUrl, setAvatarUrl] = useState(user.avatar_url || '');
  const [about, setAbout] = useState(user.about || '');
  const [status, setStatus] = useState(user.status);
  // Fiche pro
  const [headline, setHeadline] = useState(user.headline || '');
  const [company, setCompany] = useState(user.company || '');
  const [location, setLocation] = useState(user.location || '');
  const [website, setWebsite] = useState(user.website || '');
  const [emailPro, setEmailPro] = useState(user.email_pro || '');
  const [phone, setPhone] = useState(user.phone || '');
  const [skills, setSkills] = useState(user.skills || '');
  const [cvUrl, setCvUrl] = useState(user.cv_url || '');
  const [cvName, setCvName] = useState(user.cv_name || '');
  const [cvSummary, setCvSummary] = useState(user.cv_summary || '');
  // Compte
  const [oldPw, setOldPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [delPw, setDelPw] = useState('');
  const [accountMsg, setAccountMsg] = useState('');
  // Notifications (préférences locales)
  const [sound, setSound] = useState(isSoundEnabled());
  const [desktop, setDesktop] = useState(isDesktopEnabled());

  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const preview = { display_name: displayName, avatar_color: avatarColor, avatar_url: avatarUrl, username: user.username };

  function onPickImage(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 1.5 * 1024 * 1024) { setError('Image trop lourde (1,5 Mo max).'); return; }
    const reader = new FileReader();
    reader.onload = () => setAvatarUrl(reader.result);
    reader.readAsDataURL(file);
  }

  async function onPickCv(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) { setError('CV trop lourd (8 Mo max).'); return; }
    setError('');
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const { url, name } = await uploadFile(reader.result, file.name);
        setCvUrl(url); setCvName(name || file.name);
      } catch (err) { setError(err.message); }
    };
    reader.readAsDataURL(file);
  }

  async function save() {
    setError(''); setBusy(true);
    try {
      const { user: updated } = await api('/users/me', {
        method: 'PATCH',
        body: {
          display_name: displayName, avatar_color: avatarColor, avatar_url: avatarUrl || null, about, status,
          headline, company, location, website, email_pro: emailPro, phone, skills,
          cv_url: cvUrl || null, cv_name: cvName || null, cv_summary: cvSummary,
        },
      });
      updateUser(updated);
      onClose();
    } catch (err) { setError(err.message); setBusy(false); }
  }

  async function changePassword() {
    setAccountMsg('');
    try {
      await api('/users/me/password', { method: 'PATCH', body: { old_password: oldPw, new_password: newPw } });
      setAccountMsg('Mot de passe modifié ✅');
      setOldPw(''); setNewPw('');
    } catch (e) { setAccountMsg(e.message); }
  }

  async function deleteAccount() {
    if (!confirm('Supprimer définitivement votre compte ? Cette action est irréversible.')) return;
    try {
      await api('/users/me', { method: 'DELETE', body: { password: delPw } });
      logout();
    } catch (e) { setAccountMsg(e.message); }
  }

  const showFooter = menu === 'identity' || menu === 'pro';

  return (
    <Modal onClose={onClose} className="modal-settings">
      <div className="settings-layout">
        <aside className="settings-menu">
          <div className="settings-menu-title">Réglages</div>
          {MENU.map((g) => (
            <div key={g.group} className="settings-menu-group">
              <div className="settings-menu-label">{g.group}</div>
              {g.items.map((it) => (
                <button key={it.id} className={menu === it.id ? 'active' : ''} onClick={() => setMenu(it.id)}>{it.label}</button>
              ))}
            </div>
          ))}
        </aside>

        <div className="settings-content">
          {error && <div className="error-msg">{error}</div>}

          {menu === 'identity' && (
            <>
              <h2>Identité</h2>
              <p className="modal-sub">Ces informations sont visibles par les autres membres.</p>
              <div className="profile-preview">
                <Avatar user={preview} size={64} status={status} />
                <div>
                  <div style={{ fontWeight: 700, fontSize: 18 }}>{displayName || user.username}</div>
                  <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>@{user.username}</div>
                </div>
              </div>
              <div className="field">
                <label>Nom affiché</label>
                <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
              </div>
              <div className="field">
                <label>Couleur d’avatar</label>
                <div className="color-swatches">
                  {COLORS.map((c) => (
                    <div key={c} className={`color-swatch ${c === avatarColor ? 'selected' : ''}`} style={{ background: c }} onClick={() => setAvatarColor(c)} />
                  ))}
                </div>
              </div>
              <div className="field">
                <label>Image d’avatar (optionnel)</label>
                <input type="file" accept="image/*" onChange={onPickImage} />
                {avatarUrl && (
                  <button type="button" className="btn btn-ghost" style={{ width: 'auto', padding: '6px 12px', marginTop: 8, fontSize: 13 }} onClick={() => setAvatarUrl('')}>Retirer l’image</button>
                )}
              </div>
              <div className="field">
                <label>Statut</label>
                <select value={status} onChange={(e) => setStatus(e.target.value)}>
                  {STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </div>
              <div className="field">
                <label>À propos de moi</label>
                <textarea rows={3} maxLength={300} value={about} onChange={(e) => setAbout(e.target.value)} placeholder="Présentez-vous en quelques mots…" />
              </div>
            </>
          )}

          {menu === 'pro' && (
            <>
              <h2>Fiche professionnelle</h2>
              <p className="modal-sub">Votre carte de visite : poste, entreprise, coordonnées, CV. Visible sur votre profil.</p>
              <div className="settings-two">
                <div className="field">
                  <label>Poste / intitulé</label>
                  <input value={headline} onChange={(e) => setHeadline(e.target.value)} placeholder="ex. Développeuse web, Gérant…" />
                </div>
                <div className="field">
                  <label>Entreprise</label>
                  <input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="ex. Studio Pulsar" />
                </div>
                <div className="field">
                  <label>Localisation</label>
                  <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="ex. Lyon, France" />
                </div>
                <div className="field">
                  <label>Site / lien</label>
                  <input value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="ex. https://…" />
                </div>
                <div className="field">
                  <label>Email professionnel</label>
                  <input value={emailPro} onChange={(e) => setEmailPro(e.target.value)} placeholder="ex. contact@…" />
                </div>
                <div className="field">
                  <label>Téléphone</label>
                  <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="ex. 06 12 34 56 78" />
                </div>
              </div>
              <div className="field">
                <label>Compétences (séparées par des virgules)</label>
                <input value={skills} onChange={(e) => setSkills(e.target.value)} placeholder="ex. React, Gestion de projet, Anglais" />
              </div>
              <div className="field">
                <label>CV résumé (en bref)</label>
                <textarea rows={3} maxLength={800} value={cvSummary} onChange={(e) => setCvSummary(e.target.value)} placeholder="Votre parcours en quelques lignes…" />
              </div>
              <div className="field">
                <label>CV joint (PDF ou image, 8 Mo max)</label>
                <input type="file" accept=".pdf,image/*" onChange={onPickCv} />
                {cvUrl && (
                  <div className="cv-chip">
                    <a href={mediaUrl(cvUrl)} target="_blank" rel="noreferrer">📄 {cvName || 'Voir le CV'}</a>
                    <button type="button" onClick={() => { setCvUrl(''); setCvName(''); }}>Retirer</button>
                  </div>
                )}
              </div>
            </>
          )}

          {menu === 'notif' && (
            <>
              <h2>Notifications</h2>
              <p className="modal-sub">Réglages enregistrés sur cet appareil.</p>
              <label className="settings-toggle">
                <input type="checkbox" checked={sound} onChange={(e) => { setSound(e.target.checked); setSoundEnabled(e.target.checked); }} />
                <span>Son à la réception d’un message ou d’une tâche</span>
              </label>
              <label className="settings-toggle">
                <input type="checkbox" checked={desktop} onChange={(e) => { setDesktop(e.target.checked); setDesktopEnabled(e.target.checked); if (e.target.checked && typeof Notification !== 'undefined') Notification.requestPermission().catch(() => {}); }} />
                <span>Notifications sur le bureau</span>
              </label>
            </>
          )}

          {menu === 'account' && (
            <>
              <h2>Sécurité &amp; compte</h2>
              {accountMsg && <div className="error-msg">{accountMsg}</div>}
              <div className="field">
                <label>Changer le mot de passe</label>
                <input type="password" placeholder="Mot de passe actuel" value={oldPw} onChange={(e) => setOldPw(e.target.value)} style={{ marginBottom: 8 }} />
                <input type="password" placeholder="Nouveau mot de passe" value={newPw} onChange={(e) => setNewPw(e.target.value)} />
                <button className="btn" style={{ width: 'auto', padding: '8px 16px', marginTop: 8 }} onClick={changePassword}>Mettre à jour</button>
              </div>
              <div className="field" style={{ marginTop: 24, borderTop: '1px solid var(--border)', paddingTop: 16 }}>
                <label style={{ color: 'var(--danger)' }}>Zone dangereuse</label>
                <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 8 }}>Supprimer votre compte efface tout définitivement.</p>
                <input type="password" placeholder="Confirmez votre mot de passe" value={delPw} onChange={(e) => setDelPw(e.target.value)} />
                <button className="btn btn-danger" style={{ width: 'auto', padding: '8px 16px', marginTop: 8 }} onClick={deleteAccount}>Supprimer mon compte</button>
              </div>
            </>
          )}

          <div className="modal-actions">
            <button className="btn btn-ghost" onClick={onClose}>Fermer</button>
            {showFooter && <button className="btn" onClick={save} disabled={busy}>{busy ? 'Enregistrement…' : 'Enregistrer'}</button>}
          </div>
        </div>
      </div>
    </Modal>
  );
}
