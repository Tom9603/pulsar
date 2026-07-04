import { useEffect, useRef, useState } from 'react';
import { api, uploadImage, mediaUrl } from '../api.js';
import { getSocket } from '../socket.js';
import Avatar from './Avatar.jsx';

const QUICK_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🎉'];

function formatTime(ts) {
  const d = new Date(ts.replace(' ', 'T') + 'Z');
  return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

function shouldGroup(prev, cur) {
  if (!prev || prev.user_id !== cur.user_id || cur.attachment_url) return false;
  const gap = new Date(cur.created_at.replace(' ', 'T')) - new Date(prev.created_at.replace(' ', 'T'));
  return gap < 5 * 60 * 1000;
}

/** Surligne les mentions @pseudo dans le texte. */
function renderContent(text, currentUser) {
  if (!text) return null;
  const parts = [];
  const regex = /(@[\w.-]+)/g;
  let last = 0;
  let match;
  let key = 0;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > last) parts.push(text.slice(last, match.index));
    const tag = match[1];
    const low = tag.toLowerCase();
    const isMe = low === '@' + currentUser.username.toLowerCase() || low === '@' + currentUser.display_name.toLowerCase();
    parts.push(<span key={key++} className={`mention ${isMe ? 'mention-me' : ''}`}>{tag}</span>);
    last = match.index + tag.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

const readAsDataURL = (file) =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });

