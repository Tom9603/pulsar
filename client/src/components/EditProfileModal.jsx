import { useState, useRef } from 'react';
import Modal from './Modal.jsx';
import Avatar from './Avatar.jsx';
import Icon from './Icon.jsx';
import EmojiPicker from './EmojiPicker.jsx';
import { api, uploadImage, uploadFile, mediaUrl } from '../api.js';
import { fileToImageDataUrl } from '../imagefile.js';
import { openMenu } from '../contextmenu.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useConfirm } from '../context/ConfirmContext.jsx';
import { assetToDataUrl } from '../avatars.js';
import AvatarPickerModal from './AvatarPickerModal.jsx';

const BANNERS = ['#1e1b4b', '#0f172a', '#3b0764', '#082f49', '#4a044e', '#1a2e05', '#450a0a', '#111827'];

// Suggestions de localisation (grandes villes, saisie libre possible). Sert de
// liste d'auto-complétion native, sans service externe.
const LOCATIONS = [
  'Paris, France', 'Lyon, France', 'Marseille, France', 'Toulouse, France', 'Bordeaux, France',
  'Lille, France', 'Nantes, France', 'Nice, France', 'Strasbourg, France', 'Montpellier, France',
  'Rennes, France', 'Grenoble, France', 'Rouen, France', 'Reims, France', 'Brest, France',
  'Bretagne, France', 'Île-de-France, France', 'Occitanie, France', 'Nouvelle-Aquitaine, France',
  'Bruxelles, Belgique', 'Genève, Suisse', 'Lausanne, Suisse', 'Luxembourg, Luxembourg',
  'Montréal, Canada', 'Québec, Canada', 'Londres, Royaume-Uni', 'Dublin, Irlande',
  'Madrid, Espagne', 'Barcelone, Espagne', 'Lisbonne, Portugal', 'Porto, Portugal',
  'Berlin, Allemagne', 'Munich, Allemagne', 'Amsterdam, Pays-Bas', 'Rome, Italie', 'Milan, Italie',
  'Vienne, Autriche', 'Copenhague, Danemark', 'Stockholm, Suède', 'Oslo, Norvège',
  'New York, États-Unis', 'San Francisco, États-Unis', 'Los Angeles, États-Unis', 'Miami, États-Unis',
  'Casablanca, Maroc', 'Rabat, Maroc', 'Tunis, Tunisie', 'Alger, Algérie', 'Dakar, Sénégal',
  'Abidjan, Côte d’Ivoire', 'Tokyo, Japon', 'Singapour', 'Dubaï, Émirats arabes unis',
  'Télétravail', 'À distance',
];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^[+0-9 ().-]{6,}$/;

// Réseaux proposés. `icon` = icône Font Awesome « brands ».
const SOCIALS = [
  { key: 'linkedin', label: 'LinkedIn', icon: 'linkedin-in', ph: 'https://linkedin.com/in/…' },
  { key: 'instagram', label: 'Instagram', icon: 'instagram', ph: 'https://instagram.com/…' },
  { key: 'twitter', label: 'X (Twitter)', icon: 'x-twitter', ph: 'https://x.com/…' },
  { key: 'facebook', label: 'Facebook', icon: 'facebook-f', ph: 'https://facebook.com/…' },
  { key: 'github', label: 'GitHub', icon: 'github', ph: 'https://github.com/…' },
  { key: 'youtube', label: 'YouTube', icon: 'youtube', ph: 'https://youtube.com/@…' },
];
const parseSocials = (raw) => { try { const o = JSON.parse(raw || '{}'); return o && typeof o === 'object' ? o : {}; } catch { return {}; } };
const STATUSES = [
  { value: 'online', label: 'En ligne' },
  { value: 'idle', label: 'Absent' },
  { value: 'dnd', label: 'Ne pas déranger' },
  { value: 'meeting', label: 'En réunion' },
  { value: 'invisible', label: 'Hors ligne' },
];
const EXPIRE = [
  { v: 0, l: 'Ne pas effacer' },
  { v: 30, l: 'Dans 30 minutes' },
  { v: 60, l: 'Dans 1 heure' },
  { v: 240, l: 'Dans 4 heures' },
  { v: 1440, l: 'Dans 24 heures' },
];

