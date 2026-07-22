import { useState } from 'react';
import Modal from './Modal.jsx';
import Icon from './Icon.jsx';
import Logo from './Logo.jsx';
import Avatar from './Avatar.jsx';
import { api, uploadImage } from '../api.js';
import { fileToImageDataUrl } from '../imagefile.js';
import { useAuth } from '../context/AuthContext.jsx';
import { assetToDataUrl } from '../avatars.js';
import AvatarPickerModal from './AvatarPickerModal.jsx';

const TOTAL = 3;

/**
 * Fenêtre de personnalisation à la toute première connexion (avant le didacticiel).
 * Ne s'affiche qu'une fois (drapeau `setup_completed` côté serveur). Non fermable
 * au clic à côté : on en sort en terminant ou en passant les étapes.
 */
export default function OnboardingSetup({ onDone }) {
  const { user, updateUser } = useAuth();
  const [step, setStep] = useState(0);
  const [displayName, setDisplayName] = useState(user.display_name || '');
  const [avatarUrl, setAvatarUrl] = useState(user.avatar_url || '');
  const [pickedAvatar, setPickedAvatar] = useState(null); // avatar prêt-à-l'emploi sélectionné (pour le surlignage)
  const [avatarSource, setAvatarSource] = useState(user.avatar_source || null); // 'upload' | 'preset' : origine de la photo
  const [avatarPickerOpen, setAvatarPickerOpen] = useState(false);
  const [about, setAbout] = useState(user.about || '');
  const [sound, setSound] = useState(() => localStorage.getItem('pulsar_sound') !== '0');
  const [desktop, setDesktop] = useState(() => localStorage.getItem('pulsar_desktop') === '1');
  const [busy, setBusy] = useState(false);

  const last = step === TOTAL - 1;
  async function pickPreset(url) {
    setPickedAvatar(url);
    setAvatarSource('preset');
    try { setAvatarUrl(await assetToDataUrl(url)); } catch { /* ignoré */ }
    setAvatarPickerOpen(false);
  }

  async function pickImage(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    try { setPickedAvatar(null); setAvatarSource('upload'); setAvatarUrl(await fileToImageDataUrl(file, { max: 256, square: true })); } catch { /* ignoré */ }
  }

  async function finish() {
    setBusy(true);
    try {
      localStorage.setItem('pulsar_sound', sound ? '1' : '0');
      localStorage.setItem('pulsar_desktop', desktop ? '1' : '0');
      let avatar = avatarUrl;
      if (avatar && avatar.startsWith('data:')) avatar = await uploadImage(avatar);
      const { user: updated } = await api('/users/me', {
        method: 'PATCH',
        body: { display_name: displayName.trim() || user.display_name, avatar_url: avatar || null, avatar_source: avatar ? avatarSource : null, about, setup_completed: true },
      });
      updateUser(updated);
    } catch { /* on n'empêche jamais d'entrer dans l'app */ }
    onDone();
  }

  const preview = { display_name: displayName, avatar_color: user.avatar_color, avatar_url: avatarUrl };

  return (
    <>
    <Modal className="onboarding onboarding-setup" onClose={() => {}} escapable={false}>
      <div className="ob-head">
        <div className="obs-head-title"><Logo size={30} /><span>Personnalisons votre expérience</span></div>
        <span className="ob-count">{step + 1} sur {TOTAL}</span>
      </div>

      <div className="obs-body">
        {step === 0 && (
          <>
            <h2>Bienvenue sur Pulsar</h2>
            <p className="ob-text">Prenons un instant pour personnaliser votre espace. Tout reste modifiable plus tard.</p>
            <div className="obs-avatar"><Avatar user={preview} size={76} /></div>
            <div className="obs-avatar-actions">
              <button type="button" className="btn btn-ghost import-btn" onClick={() => setAvatarPickerOpen(true)}><Icon name="user-astronaut" /> Choisir un avatar</button>
              <label className="btn btn-ghost import-btn">
                <Icon name="arrow-up-from-bracket" /> Importer une photo
                <input type="file" accept="image/*" hidden onChange={pickImage} />
              </label>
            </div>
            <div className="field"><label>Nom affiché</label><input value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={60} /></div>
            <div className="field"><label>Bio (facultatif)</label><textarea rows={2} maxLength={300} value={about} onChange={(e) => setAbout(e.target.value)} placeholder="Présentez-vous en quelques mots…" /></div>
          </>
        )}

        {step === 1 && (
          <>
            <h2>Vos préférences</h2>
            <p className="ob-text">Réglez vos notifications. Vous pourrez tout ajuster dans les paramètres.</p>
            <label className="settings-toggle"><input type="checkbox" checked={sound} onChange={(e) => setSound(e.target.checked)} /><span>Son à la réception d’un message ou d’une tâche</span></label>
            <label className="settings-toggle"><input type="checkbox" checked={desktop} onChange={(e) => setDesktop(e.target.checked)} /><span>Notifications sur le bureau</span></label>
          </>
        )}

        {step === 2 && (
          <div className="obs-done">
            <span className="ob-ico"><Icon name="circle-check" /></span>
            <h2>Tout est prêt</h2>
            <p className="ob-text">Votre espace est personnalisé. Vous pouvez créer un serveur, ajouter un contact, ou rejoindre un salon vocal quand vous voulez.</p>
          </div>
        )}

        <p className="obs-note"><Icon name="circle-info" /> Rien n’est définitif : tout se modifie à tout moment dans les paramètres.</p>
      </div>

      <div className="ob-nav">
        {step > 0 && <button className="btn-ghost" onClick={() => setStep((v) => v - 1)}>Retour</button>}
        {!last && <button className="btn-ghost" onClick={() => setStep((v) => v + 1)}>Passer</button>}
        {last
          ? <button className="btn" onClick={finish} disabled={busy}>{busy ? 'Un instant…' : 'Commencer'}</button>
          : <button className="btn" onClick={() => setStep((v) => v + 1)}>Suivant</button>}
      </div>
    </Modal>
    {avatarPickerOpen && <AvatarPickerModal onPick={pickPreset} onClose={() => setAvatarPickerOpen(false)} />}
    </>
  );
}
