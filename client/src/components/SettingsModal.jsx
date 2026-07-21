import { useEffect, useState } from 'react';
import Modal from './Modal.jsx';
import ConfirmModal from './ConfirmModal.jsx';
import Avatar from './Avatar.jsx';
import Icon from './Icon.jsx';
import { api, uploadFile, mediaUrl, downloadFile } from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { isSoundEnabled, setSoundEnabled, isDesktopEnabled, setDesktopEnabled,
  isQuietEnabled, setQuietEnabled, getQuietFrom, setQuietFrom, getQuietTo, setQuietTo, isQuietWeekend, setQuietWeekend } from '../notify.js';
import AudioSettingsPanel from './AudioSettingsPanel.jsx';
import { loadAppearance, saveAppearance, applyAppearance, ACCENTS } from '../theme.js';
import Logo from './Logo.jsx';
import wordUrl from '../assets/pulsar-wordmark.png';
import { useUpdate, openUpdate } from '../update.js';
import TermsModal from './TermsModal.jsx';
import { LegalNotice } from '../legal.jsx';

const COLORS = ['#5865F2', '#EB459E', '#57F287', '#FAA61A', '#ED4245', '#3498DB', '#9B59B6', '#14b8a6', '#e67e22'];
const STATUSES = [
  { value: 'online', label: 'En ligne' },
  { value: 'idle', label: 'Absent' },
  { value: 'dnd', label: 'Ne pas déranger' },
  { value: 'meeting', label: 'En réunion' },
  { value: 'invisible', label: 'Hors ligne' },
];

const MENU = [
  { group: 'Application', items: [
    { id: 'appearance', icon: 'palette', label: 'Apparence' },
    { id: 'notif', icon: 'bell', label: 'Notifications' },
    { id: 'audio', icon: 'sliders', label: 'Audio et vocal' },
  ] },
  { group: 'Compte', items: [
    { id: 'privacy', icon: 'shield-halved', label: 'Confidentialité' },
    { id: 'account', icon: 'lock', label: 'Sécurité et compte' },
  ] },
  { group: 'Aide', items: [{ id: 'about', icon: 'circle-info', label: 'À propos et aide' }] },
];

// Questions fréquentes (réponses repliables).
const FAQ = [
  { q: 'Comment créer un serveur ou un salon ?', a: 'Depuis la barre de gauche, utilisez le bouton « plus » pour créer un serveur. À l’intérieur, ajoutez des salons écrits ou vocaux selon vos besoins.' },
  { q: 'Comment passer un appel ou partager mon écran ?', a: 'Rejoignez un salon vocal, ou lancez un appel depuis une conversation privée. Pendant l’appel, vous pouvez activer votre caméra ou partager votre écran.' },
  { q: 'Comment programmer un message ?', a: 'Dans la zone de saisie, cliquez sur l’icône horloge, écrivez votre message, puis choisissez la date et l’heure d’envoi. Il partira tout seul, même si vous êtes déconnecté.' },
  { q: 'Comment changer le thème ou la couleur ?', a: 'Réglages, rubrique Apparence : thème clair ou sombre, couleur d’accent, densité des messages et taille de l’affichage.' },
  { q: 'L’assistant IA, comment ça marche ?', a: 'S’il est activé, des boutons étoile apparaissent pour résumer un salon ou reformuler un message. Chaque personne dispose d’un nombre d’actions limité par jour.' },
  { q: 'Mes échanges sont-ils privés ?', a: 'Pulsar fonctionne sur votre propre serveur : vos données restent chez vous et ne transitent pas par un service tiers.' },
];

const THEMES = [{ v: 'system', l: 'Système' }, { v: 'light', l: 'Clair' }, { v: 'dark', l: 'Sombre' }];
const DENSITIES = [{ v: 'cozy', l: 'Aéré' }, { v: 'compact', l: 'Compact' }];
const SIZES = [{ v: 'petit', l: 'Petit' }, { v: 'normal', l: 'Normal' }, { v: 'grand', l: 'Grand' }];

