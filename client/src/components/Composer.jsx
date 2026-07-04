import { useState } from 'react';
import { uploadImage } from '../api.js';
import GifPicker from './GifPicker.jsx';
import VoiceRecorder from './VoiceRecorder.jsx';

const readAsDataURL = (file) =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });

/**
 * Zone de saisie partagée (salons + DM).
 * - onSendText(text)             : message texte
 * - onSendAttachment(url, text?) : image, GIF ou message vocal
 * - onTyping()                   : signale la frappe (optionnel)
 */
export default function Composer({ placeholder, onSendText, onSendAttachment, onTyping }) {
  const [input, setInput] = useState('');
  const [uploading, setUploading] = useState(false);
  const [showGif, setShowGif] = useState(false);

  function submit(e) {
    e.preventDefault();
    const t = input.trim();
    if (!t) return;
    onSendText(t);
    setInput('');
  }

  function change(e) {
    setInput(e.target.value);
    onTyping?.();
  }

  async function onPickImage(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { alert('Fichier trop lourd (5 Mo max).'); return; }
    setUploading(true);
    try {
      const url = await uploadImage(await readAsDataURL(file));
      onSendAttachment(url, input.trim());
      setInput('');
    } catch (err) {
      alert(err.message);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="composer">
      {showGif && (
        <GifPicker onSelect={(url) => { onSendAttachment(url, ''); setShowGif(false); }} onClose={() => setShowGif(false)} />
      )}
      <form onSubmit={submit}>
        <div className="composer-inner">
          <label className="composer-attach" title="Envoyer une image">
            📎
            <input type="file" accept="image/*" hidden onChange={onPickImage} />
          </label>
          <button type="button" className={`composer-attach gif-btn ${showGif ? 'active' : ''}`} title="GIF" onClick={() => setShowGif((v) => !v)}>GIF</button>
          <VoiceRecorder onSend={(url) => onSendAttachment(url, '')} disabled={uploading} />
          <input
            value={input}
            onChange={change}
            placeholder={uploading ? 'Envoi…' : placeholder}
            maxLength={2000}
            disabled={uploading}
          />
        </div>
      </form>
    </div>
  );
}
