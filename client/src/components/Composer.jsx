import { useRef, useState } from 'react';
import { uploadFile } from '../api.js';
import Icon from './Icon.jsx';
import Avatar from './Avatar.jsx';
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
export default function Composer({ placeholder, onSendText, onSendAttachment, onTyping, replyingTo, onClearReply, onWatch, mentionables }) {
  const [input, setInput] = useState('');
  const [uploading, setUploading] = useState(false);
  const [panel, setPanel] = useState(null); // 'gif' | 'emoji' | null
  const [mention, setMention] = useState(null); // { items, index } — suggestions @ (serveur uniquement)
  const inputRef = useRef(null);

  function afterSend() {
    setInput('');
    setMention(null);
    onClearReply?.();
  }

  // Autocomplétion des mentions : détecte « @requête » juste avant le curseur (serveurs seulement).
  function refreshMention(value, caret) {
    if (!mentionables || mentionables.length === 0) { setMention(null); return; }
    const before = value.slice(0, caret);
    const m = /(^|\s)@([\w.\-]*)$/.exec(before);
    if (!m) { setMention(null); return; }
    const q = m[2].toLowerCase();
    const items = mentionables
      .filter((u) => (u.display_name || '').toLowerCase().includes(q) || (u.username || '').toLowerCase().includes(q))
      .slice(0, 8);
    setMention(items.length ? { items, index: 0 } : null);
  }

  function applyMention(u) {
    const el = inputRef.current;
    const caret = el ? el.selectionStart : input.length;
    const before = input.slice(0, caret).replace(/@[\w.\-]*$/, `@${u.username} `);
    const after = input.slice(caret);
    const next = before + after;
    setInput(next);
    setMention(null);
    requestAnimationFrame(() => { if (el) { el.focus(); el.selectionStart = el.selectionEnd = before.length; } });
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
    refreshMention(e.target.value, e.target.selectionStart);
    onTyping?.();
  }

  function onKeyDown(e) {
    if (!mention) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setMention((m) => ({ ...m, index: (m.index + 1) % m.items.length })); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setMention((m) => ({ ...m, index: (m.index - 1 + m.items.length) % m.items.length })); }
    else if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); applyMention(mention.items[mention.index]); }
    else if (e.key === 'Escape') { e.preventDefault(); setMention(null); }
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

      {mention && (
        <div className="mention-pop">
          <div className="mention-pop-title">Mentionner…</div>
          {mention.items.map((u, i) => (
            <button type="button" key={u.id} className={`mention-item ${i === mention.index ? 'active' : ''}`}
              onMouseDown={(e) => { e.preventDefault(); applyMention(u); }} onMouseEnter={() => setMention((m) => ({ ...m, index: i }))}>
              <Avatar user={u} size={24} />
              <span className="mi-name">{u.display_name}</span>
              <span className="mi-user">@{u.username}</span>
            </button>
          ))}
        </div>
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
          {onWatch && (
            <button type="button" className="composer-attach" title="Regarder / écouter ensemble" onClick={onWatch}><Icon name="tv" /></button>
          )}
          <VoiceRecorder onSend={(url) => { onSendAttachment(url, ''); afterSend(); }} disabled={uploading} />
          <input
            ref={inputRef}
            value={input}
            onChange={change}
            onKeyDown={onKeyDown}
            onBlur={() => setTimeout(() => setMention(null), 120)}
            placeholder={uploading ? 'Envoi…' : placeholder}
            maxLength={2000}
            disabled={uploading}
          />
        </div>
      </form>
    </div>
  );
}