export default function ChatView({ channel, currentUser, canManage }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [typing, setTyping] = useState({});
  const [editingId, setEditingId] = useState(null);
  const [editText, setEditText] = useState('');
  const [pickerFor, setPickerFor] = useState(null);
  const [uploading, setUploading] = useState(false);
  const scrollRef = useRef(null);
  const typingTimers = useRef({});
  const lastTypingSent = useRef(0);

  useEffect(() => {
    let cancelled = false;
    setMessages([]);
    api(`/channels/${channel.id}/messages`).then(({ messages }) => {
      if (!cancelled) setMessages(messages);
    });
    return () => { cancelled = true; };
  }, [channel.id]);

  useEffect(() => {
    const socket = getSocket();
    const onNew = ({ channelId, message }) => {
      if (channelId !== channel.id) return;
      setMessages((prev) => [...prev, message]);
      setTyping((prev) => { const n = { ...prev }; delete n[message.user_id]; return n; });
    };
    const onUpdated = ({ channelId, message }) => {
      if (channelId !== channel.id) return;
      setMessages((prev) => prev.map((m) => (m.id === message.id ? message : m)));
    };
    const onDeleted = ({ channelId, messageId }) => {
      if (channelId !== channel.id) return;
      setMessages((prev) => prev.filter((m) => m.id !== messageId));
    };
    const onReaction = ({ channelId, messageId, reactions }) => {
      if (channelId !== channel.id) return;
      setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, reactions } : m)));
    };
    const onTyping = ({ channelId, user }) => {
      if (channelId !== channel.id || user.id === currentUser.id) return;
      setTyping((prev) => ({ ...prev, [user.id]: user.display_name }));
      clearTimeout(typingTimers.current[user.id]);
      typingTimers.current[user.id] = setTimeout(() => {
        setTyping((prev) => { const n = { ...prev }; delete n[user.id]; return n; });
      }, 4000);
    };

    socket.on('message:new', onNew);
    socket.on('message:updated', onUpdated);
    socket.on('message:deleted', onDeleted);
    socket.on('reaction:update', onReaction);
    socket.on('typing', onTyping);
    return () => {
      socket.off('message:new', onNew);
      socket.off('message:updated', onUpdated);
      socket.off('message:deleted', onDeleted);
      socket.off('reaction:update', onReaction);
      socket.off('typing', onTyping);
    };
  }, [channel.id, currentUser.id]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, typing]);

  function handleChange(e) {
    setInput(e.target.value);
    const now = Date.now();
    if (now - lastTypingSent.current > 2000) {
      lastTypingSent.current = now;
      getSocket().emit('typing', { channelId: channel.id });
    }
  }

  function send(e) {
    e.preventDefault();
    const content = input.trim();
    if (!content) return;
    getSocket().emit('message:send', { channelId: channel.id, content });
    setInput('');
  }

  async function onPickImage(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > 4 * 1024 * 1024) { alert('Image trop lourde (4 Mo max).'); return; }
    setUploading(true);
    try {
      const url = await uploadImage(await readAsDataURL(file));
      getSocket().emit('message:send', { channelId: channel.id, content: input.trim(), attachmentUrl: url });
      setInput('');
    } catch (err) {
      alert(err.message);
    } finally {
      setUploading(false);
    }
  }

  const react = (messageId, emoji) => { getSocket().emit('reaction:toggle', { messageId, emoji }); setPickerFor(null); };
  const del = (m) => { if (confirm('Supprimer ce message ?')) getSocket().emit('message:delete', { messageId: m.id }); };
  const startEdit = (m) => { setEditingId(m.id); setEditText(m.content); };
  function submitEdit(m) {
    const t = editText.trim();
    if (t && t !== m.content) getSocket().emit('message:edit', { messageId: m.id, content: t });
    setEditingId(null);
  }

  const typingNames = Object.values(typing);

  return (
    <div className="chat-area">
      <div className="messages" ref={scrollRef}>
        <div className="spacer-top" />
        <div className="msg-welcome">
          <h2># {channel.name}</h2>
          <p>C’est le début du salon <strong>#{channel.name}</strong>. Envoie le premier message&nbsp;!</p>
        </div>

        {messages.map((m, i) => {
          const grouped = shouldGroup(messages[i - 1], m);
          const isOwn = m.user_id === currentUser.id;
          const editing = editingId === m.id;
          return (
            <div className={`message ${grouped ? 'grouped' : ''}`} key={m.id}>
              {grouped ? (
                <div className="gutter gutter-time">{formatTime(m.created_at)}</div>
              ) : (
                <Avatar user={m} size={40} />
              )}
              <div className="msg-body">
                {!grouped && (
                  <div className="msg-head">
                    <span className="msg-author">{m.display_name}</span>
                    <span className="msg-time">{formatTime(m.created_at)}</span>
                  </div>
                )}

                {editing ? (
                  <input
                    className="msg-edit-input"
                    autoFocus
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') submitEdit(m);
                      if (e.key === 'Escape') setEditingId(null);
                    }}
                    onBlur={() => setEditingId(null)}
                  />
                ) : (
                  <>
                    {m.content && (
                      <div className="msg-text">
                        {renderContent(m.content, currentUser)}
                        {m.edited ? <span className="msg-edited"> (modifié)</span> : null}
                      </div>
                    )}
                    {m.attachment_url && (
                      <img
                        className="msg-image"
                        src={mediaUrl(m.attachment_url)}
                        alt="pièce jointe"
                        onClick={() => window.open(mediaUrl(m.attachment_url), '_blank')}
                      />
                    )}
                  </>
                )}

                {m.reactions?.length > 0 && (
                  <div className="reactions">
                    {m.reactions.map((r) => (
                      <button
                        key={r.emoji}
                        className={`reaction-chip ${r.userIds.includes(currentUser.id) ? 'reacted' : ''}`}
                        onClick={() => react(m.id, r.emoji)}
                      >
                        {r.emoji} {r.count}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {!editing && (
                <div className="msg-actions">
                  <button title="Réagir" onClick={() => setPickerFor(pickerFor === m.id ? null : m.id)}>😊</button>
                  {isOwn && <button title="Modifier" onClick={() => startEdit(m)}>✏️</button>}
                  {(isOwn || canManage) && <button title="Supprimer" onClick={() => del(m)}>🗑️</button>}
                  {pickerFor === m.id && (
                    <div className="emoji-picker">
                      {QUICK_EMOJIS.map((e) => (
                        <button key={e} onClick={() => react(m.id, e)}>{e}</button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="typing-line">
        {typingNames.length > 0 &&
          (typingNames.length === 1
            ? `${typingNames[0]} est en train d’écrire…`
            : `${typingNames.join(', ')} sont en train d’écrire…`)}
      </div>

      <form className="composer" onSubmit={send}>
        <div className="composer-inner">
          <label className="composer-attach" title="Envoyer une image">
            📎
            <input type="file" accept="image/*" hidden onChange={onPickImage} />
          </label>
          <input
            value={input}
            onChange={handleChange}
            placeholder={uploading ? 'Envoi de l’image…' : `Envoyer un message dans #${channel.name}`}
            maxLength={2000}
            disabled={uploading}
          />
        </div>
      </form>
    </div>
  );
}
