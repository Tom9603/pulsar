import { useState } from 'react';
import Modal from './Modal.jsx';
import Avatar from './Avatar.jsx';
import Icon from './Icon.jsx';
import { api, uploadImage, uploadFile, mediaUrl } from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';

const COLORS = ['#5865F2', '#EB459E', '#57F287', '#FAA61A', '#ED4245', '#3498DB', '#9B59B6', '#14b8a6', '#e67e22'];
const BANNERS = ['#1e1b4b', '#0f172a', '#3b0764', '#082f49', '#4a044e', '#1a2e05', '#450a0a', '#111827'];

// Photos de profil prêtes à l'emploi : dégradés sobres et modernes (aucune image enfantine).
const PRESET_AVATARS = [
  { id: 'violet', from: '#8b5cf6', to: '#6366f1' },
  { id: 'ocean', from: '#3b82f6', to: '#06b6d4' },
  { id: 'teal', from: '#14b8a6', to: '#10b981' },
  { id: 'slate', from: '#64748b', to: '#1e293b' },
  { id: 'rose', from: '#fb7185', to: '#ec4899' },
  { id: 'amber', from: '#f59e0b', to: '#ea580c' },
  { id: 'indigo', from: '#6366f1', to: '#7c3aed' },
  { id: 'sky', from: '#0ea5e9', to: '#2563eb' },
  { id: 'graphite', from: '#52525b', to: '#18181b' },
  { id: 'lime', from: '#22c55e', to: '#65a30d' },
  { id: 'fuchsia', from: '#d946ef', to: '#9333ea' },
  { id: 'sand', from: '#a8a29e', to: '#44403c' },
];
const presetCss = (p) => `radial-gradient(circle at 72% 26%, rgba(255,255,255,0.28), transparent 58%), linear-gradient(135deg, ${p.from}, ${p.to})`;
function presetToPng(p, size = 256) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, size, size);
  g.addColorStop(0, p.from); g.addColorStop(1, p.to);
  x.fillStyle = g; x.fillRect(0, 0, size, size);
  const r = x.createRadialGradient(size * 0.72, size * 0.26, size * 0.04, size * 0.72, size * 0.26, size * 0.75);
  r.addColorStop(0, 'rgba(255,255,255,0.30)'); r.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = r; x.fillRect(0, 0, size, size);
  return c.toDataURL('image/png');
}
const STATUSES = [
  { value: 'online', label: 'En ligne' },
  { value: 'idle', label: 'Absent' },
  { value: 'dnd', label: 'Ne pas déranger' },
  { value: 'meeting', label: 'En réunion' },
  { value: 'invisible', label: 'Invisible' },
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
  const [presetId, setPresetId] = useState(null);
  const [statusMinutes, setStatusMinutes] = useState(0); // expiration à appliquer au statut personnalisé
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));
  const pickPreset = (p) => { setPresetId(p.id); set('avatar_url', presetToPng(p)); };

  function pickImage(key, maxMo, e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > maxMo * 1024 * 1024) { setError(`Image trop lourde (${maxMo} Mo max).`); return; }
    if (key === 'avatar_url') setPresetId(null);
    const r = new FileReader();
    r.onload = () => set(key, r.result);
    r.readAsDataURL(file);
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
    setError(''); setBusy(true);
    try {
      // Bannière : si une image a été choisie en base64, on l'envoie d'abord.
      let banner = f.banner_url;
      if (banner && banner.startsWith('data:')) banner = await uploadImage(banner);
      const { user: updated } = await api('/users/me', {
        method: 'PATCH',
        body: { ...f, banner_url: banner || null, avatar_url: f.avatar_url || null, cv_url: f.cv_url || null, cv_name: f.cv_name || null, custom_status_minutes: statusMinutes },
      });
      updateUser(updated);
      onClose();
    } catch (err) { setError(err.message); setBusy(false); }
  }

  const preview = { display_name: f.display_name, avatar_color: f.avatar_color, avatar_url: f.avatar_url, username: user.username };

  return (
    <Modal onClose={onClose} className="modal-settings">
      <div className="settings-layout">
        <aside className="settings-menu">
          <div className="settings-menu-title">Modifier le profil</div>
          <div className="settings-menu-group">
            <button className={tab === 'profil' ? 'active' : ''} onClick={() => setTab('profil')}><Icon name="id-card" /> Fiche profil</button>
            <button className={tab === 'pro' ? 'active' : ''} onClick={() => setTab('pro')}><Icon name="briefcase" /> Fiche professionnelle</button>
          </div>
        </aside>

        <div className="settings-content">
          <div className="settings-scroll">
            {error && <div className="error-msg">{error}</div>}

            {tab === 'profil' && (
              <>
                <h2>Fiche profil</h2>
                <div className="edit-banner-preview" style={{ background: f.banner_url ? `center/cover url(${f.banner_url.startsWith('data:') ? f.banner_url : mediaUrl(f.banner_url)})` : (f.banner_color || 'var(--bg-content-alt)') }}>
                  <Avatar user={preview} size={64} status={f.status} />
                </div>
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
                    <input className="cs-emoji" value={f.custom_status_emoji} onChange={(e) => set('custom_status_emoji', e.target.value)} placeholder="🙂" maxLength={8} title="Emoji (optionnel)" />
                    <input className="cs-text" value={f.custom_status} onChange={(e) => set('custom_status', e.target.value)} placeholder="En congé, en réunion, focus…" maxLength={100} />
                  </div>
                  {f.custom_status.trim() && (
                    <select className="cs-expire" value={statusMinutes} onChange={(e) => setStatusMinutes(Number(e.target.value))}>
                      {EXPIRE.map((x) => <option key={x.v} value={x.v}>Effacer&nbsp;: {x.l.toLowerCase()}</option>)}
                    </select>
                  )}
                  <p className="field-hint">Un petit message visible sur votre profil. Videz le champ pour le retirer.</p>
                </div>
                <div className="field">
                  <label>Photos de profil</label>
                  <div className="avatar-presets">
                    {PRESET_AVATARS.map((p) => (
                      <button type="button" key={p.id} className={`avatar-preset ${presetId === p.id ? 'selected' : ''}`} style={{ background: presetCss(p) }} title="Choisir cette photo" onClick={() => pickPreset(p)} />
                    ))}
                  </div>
                  <p className="field-hint">Des visuels sobres et modernes, en un clic.</p>
                </div>
                <div className="field">
                  <label>Couleur d’avatar</label>
                  <div className="color-swatches">
                    {COLORS.map((c) => <div key={c} className={`color-swatch ${c === f.avatar_color && !f.avatar_url ? 'selected' : ''}`} style={{ background: c }} onClick={() => { setPresetId(null); set('avatar_url', ''); set('avatar_color', c); }} />)}
                  </div>
                </div>
                <div className="field">
                  <label>Votre propre image (optionnel)</label>
                  <input type="file" accept="image/*" onChange={(e) => pickImage('avatar_url', 1.5, e)} />
                  {f.avatar_url && <button type="button" className="btn btn-ghost" style={{ width: 'auto', padding: '6px 12px', marginTop: 8, fontSize: 13 }} onClick={() => { setPresetId(null); set('avatar_url', ''); }}>Retirer l’image</button>}
                </div>
                <div className="field">
                  <label>Bannière (couleur)</label>
                  <div className="color-swatches">
                    {BANNERS.map((c) => <div key={c} className={`color-swatch ${c === f.banner_color && !f.banner_url ? 'selected' : ''}`} style={{ background: c }} onClick={() => { set('banner_color', c); set('banner_url', ''); }} />)}
                  </div>
                </div>
                <div className="field">
                  <label>Bannière (image ou GIF, optionnel)</label>
                  <input type="file" accept="image/*,image/gif" onChange={(e) => pickImage('banner_url', 3, e)} />
                  {f.banner_url && <button type="button" className="btn btn-ghost" style={{ width: 'auto', padding: '6px 12px', marginTop: 8, fontSize: 13 }} onClick={() => set('banner_url', '')}>Retirer la bannière</button>}
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
                  <div className="field"><label>Localisation</label><input value={f.location} onChange={(e) => set('location', e.target.value)} placeholder="ex. Lyon, France" /></div>
                  <div className="field"><label>Site / lien</label><input value={f.website} onChange={(e) => set('website', e.target.value)} placeholder="https://…" /></div>
                  <div className="field"><label>Email professionnel</label><input value={f.email_pro} onChange={(e) => set('email_pro', e.target.value)} placeholder="contact@…" /></div>
                  <div className="field"><label>Téléphone</label><input value={f.phone} onChange={(e) => set('phone', e.target.value)} placeholder="06 12 34 56 78" /></div>
                </div>
                <div className="field"><label>Compétences (séparées par des virgules)</label><input value={f.skills} onChange={(e) => set('skills', e.target.value)} placeholder="ex. React, Gestion de projet" /></div>
                <div className="field"><label>CV résumé (en bref)</label><textarea rows={3} maxLength={800} value={f.cv_summary} onChange={(e) => set('cv_summary', e.target.value)} placeholder="Votre parcours en quelques lignes…" /></div>
                <div className="field">
                  <label>CV joint (PDF ou image, 8 Mo max)</label>
                  <input type="file" accept=".pdf,image/*" onChange={pickCv} />
                  {f.cv_url && <div className="cv-chip"><a href={mediaUrl(f.cv_url)} target="_blank" rel="noreferrer"><Icon name="file-lines" /> {f.cv_name || 'Voir le CV'}</a><button type="button" onClick={() => setF((s) => ({ ...s, cv_url: '', cv_name: '' }))}>Retirer</button></div>}
                </div>
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
  );
}