/** Réglages : profil, fiche pro (+ CV), notifications, compte · en menus. */
export default function SettingsModal({ onClose }) {
  const { user, updateUser, logout } = useAuth();
  const [menu, setMenu] = useState('notif');
  const up = useUpdate();

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
  const [deactivatePw, setDeactivatePw] = useState('');
  const [confirmDeactivate, setConfirmDeactivate] = useState(false);
  const [accountMsg, setAccountMsg] = useState('');
  // Sessions actives (appareils connectés)
  const [sessions, setSessions] = useState([]);
  const loadSessions = () => api('/sessions').then(({ sessions: s }) => setSessions(s)).catch(() => {});
  useEffect(() => { if (menu === 'account') loadSessions(); }, [menu]);

  async function revokeSession(s) {
    try {
      await api(`/sessions/${s.id}`, { method: 'DELETE' });
      if (s.current) { logout(); return; } // on s'est déconnecté soi-même
      loadSessions();
    } catch (e) { setAccountMsg(e.message); }
  }
  const [termsTab, setTermsTab] = useState(null); // consultation des textes légaux
  const [exporting, setExporting] = useState(false);
  async function exportData() {
    setExporting(true);
    setAccountMsg('');
    try {
      await downloadFile('/privacy/export', 'pulsar-mes-donnees.json');
    } catch (e) { setAccountMsg(e.message); }
    finally { setExporting(false); }
  }

  async function revokeOthers() {
    try {
      const { count } = await api('/sessions/revoke-others', { method: 'POST' });
      setAccountMsg(count ? `${count} appareil${count > 1 ? 's' : ''} déconnecté${count > 1 ? 's' : ''}.` : 'Aucun autre appareil connecté.');
      loadSessions();
    } catch (e) { setAccountMsg(e.message); }
  }
  // Notifications (préférences locales)
  const [sound, setSound] = useState(isSoundEnabled());
  const [desktop, setDesktop] = useState(isDesktopEnabled());
  // Heures calmes (préférences locales)
  const [quietOn, setQuietOn] = useState(isQuietEnabled());
  const [quietFrom, setQuietFromV] = useState(getQuietFrom());
  const [quietTo, setQuietToV] = useState(getQuietTo());
  const [quietWeekend, setQuietWeekendV] = useState(isQuietWeekend());
  // Confidentialité
  const [privacyDm, setPrivacyDm] = useState(user.privacy_dm || 'everyone');
  const [privacyFriend, setPrivacyFriend] = useState(user.privacy_friend || 'everyone');
  const [hidePresence, setHidePresence] = useState(!!user.hide_presence);
  // Apparence (préférences locales, appliquées en direct)
  const [appr, setAppr] = useState(loadAppearance());
  function changeAppr(patch) {
    setAppr((a) => { const next = { ...a, ...patch }; saveAppearance(next); applyAppearance(next); return next; });
  }

  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmDelAccount, setConfirmDelAccount] = useState(false);

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
          privacy_dm: privacyDm, privacy_friend: privacyFriend, hide_presence: hidePresence,
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
      setAccountMsg('Mot de passe modifié.');
      setOldPw(''); setNewPw('');
    } catch (e) { setAccountMsg(e.message); }
  }

  async function deleteAccount() {
    try {
      await api('/users/me', { method: 'DELETE', body: { password: delPw } });
      logout();
    } catch (e) { setAccountMsg(e.message); }
  }

  async function deactivateAccount() {
    try {
      await api('/users/me/deactivate', { method: 'POST', body: { password: deactivatePw } });
      logout();
    } catch (e) { setAccountMsg(e.message); }
  }

  const showFooter = menu === 'identity' || menu === 'pro' || menu === 'privacy';

  return (
    <Modal onClose={onClose} className="modal-settings">
      <div className="settings-layout">
        <aside className="settings-menu">
          <div className="settings-menu-title">Réglages</div>
          {MENU.map((g) => (
            <div key={g.group} className="settings-menu-group">
              <div className="settings-menu-label">{g.group}</div>
              {g.items.map((it) => (
                <button key={it.id} className={menu === it.id ? 'active' : ''} onClick={() => setMenu(it.id)}><Icon name={it.icon} /> {it.label}</button>
              ))}
            </div>
          ))}
        </aside>

        <div className="settings-content">
          <div className="settings-scroll">
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
                    <a href={mediaUrl(cvUrl)} target="_blank" rel="noreferrer"><Icon name="file-lines" /> {cvName || 'Voir le CV'}</a>
                    <button type="button" onClick={() => { setCvUrl(''); setCvName(''); }}>Retirer</button>
                  </div>
                )}
              </div>
            </>
          )}

          {menu === 'appearance' && (
            <>
              <h2>Apparence</h2>
              <p className="modal-sub">Personnalisez l’affichage. Réglages enregistrés sur cet appareil, appliqués aussitôt.</p>

              <div className="appr-group">
                <label>Thème</label>
                <div className="appr-choices">
                  {THEMES.map((t) => (
                    <button type="button" key={t.v} className={`appr-choice ${appr.theme === t.v ? 'active' : ''}`} onClick={() => changeAppr({ theme: t.v })}>{t.l}</button>
                  ))}
                </div>
              </div>

              <div className="appr-group">
                <label>Couleur d’accent</label>
                <div className="appr-accents">
                  {Object.entries(ACCENTS).map(([key, a]) => (
                    <button type="button" key={key} title={a.label} className={`appr-accent ${appr.accent === key ? 'active' : ''}`} style={{ background: `linear-gradient(135deg, ${a.accent}, ${a.accent2})` }} onClick={() => changeAppr({ accent: key })} />
                  ))}
                </div>
              </div>

              <div className="appr-group">
                <label>Densité des messages</label>
                <div className="appr-choices">
                  {DENSITIES.map((d) => (
                    <button type="button" key={d.v} className={`appr-choice ${appr.density === d.v ? 'active' : ''}`} onClick={() => changeAppr({ density: d.v })}>{d.l}</button>
                  ))}
                </div>
              </div>

              <div className="appr-group">
                <label>Taille de l’affichage</label>
                <div className="appr-choices">
                  {SIZES.map((s) => (
                    <button type="button" key={s.v} className={`appr-choice ${appr.textSize === s.v ? 'active' : ''}`} onClick={() => changeAppr({ textSize: s.v })}>{s.l}</button>
                  ))}
                </div>
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

              <div className="quiet-block">
                <label className="settings-toggle">
                  <input type="checkbox" checked={quietOn} onChange={(e) => { setQuietOn(e.target.checked); setQuietEnabled(e.target.checked); }} />
                  <span>Heures calmes (couper le son et les notifications sur une plage)</span>
                </label>
                {quietOn && (
                  <div className="quiet-rows">
                    <div className="quiet-time">
                      <label>De</label>
                      <input type="time" value={quietFrom} onChange={(e) => { setQuietFromV(e.target.value); setQuietFrom(e.target.value); }} />
                    </div>
                    <div className="quiet-time">
                      <label>À</label>
                      <input type="time" value={quietTo} onChange={(e) => { setQuietToV(e.target.value); setQuietTo(e.target.value); }} />
                    </div>
                    <label className="settings-toggle quiet-weekend">
                      <input type="checkbox" checked={quietWeekend} onChange={(e) => { setQuietWeekendV(e.target.checked); setQuietWeekend(e.target.checked); }} />
                      <span>Tout le week-end</span>
                    </label>
                  </div>
                )}
              </div>
            </>
          )}

          {menu === 'audio' && (
            <>
              <h2>Audio et vocal</h2>
              <p className="modal-sub">Micro, sortie, volumes et tests. Réglages enregistrés sur cet appareil.</p>
              <AudioSettingsPanel />
            </>
          )}

          {menu === 'privacy' && (
            <>
              <h2>Confidentialité</h2>
              <p className="modal-sub">Choisissez qui peut vous contacter. Pour masquer votre présence, passez votre statut sur « Hors ligne ».</p>

              <div className="appr-group">
                <label>Qui peut m’envoyer des messages privés</label>
                <div className="appr-choices">
                  <button type="button" className={`appr-choice ${privacyDm === 'everyone' ? 'active' : ''}`} onClick={() => setPrivacyDm('everyone')}>Tout le monde</button>
                  <button type="button" className={`appr-choice ${privacyDm === 'friends' ? 'active' : ''}`} onClick={() => setPrivacyDm('friends')}>Mes contacts uniquement</button>
                </div>
              </div>

              <div className="appr-group">
                <label>Qui peut m’ajouter en ami</label>
                <div className="appr-choices">
                  <button type="button" className={`appr-choice ${privacyFriend === 'everyone' ? 'active' : ''}`} onClick={() => setPrivacyFriend('everyone')}>Tout le monde</button>
                  <button type="button" className={`appr-choice ${privacyFriend === 'none' ? 'active' : ''}`} onClick={() => setPrivacyFriend('none')}>Personne</button>
                </div>
              </div>
            </>
          )}

          {menu === 'about' && (
            <>
              <h2>À propos et aide</h2>

              <div className="about-card">
                <Logo size={44} wordmark={false} />
                <div className="about-meta">
                  <img className="brand-word-img about-word" src={wordUrl} alt="Pulsar" style={{ height: 18 }} />
                  <div className="about-version">Version {up.currentVersion} · {up.isDesktop ? 'Application de bureau' : 'Version web'}</div>
                  {up.available && up.version && (
                    <button type="button" className="about-update" onClick={() => { openUpdate(); onClose(); }}><Icon name="rotate" /> Mettre à jour ({up.version})</button>
                  )}
                </div>
              </div>

              <h3 className="about-sub">Questions fréquentes</h3>
              <div className="faq">
                {FAQ.map((item) => (
                  <details key={item.q}>
                    <summary>{item.q}</summary>
                    <p>{item.a}</p>
                  </details>
                ))}
              </div>

              <h3 className="about-sub">Mentions légales</h3>
              <div className="legal">
                <LegalNotice />
              </div>

              <h3 className="about-sub">Conditions et données personnelles</h3>
              <div className="about-legal-links">
                <button className="btn btn-ghost" onClick={() => setTermsTab('terms')}>Conditions générales d’utilisation</button>
                <button className="btn btn-ghost" onClick={() => setTermsTab('privacy')}>Politique de confidentialité</button>
              </div>
            </>
          )}

          {menu === 'account' && (
            <>
              <h2>Sécurité et compte</h2>
              {accountMsg && <div className="error-msg">{accountMsg}</div>}
              <div className="field">
                <label>Changer le mot de passe</label>
                <input type="password" placeholder="Mot de passe actuel" value={oldPw} onChange={(e) => setOldPw(e.target.value)} style={{ marginBottom: 8 }} />
                <input type="password" placeholder="Nouveau mot de passe" value={newPw} onChange={(e) => setNewPw(e.target.value)} />
                <button className="btn" style={{ width: 'auto', padding: '8px 16px', marginTop: 8 }} onClick={changePassword}>Mettre à jour</button>
              </div>
              <div className="field" style={{ marginTop: 24, borderTop: '1px solid var(--border)', paddingTop: 16 }}>
                <label>Appareils connectés</label>
                <p className="field-hint" style={{ marginBottom: 10 }}>Les appareils actuellement connectés à votre compte. En cas de doute, déconnectez-les.</p>
                <div className="sess-list">
                  {sessions.length === 0 && <p className="sess-empty">Chargement…</p>}
                  {sessions.map((s) => (
                    <div className="sess-item" key={s.id}>
                      <span className="sess-ico"><Icon name={s.label === 'Application de bureau' ? 'desktop' : 'globe'} /></span>
                      <span className="sess-main">
                        <span className="sess-label">{s.label}{s.current && <span className="sess-current">Cet appareil</span>}</span>
                        <span className="sess-seen">Vu le {new Date(s.last_seen * 1000).toLocaleString('fr-FR', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}</span>
                      </span>
                      <button type="button" className="sess-revoke" title="Déconnecter cet appareil" onClick={() => revokeSession(s)}><Icon name="right-from-bracket" /></button>
                    </div>
                  ))}
                </div>
                {sessions.length > 1 && (
                  <button className="btn btn-ghost" style={{ width: 'auto', padding: '8px 16px', marginTop: 10 }} onClick={revokeOthers}>Déconnecter tous les autres appareils</button>
                )}
              </div>

              <div className="field" style={{ marginTop: 24, borderTop: '1px solid var(--border)', paddingTop: 16 }}>
                <label>Mes données</label>
                <p className="field-hint" style={{ marginBottom: 10 }}>
                  Récupérez l’ensemble des données associées à votre compte dans un fichier :
                  profil, messages, contacts, tâches et appareils connectés. C’est votre droit
                  d’accès et de portabilité.
                </p>
                <button className="btn btn-ghost" style={{ width: 'auto', padding: '8px 16px' }} disabled={exporting} onClick={exportData}>
                  <Icon name="download" /> {exporting ? 'Préparation…' : 'Exporter mes données'}
                </button>
              </div>

              <div className="field" style={{ marginTop: 24, borderTop: '1px solid var(--border)', paddingTop: 16 }}>
                <label>Désactiver temporairement mon compte</label>
                <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 8 }}>Votre compte est mis en pause : vous n’apparaissez plus en ligne. Il se réactive automatiquement à votre prochaine connexion. Rien n’est supprimé.</p>
                <input type="password" placeholder="Confirmez votre mot de passe" value={deactivatePw} onChange={(e) => setDeactivatePw(e.target.value)} />
                <button className="btn btn-ghost" style={{ width: 'auto', padding: '8px 16px', marginTop: 8 }} onClick={() => setConfirmDeactivate(true)}>Désactiver mon compte</button>
              </div>

              <div className="field" style={{ marginTop: 24, borderTop: '1px solid var(--border)', paddingTop: 16 }}>
                <label style={{ color: 'var(--danger)' }}>Suppression de compte</label>
                <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 8 }}>Supprimer votre compte efface tout définitivement.</p>
                <input type="password" placeholder="Confirmez votre mot de passe" value={delPw} onChange={(e) => setDelPw(e.target.value)} />
                <button className="btn btn-danger" style={{ width: 'auto', padding: '8px 16px', marginTop: 8 }} onClick={() => setConfirmDelAccount(true)}>Supprimer mon compte</button>
              </div>
            </>
          )}
          </div>

          <div className="modal-actions">
            <button className="btn btn-ghost" onClick={onClose}>Fermer</button>
            {showFooter && <button className="btn" onClick={save} disabled={busy}>{busy ? 'Enregistrement…' : 'Enregistrer'}</button>}
          </div>
        </div>
      </div>

      {termsTab && <TermsModal tab={termsTab} onClose={() => setTermsTab(null)} />}

      {confirmDeactivate && (
        <ConfirmModal
          title="Désactiver le compte ?"
          message="Votre compte sera mis en pause et vous serez déconnecté. Il se réactivera automatiquement dès votre prochaine connexion. Aucune donnée n’est supprimée."
          confirmLabel="Désactiver"
          onConfirm={deactivateAccount}
          onClose={() => setConfirmDeactivate(false)}
        />
      )}

      {confirmDelAccount && (
        <ConfirmModal
          title="Supprimer le compte"
          message="Votre compte et toutes vos données seront effacés définitivement. Cette action est irréversible."
          confirmLabel="Supprimer mon compte" danger
          onConfirm={deleteAccount}
          onClose={() => setConfirmDelAccount(false)}
        />
      )}
    </Modal>
  );
}