/** Modale « Modifier le profil » : onglets Fiche profil + Fiche professionnelle. */
export default function EditProfileModal({ initialTab = 'profil', onClose }) {
  const { user, updateUser } = useAuth();
  const confirm = useConfirm();
  const [tab, setTab] = useState(initialTab);
  const [f, setF] = useState({
    display_name: user.display_name, pronouns: user.pronouns || '', status: user.status,
    custom_status: user.custom_status || '', custom_status_emoji: user.custom_status_emoji || '',
    avatar_color: user.avatar_color, avatar_url: user.avatar_url || '',
    banner_color: user.banner_color || '', banner_url: user.banner_url || '', about: user.about || '',
    headline: user.headline || '', company: user.company || '', location: user.location || '',
    website: user.website || '', email_pro: user.email_pro || '', phone: user.phone || '',
    skills: user.skills || '', cv_url: user.cv_url || '', cv_name: user.cv_name || '', cv_summary: user.cv_summary || '',
  });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [pickedAvatar, setPickedAvatar] = useState(null); // avatar prêt-à-l'emploi sélectionné (pour le surlignage)
  const [avatarSource, setAvatarSource] = useState(user.avatar_source || null); // 'upload' | 'preset' | null : origine de la photo actuelle
  const [avatarPickerOpen, setAvatarPickerOpen] = useState(false);
  // On ne confirme que si la photo affichée a été IMPORTÉE depuis l'ordinateur
  // (remplacer un modèle ou l'absence de photo se fait sans friction).
  async function confirmReplacePhoto() {
    if (avatarSource !== 'upload' || !f.avatar_url) return true;
    return confirm({
      title: 'Remplacer votre photo ?',
      message: 'Vous avez importé une photo depuis votre ordinateur. La remplacer la retirera de votre profil.',
      confirmLabel: 'Remplacer',
    });
  }
  const [statusMinutes, setStatusMinutes] = useState(0); // expiration à appliquer au statut personnalisé
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [skillDraft, setSkillDraft] = useState('');
  const [socials, setSocials] = useState(() => parseSocials(user.socials));
  const [lightbox, setLightbox] = useState(null); // image affichée en grand (crayon « Afficher »)
  const avatarInput = useRef(null);
  const bannerInput = useRef(null);
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));
  async function pickPreset(url) {
    if (!(await confirmReplacePhoto())) return false;
    setPickedAvatar(url);
    setAvatarSource('preset');
    try { set('avatar_url', await assetToDataUrl(url)); } catch { return false; }
    return true;
  }
  // Depuis la modale de choix : on applique, et on ne la ferme que si c'est validé.
  async function pickFromModal(url) { if (await pickPreset(url)) setAvatarPickerOpen(false); }
  const srcOf = (url) => (url.startsWith('data:') ? url : mediaUrl(url));

  // Compétences en étiquettes : stockées en chaîne « a, b, c » (compat serveur),
  // affichées et retirées à l'unité.
  const skillsList = f.skills.split(',').map((s) => s.trim()).filter(Boolean);
  const addSkill = (name) => {
    const n = name.trim();
    if (n && !skillsList.some((s) => s.toLowerCase() === n.toLowerCase())) set('skills', [...skillsList, n].join(', '));
    setSkillDraft('');
  };
  const removeSkill = (name) => set('skills', skillsList.filter((s) => s !== name).join(', '));
  const setSocial = (key, val) => setSocials((s) => ({ ...s, [key]: val }));

  // Menu du crayon sur la photo de profil : afficher, changer, supprimer.
  const avatarMenu = (e) => {
    e.preventDefault(); e.stopPropagation();
    const items = [];
    if (f.avatar_url) items.push({ label: 'Afficher la photo', icon: 'eye', onClick: () => setLightbox(srcOf(f.avatar_url)) });
    items.push({ label: f.avatar_url ? 'Changer la photo' : 'Ajouter une photo', icon: 'image', onClick: () => avatarInput.current?.click() });
    if (f.avatar_url) items.push({ sep: true }, { label: 'Supprimer la photo', icon: 'trash', danger: true, onClick: () => { setPickedAvatar(null); setAvatarSource(null); set('avatar_url', ''); } });
    openMenu(e.clientX, e.clientY, items);
  };
  // Menu du crayon sur la bannière : afficher, changer, supprimer.
  const bannerMenu = (e) => {
    e.preventDefault(); e.stopPropagation();
    const items = [];
    if (f.banner_url) items.push({ label: 'Afficher la bannière', icon: 'eye', onClick: () => setLightbox(srcOf(f.banner_url)) });
    items.push({ label: f.banner_url ? 'Changer la bannière' : 'Ajouter une bannière', icon: 'image', onClick: () => bannerInput.current?.click() });
    if (f.banner_url) items.push({ sep: true }, { label: 'Retirer la bannière', icon: 'trash', danger: true, onClick: () => set('banner_url', '') });
    openMenu(e.clientX, e.clientY, items);
  };

  async function pickImage(key, maxMo, e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > maxMo * 1024 * 1024) { setError(`Image trop lourde (${maxMo} Mo max).`); return; }
    if (key === 'avatar_url') {
      if (!(await confirmReplacePhoto())) { e.target.value = ''; return; }
      setPickedAvatar(null);
      setAvatarSource('upload');
    }
    setError('');
    try {
      // Conversion en format universel (le HEIC des iPhone devient du JPEG) et
      // redimensionnement : un avatar carré compact, une bannière plus large.
      const opts = key === 'avatar_url'
        ? { max: 256, square: true }
        : { max: 1280, square: false };
      set(key, await fileToImageDataUrl(file, opts));
    } catch (err) {
      set(key, '');
      setError(err.message);
    }
  }
  async function pickCv(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) { setError('CV trop lourd (8 Mo max).'); return; }
    setError('');
    const r = new FileReader();
    r.onload = async () => { try { const { url, name } = await uploadFile(r.result, file.name); setF((s) => ({ ...s, cv_url: url, cv_name: name || file.name })); } catch (err) { setError(err.message); } };
    r.readAsDataURL(file);
  }

  async function save() {
    setError('');
    // Contrôles de format avant l'envoi (email et téléphone facultatifs, mais valides s'ils sont remplis).
    if (f.email_pro.trim() && !EMAIL_RE.test(f.email_pro.trim())) { setError('L’email professionnel n’est pas valide (ex. contact@exemple.com).'); setTab('pro'); return; }
    if (f.phone.trim() && !PHONE_RE.test(f.phone.trim())) { setError('Le numéro de téléphone n’est pas valide (chiffres, espaces, + et - autorisés).'); setTab('pro'); return; }
    setBusy(true);
    try {
      // Images choisies en base64 : on les envoie au serveur d'abord, pour
      // stocker une URL de fichier (et non l'image entière) dans le profil.
      // L'avatar était oublié ici : il finissait en base64 géant dans la base,
      // et en HEIC illisible pour les autres. Corrigé.
      let banner = f.banner_url;
      if (banner && banner.startsWith('data:')) banner = await uploadImage(banner);
      let avatar = f.avatar_url;
      if (avatar && avatar.startsWith('data:')) avatar = await uploadImage(avatar);
      const { user: updated } = await api('/users/me', {
        method: 'PATCH',
        body: { ...f, banner_url: banner || null, avatar_url: avatar || null, avatar_source: avatarSource, cv_url: f.cv_url || null, cv_name: f.cv_name || null, custom_status_minutes: statusMinutes, socials },
      });
      updateUser(updated);
      onClose();
    } catch (err) { setError(err.message); setBusy(false); }
  }

  const preview = { display_name: f.display_name, avatar_color: f.avatar_color, avatar_url: f.avatar_url, username: user.username };

  return (
    <>
    <Modal onClose={onClose} className="modal-settings">
      <div className="settings-layout">
        <aside className="settings-menu">
          <div className="settings-menu-title">Modifier le profil</div>
          <div className="settings-menu-group">
            <button className={tab === 'profil' ? 'active' : ''} onClick={() => setTab('profil')}><Icon name="id-card" /> Fiche profil</button>
            <button className={tab === 'pro' ? 'active' : ''} onClick={() => setTab('pro')}><Icon name="briefcase" /> Fiche professionnelle</button>
            <button className={tab === 'reseaux' ? 'active' : ''} onClick={() => setTab('reseaux')}><Icon name="share-nodes" /> Réseaux</button>
          </div>
        </aside>

        <div className="settings-content">
          {/* Aperçu du profil : en-tête FIXE (hors défilement), pour voir en
              direct ce que l'on modifie, sans fond ni contour autour. */}
          {tab === 'profil' && (
            <div className="edit-preview-fixed">
              <div className="edit-banner-preview" style={{ background: f.banner_url ? `center/cover url(${srcOf(f.banner_url)})` : (f.banner_color || 'var(--bg-content-alt)') }}>
                <button type="button" className="edit-pencil banner-pencil" title="Modifier la bannière" onClick={bannerMenu}><Icon name="pencil" /></button>
                <div className="edit-avatar-wrap">
                  <Avatar user={preview} size={72} status={f.status} />
                  <button type="button" className="edit-pencil avatar-pencil" title="Modifier la photo" onClick={avatarMenu}><Icon name="pencil" /></button>
                </div>
              </div>
            </div>
          )}
          <div className="settings-scroll">
            {error && <div className="error-msg">{error}</div>}

            {tab === 'profil' && (
              <>
                {/* Champs d'import cachés, déclenchés par les crayons ou les boutons. */}
                <input ref={avatarInput} type="file" accept="image/*" hidden onChange={(e) => pickImage('avatar_url', 1.5, e)} />
                <input ref={bannerInput} type="file" accept="image/*,image/gif" hidden onChange={(e) => pickImage('banner_url', 3, e)} />

                <div className="settings-two">
                  <div className="field"><label>Nom affiché</label><input value={f.display_name} onChange={(e) => set('display_name', e.target.value)} /></div>
                  <div className="field"><label>Pronoms</label><input value={f.pronouns} onChange={(e) => set('pronouns', e.target.value)} placeholder="ex. il/lui, elle/elle, iel" maxLength={40} /></div>
                </div>
                <div className="field">
                  <label>Statut</label>
                  <select value={f.status} onChange={(e) => set('status', e.target.value)}>
                    {STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label>Statut personnalisé</label>
                  <div className="custom-status-row">
                    <div className="cs-emoji-wrap">
                      <button type="button" className="cs-emoji-btn" title="Choisir un emoji (facultatif)" onClick={() => setEmojiOpen((o) => !o)}>
                        {f.custom_status_emoji ? <span className="cs-emoji-val">{f.custom_status_emoji}</span> : <Icon name="face-smile" />}
                      </button>
                      {f.custom_status_emoji && (
                        <button type="button" className="cs-emoji-clear" title="Retirer l’emoji" onClick={() => set('custom_status_emoji', '')}><Icon name="xmark" /></button>
                      )}
                    </div>
                    <input className="cs-text" value={f.custom_status} onChange={(e) => set('custom_status', e.target.value)} placeholder="En congé, en réunion, focus…" maxLength={100} />
                  </div>
                  {emojiOpen && (
                    <div className="cs-emoji-pop">
                      <EmojiPicker onPick={(em) => { set('custom_status_emoji', em); setEmojiOpen(false); }} onClose={() => setEmojiOpen(false)} />
                    </div>
                  )}
                  {f.custom_status.trim() && (
                    <select className="cs-expire" value={statusMinutes} onChange={(e) => setStatusMinutes(Number(e.target.value))}>
                      {EXPIRE.map((x) => <option key={x.v} value={x.v}>Effacer&nbsp;: {x.l.toLowerCase()}</option>)}
                    </select>
                  )}
                  <p className="field-hint">Un petit message visible sur votre profil. L’emoji est facultatif. Videz le champ pour le retirer.</p>
                </div>

                {/* Photo de profil : votre image d'abord, puis des visuels prêts. */}
                <div className="field">
                  <label>Photo de profil</label>
                  <button type="button" className="btn pick-avatar-cta" onClick={() => setAvatarPickerOpen(true)}>
                    <Icon name="user-astronaut" /> Choisir un avatar dans la galerie
                  </button>
                  <div className="import-row import-row-sub">
                    <button type="button" className="btn btn-ghost import-btn" onClick={() => avatarInput.current?.click()}><Icon name="arrow-up-from-bracket" /> Importer votre image</button>
                    {f.avatar_url && <button type="button" className="btn btn-ghost import-btn" onClick={() => { setPickedAvatar(null); setAvatarSource(null); set('avatar_url', ''); }}>Retirer</button>}
                  </div>
                </div>

                <div className="field">
                  <label>Bannière</label>
                  <div className="import-row">
                    <button type="button" className="btn btn-ghost import-btn" onClick={() => bannerInput.current?.click()}><Icon name="arrow-up-from-bracket" /> Importer une image</button>
                    {f.banner_url && <button type="button" className="btn btn-ghost import-btn" onClick={() => set('banner_url', '')}>Retirer</button>}
                  </div>
                  <p className="field-hint">Ou une couleur unie&nbsp;:</p>
                  <div className="color-swatches">
                    {BANNERS.map((c) => <div key={c} className={`color-swatch ${c === f.banner_color && !f.banner_url ? 'selected' : ''}`} style={{ background: c }} onClick={() => { set('banner_color', c); set('banner_url', ''); }} />)}
                  </div>
                </div>
                <div className="field"><label>À propos de moi</label><textarea rows={3} maxLength={300} value={f.about} onChange={(e) => set('about', e.target.value)} placeholder="Présentez-vous en quelques mots…" /></div>
              </>
            )}

            {tab === 'pro' && (
              <>
                <h2>Fiche professionnelle</h2>
                <p className="modal-sub">Votre carte de visite, visible sur votre profil.</p>
                <div className="settings-two">
                  <div className="field"><label>Poste / intitulé</label><input value={f.headline} onChange={(e) => set('headline', e.target.value)} placeholder="ex. Développeuse web" /></div>
                  <div className="field"><label>Entreprise</label><input value={f.company} onChange={(e) => set('company', e.target.value)} placeholder="ex. Studio Pulsar" /></div>
                  <div className="field">
                    <label>Localisation</label>
                    <input list="loc-suggest" value={f.location} onChange={(e) => set('location', e.target.value)} placeholder="Tapez une ville…" />
                    <datalist id="loc-suggest">{LOCATIONS.map((l) => <option key={l} value={l} />)}</datalist>
                  </div>
                  <div className="field"><label>Site / lien</label><input type="url" value={f.website} onChange={(e) => set('website', e.target.value)} placeholder="https://…" /></div>
                  <div className="field"><label>Email professionnel</label><input type="email" value={f.email_pro} onChange={(e) => set('email_pro', e.target.value)} placeholder="contact@exemple.com" /></div>
                  <div className="field"><label>Téléphone</label><input type="tel" value={f.phone} onChange={(e) => set('phone', e.target.value)} placeholder="06 12 34 56 78" /></div>
                </div>
                <div className="field">
                  <label>Compétences</label>
                  <div className="tags-input" onClick={(e) => { if (e.target.classList.contains('tags-input')) e.currentTarget.querySelector('.tag-draft')?.focus(); }}>
                    {skillsList.map((s) => (
                      <span className="tag-chip" key={s}>{s}<button type="button" title="Retirer" onClick={() => removeSkill(s)}><Icon name="xmark" /></button></span>
                    ))}
                    <input
                      className="tag-draft" value={skillDraft}
                      onChange={(e) => setSkillDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addSkill(skillDraft); }
                        else if (e.key === 'Backspace' && !skillDraft && skillsList.length) removeSkill(skillsList[skillsList.length - 1]);
                      }}
                      onBlur={() => addSkill(skillDraft)}
                      placeholder={skillsList.length ? 'Ajouter…' : 'ex. React, Gestion de projet'}
                    />
                  </div>
                  <p className="field-hint">Tapez une compétence puis Entrée. Cliquez la croix pour la retirer.</p>
                </div>
                <div className="field"><label>CV résumé (en bref)</label><textarea rows={3} maxLength={800} value={f.cv_summary} onChange={(e) => set('cv_summary', e.target.value)} placeholder="Votre parcours en quelques lignes…" /></div>
                <div className="field">
                  <label>CV joint (PDF ou image, 8 Mo max)</label>
                  <input type="file" accept=".pdf,image/*" onChange={pickCv} />
                  {f.cv_url && <div className="cv-chip"><a href={mediaUrl(f.cv_url)} target="_blank" rel="noreferrer"><Icon name="file-lines" /> {f.cv_name || 'Voir le CV'}</a><button type="button" onClick={() => setF((s) => ({ ...s, cv_url: '', cv_name: '' }))}>Retirer</button></div>}
                </div>
              </>
            )}

            {tab === 'reseaux' && (
              <>
                <h2>Réseaux</h2>
                <p className="modal-sub">Ajoutez les liens de vos profils. Ils apparaîtront sur votre carte de visite, avec leur icône.</p>
                {SOCIALS.map((s) => (
                  <div className="field social-field" key={s.key}>
                    <label><Icon name={s.icon} brand /> {s.label}</label>
                    <input type="url" value={socials[s.key] || ''} onChange={(e) => setSocial(s.key, e.target.value)} placeholder={s.ph} />
                  </div>
                ))}
              </>
            )}
          </div>

          <div className="modal-actions">
            <button className="btn btn-ghost" onClick={onClose}>Annuler</button>
            <button className="btn" onClick={save} disabled={busy}>{busy ? 'Enregistrement…' : 'Enregistrer'}</button>
          </div>
        </div>
      </div>
    </Modal>
    {avatarPickerOpen && <AvatarPickerModal onPick={pickFromModal} onClose={() => setAvatarPickerOpen(false)} />}
    {lightbox && (
      <div className="img-lightbox" role="button" title="Fermer" onClick={() => setLightbox(null)}>
        <img src={lightbox} alt="" />
      </div>
    )}
    </>
  );
}
