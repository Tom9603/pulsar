import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { getSocket } from '../socket.js';
import { renderRich } from '../richtext.jsx';
import Avatar from './Avatar.jsx';
import Composer from './Composer.jsx';
import Attachment from './Attachment.jsx';
import EmojiPicker from './EmojiPicker.jsx';

const QUICK_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🎉'];

function formatTime(ts) {
  const d = new Date(ts.replace(' ', 'T') + 'Z');
  return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

function shouldGroup(prev, cur) {
  if (!prev || prev.user_id !== cur.user_id || cur.attachment_url || cur.reply_to) return false;
  const gap = new Date(cur.created_at.replace(' ', 'T')) - new Date(prev.created_at.replace(' ', 'T'));
  return gap < 5 * 60 * 1000;
}

export default function ChatView({ channel, currentUser, canManage }) {
  const [messages, setMessages] = useState([]);
  const [typing, setTyping] = useState({});
  const [editingId, setEditingId] = useState(null);
  const [editText, setEditText] = useState('');
  const [pickerFor, setPickerFor] = useState(null);
  const [pickerFull, setPickerFull] = useState(false);
  const [replyingTo, setReplyingTo] = useState(null);
  const [showPins, setShowPins] = useState(false);
  const [pins, setPins] = useState([]);
  const scrollRef = useRef(null);
  const typingTimers = useRef({});
  const lastTypingSent = useRef(0);

  useEffect(() => {
    let cancelled = false;
    setMessages([]);
    setReplyingTo(null);
    setShowPins(false);
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
    const onPins = ({ channelId }) => { if (channelId === channel.id && showPins) loadPins(); };
    const onTypingEvt = ({ channelId, user }) => {
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
    socket.on('pins:changed', onPins);
    socket.on('typing', onTypingEvt);
    return () => {
      socket.off('message:new', onNew);
      socket.off('message:updated', onUpdated);
      socket.off('message:deleted', onDeleted);
      socket.off('reaction:update', onReaction);
      socket.off('pins:changed', onPins);
      socket.off('typing', onTypingEvt);
    };
  }, [channel.id, currentUser.id, showPins]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, typing]);

  function loadPins() { api(`/channels/${channel.id}/pins`).then(({ messages }) => setPins(messages)); }
  function togglePins() { setShowPins((v) => { if (!v) loadPins(); return !v; }); }

  function onTyping() {
    const now = Date.now();
    if (now - lastTypingSent.current > 2000) {
      lastTypingSent.current = now;
      getSocket().emit('typing', { channelId: channel.id });
    }
  }

  const react = (messageId, emoji) => { getSocket().emit('reaction:toggle', { messageId, emoji }); setPickerFor(null); setPickerFull(false); };
  const del = (m) => { if (confirm('Supprimer ce message ?')) getSocket().emit('message:delete', { messageId: m.id }); };
  const pin = (m) => getSocket().emit('message:pin', { messageId: m.id, pinned: !m.pinned });
  const startEdit = (m) => { setEditingId(m.id); setEditText(m.content); };
  function submitEdit(m) {
    const t = editText.trim();
    if (t && t !== m.content) getSocket().emit('message:edit', { messageId: m.id, content: t });
    setEditingId(null);
  }
  function openPicker(id) { setPickerFor(id); setPickerFull(false); }

  const send = (extra) => getSocket().emit('message:send', { channelId: channel.id, replyTo: replyingTo?.id, ...extra });
  const typingNames = Object.values(typing);

  return (
    <div className="chat-area">
      <button className="chat-pins-btn" title="Messages épinglés" onClick={togglePins}>📌</button>

      {showPins && (
        <div className="pins-panel">
          <div className="pins-head">Messages épinglés <button onClick={() => setShowPins(false)}>✕</button></div>
          {pins.length === 0 && <div className="pins-empty">Aucun message épinglé.</div>}
          {pins.map((m) => (
            <div className="pin-item" key={m.id}>
              <Avatar user={m} size={28} />
              <div>
                <div className="pin-author">{m.display_name}</div>
                <div className="pin-text">{renderRich(m.content, currentUser) || (m.attachment_url ? '📎 pièce jointe' : '')}</div>
              </div>
              {canManage && <button className="pin-remove" title="Détacher" onClick={() => pin(m)}>✕</button>}
            </div>
          ))}
        </div>
      )}

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
            <div className={`message ${grouped ? 'grouped' : ''} ${m.pinned ? 'pinned' : ''}`} key={m.id}>
              {grouped ? (
                <div className="gutter gutter-time">{formatTime(m.created_at)}</div>
              ) : (
                <Avatar user={m} size={40} />
              )}
              <div className="msg-body">
                {m.reply_to && (
                  <div className="reply-preview">
                    ↪ <strong>{m.reply_to.display_name}</strong>{' '}
                    <span>{m.reply_to.content ? m.reply_to.content.slice(0, 60) : '📎 pièce jointe'}</span>
                  </div>
                )}
                {!grouped && (
                  <div className="msg-head">
                    <span className="msg-author">{m.display_name}</span>
                    <span className="msg-time">{formatTime(m.created_at)}</span>
                    {m.pinned ? <span className="msg-pin-tag" title="Épinglé">📌</span> : null}
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
                        {renderRich(m.content, currentUser)}
                        {m.edited ? <span className="msg-edited"> (modifié)</span> : null}
                      </div>
                    )}
                    {m.attachment_url && <Attachment url={m.attachment_url} name={m.attachment_name} />}
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
                  <button title="Réagir" onClick={() => (pickerFor === m.id ? setPickerFor(null) : openPicker(m.id))}>😊</button>
                  <button title="Répondre" onClick={() => setReplyingTo(m)}>↩️</button>
                  {canManage && <button title={m.pinned ? 'Détacher' : 'Épingler'} onClick={() => pin(m)}>📌</button>}
                  {isOwn && <button title="Modifier" onClick={() => startEdit(m)}>✏️</button>}
                  {(isOwn || canManage) && <button title="Supprimer" onClick={() => del(m)}>🗑️</button>}
                  {pickerFor === m.id && !pickerFull && (
                    <div className="emoji-picker">
                      {QUICK_EMOJIS.map((e) => (
                        <button key={e} onClick={() => react(m.id, e)}>{e}</button>
                      ))}
                      <button className="emoji-more" title="Plus" onClick={() => setPickerFull(true)}>➕</button>
                    </div>
                  )}
                  {pickerFor === m.id && pickerFull && (
                    <div className="emoji-pop"><EmojiPicker onPick={(e) => react(m.id, e)} onClose={() => setPickerFor(null)} /></div>
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

      <Composer
        placeholder={`Envoyer un message dans #${channel.name}`}
        replyingTo={replyingTo}
        onClearReply={() => setReplyingTo(null)}
        onSendText={(t) => send({ content: t })}
        onSendAttachment={(url, text, name) => send({ content: text || '', attachmentUrl: url, attachmentName: name })}
        onTyping={onTyping}
      />
    </div>
  );
}
