import { useRef, useState } from 'react';
import { uploadFile } from '../api.js';
import Icon from './Icon.jsx';
import GifPicker from './GifPicker.jsx';
import EmojiPicker from './EmojiPicker.jsx';
import VoiceRecorder from './VoiceRecorder.jsx';
import QuickMessages from './QuickMessages.jsx';

const readAsDataURL = (file) =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });

/**
 * Zone de saisie partagée (salons + DM).
 * - onSendText(text)                   : message texte
 * - onSendAttachment(url, text?, name?) : image, GIF, vocal ou fichier
 * - onTyping()                          : signale la frappe
 * - replyingTo / onClearReply           : réponse à un message
 */
export default function Composer({ placeholder, onSendText, onSendAttachment, onTyping, replyingTo, onClearReply }) {
  const [input, setInput] = useState('');
  const [uploading, setUploading] = useState(false);
  const [panel, setPanel] = useState(null); // 'gif' | 'emoji' | null
  const inputRef = useRef(null);

  function afterSend() {
    setInput('');
    onClearReply?.();
  }

  function submit(e) {
    e.preventDefault();
    const t = input.trim();
    if (!t) return;
    onSendText(t);
    afterSend();
  }

  function change(e) {
    setInput(e.target.value);
    onTyping?.();
  }

  async function onPickFile(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) { alert('Fichier trop lourd (8 Mo max).'); return; }
    setUploading(true);
    try {
      const { url, name } = await uploadFile(await readAsDataURL(file), file.name);
      onSendAttachment(url, input.trim(), name);
      afterSend();
    } catch (err) {
      alert(err.message);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="composer">
      {panel === 'gif' && (
        <GifPicker onSelect={(url) => { onSendAttachment(url, ''); afterSend(); setPanel(null); }} onClose={() => setPanel(null)} />
      )}
      {panel === 'emoji' && (
        <EmojiPicker onPick={(em) => { setInput((v) => v + em); inputRef.current?.focus(); }} onClose={() => setPanel(null)} />
      )}
      {panel === 'quick' && (
        <QuickMessages onSelect={(t) => { onSendText(t); afterSend(); }} onClose={() => setPanel(null)} />
      )}

      {replyingTo && (
        <div className="reply-bar">
          <span>Réponse à <strong>{replyingTo.display_name}</strong></span>
          <button type="button" title="Annuler" onClick={onClearReply}><Icon name="xmark" /></button>
        </div>
      )}

      <form onSubmit={submit}>
        <div className="composer-inner">
          <label className="composer-attach" title="Joindre un fichier">
            <Icon name="paperclip" />
            <input type="file" hidden onChange={onPickFile} />
          </label>
          <button type="button" className={`composer-attach gif-btn ${panel === 'gif' ? 'active' : ''}`} title="GIF" onClick={() => setPanel((p) => (p === 'gif' ? null : 'gif'))}>GIF</button>
          <button type="button" className={`composer-attach ${panel === 'quick' ? 'active' : ''}`} title="Messages express" onClick={() => setPanel((p) => (p === 'quick' ? null : 'quick'))}><Icon name="bolt" /></button>
          <button type="button" className={`composer-attach ${panel === 'emoji' ? 'active' : ''}`} title="Emoji" onClick={() => setPanel((p) => (p === 'emoji' ? null : 'emoji'))}><Icon name="face-smile" /></button>
          <VoiceRecorder onSend={(url) => { onSendAttachment(url, ''); afterSend(); }} disabled={uploading} />
          <input
            ref={inputRef}
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
