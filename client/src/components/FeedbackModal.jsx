import { useState } from 'react';
import Modal from './Modal.jsx';
import Icon from './Icon.jsx';
import { api, uploadImage, mediaUrl } from '../api.js';

const TYPES = [
  { value: 'bug', label: 'Bug', icon: 'bug' },
  { value: 'suggestion', label: 'Suggestion', icon: 'lightbulb' },
  { value: 'autre', label: 'Autre', icon: 'comment' },
];

/** Modale de retour utilisateur : bug / suggestion, captures, message. */
export default function FeedbackModal({ onClose }) {
  const [type, setType] = useState('suggestion');
  const [subject, setSubject] = useState('');
  const [area, setArea] = useState('');
  const [message, setMessage] = useState('');
  const [shots, setShots] = useState([]); // urls uploadées
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  async function onPickShots(e) {
    const files = [...(e.target.files || [])].slice(0, 6 - shots.length);
    e.target.value = '';
    for (const file of files) {
      if (file.size > 4 * 1024 * 1024) { setError('Chaque image doit faire moins de 4 Mo.'); continue; }
      try {
        const url = await uploadImage(await readDataUrl(file));
        setShots((s) => [...s, url].slice(0, 6));
      } catch (err) { setError(err.message); }
    }
  }
  const readDataUrl = (file) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); });

  async function submit() {
    if (!message.trim()) { setError('Merci de décrire votre retour.'); return; }
    setBusy(true); setError('');
    try {
      await api('/feedback', { method: 'POST', body: { type, subject: subject.trim(), area: area.trim(), message: message.trim(), screenshots: shots } });
      setDone(true);
      setTimeout(onClose, 1800);
    } catch (e) { setError(e.message); setBusy(false); }
  }

  if (done) {
    return (
      <Modal onClose={onClose}>
        <div className="feedback-done">
          <span className="feedback-done-ico"><Icon name="heart" /></span>
          <h2>Merci pour votre retour&nbsp;!</h2>
          <p className="modal-sub">Il compte vraiment. Chaque message nous aide à améliorer Pulsar.</p>
        </div>
      </Modal>
    );
  }

  return (
    <Modal onClose={onClose} className="modal-feedback">
      <h2><Icon name="comment-dots" /> Votre avis compte</h2>
      <p className="modal-sub">Un bug, une idée&nbsp;? Chaque retour est lu et pris en compte : c'est ce qui fait évoluer et progresser Pulsar en continu. Merci&nbsp;!</p>

      {error && <div className="error-msg">{error}</div>}

      <div className="field">
        <label>Type de retour</label>
        <div className="fb-types">
          {TYPES.map((t) => (
            <button key={t.value} className={`fb-type ${type === t.value ? 'active' : ''}`} onClick={() => setType(t.value)}>
              <Icon name={t.icon} /> {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="settings-two">
        <div className="field"><label>Sujet (optionnel)</label><input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="ex. Le son coupe en vocal" maxLength={160} /></div>
        <div className="field"><label>Concerne (optionnel)</label><input value={area} onChange={(e) => setArea(e.target.value)} placeholder="ex. Vocal, Messages, Profil…" maxLength={120} /></div>
      </div>

      <div className="field">
        <label>Votre message</label>
        <textarea rows={4} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Décrivez le problème ou votre idée le plus clairement possible…" maxLength={4000} />
      </div>

      <div className="field">
        <label>Captures d'écran (optionnel, jusqu'à 6)</label>
        <div className="fb-shots">
          {shots.map((u) => (
            <div className="fb-shot" key={u}>
              <img src={mediaUrl(u)} alt="" />
              <button title="Retirer" onClick={() => setShots((s) => s.filter((x) => x !== u))}><Icon name="xmark" /></button>
            </div>
          ))}
          {shots.length < 6 && (
            <label className="fb-shot-add" title="Ajouter une capture">
              <Icon name="image" />
              <span>Ajouter une capture</span>
              <input type="file" accept="image/*" multiple hidden onChange={onPickShots} />
            </label>
          )}
        </div>
      </div>

      <div className="modal-actions">
        <button className="btn btn-ghost" onClick={onClose}>Annuler</button>
        <button className="btn" onClick={submit} disabled={busy}>{busy ? 'Envoi…' : 'Envoyer mon retour'}</button>
      </div>
    </Modal>
  );
}
