import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { getSocket } from '../socket.js';
import { renderRich } from '../richtext.jsx';
import Avatar from './Avatar.jsx';
import Icon from './Icon.jsx';
import Composer from './Composer.jsx';
import Attachment from './Attachment.jsx';
import EmojiPicker from './EmojiPicker.jsx';
import BookmarkButton from './BookmarkButton.jsx';
import ReminderButton from './ReminderButton.jsx';
import WatchTogether from './WatchTogether.jsx';
import ConfirmModal from './ConfirmModal.jsx';
import { ctx } from '../contextmenu.js';
import { userColor } from '../usercolor.js';
import { formatTime, formatTimeDate } from '../datetime.js';

const QUICK_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🎉'];

function shouldGroup(prev, cur) {
  if (!prev || prev.user_id !== cur.user_id || cur.attachment_url || cur.reply_to) return false;
  const gap = new Date(cur.created_at.replace(' ', 'T')) - new Date(prev.created_at.replace(' ', 'T'));
  return gap < 5 * 60 * 1000;
}

export default function ChatView({ channel, currentUser, canManage, onCreateTask, onOpenProfile, reminderMsgIds, taskMsgIds, savedMsgIds, savedByMsg }) {
  const [messages, setMessages] = useState([]);
  const [typing, setTyping] = useState({});
  const [editingId, setEditingId] = useState(null);
  const [editText, setEditText] = useState('');
  const [pickerFor, setPickerFor] = useState(null);
  const [pickerFull, setPickerFull] = useState(false);
  const [replyingTo, setReplyingTo] = useState(null);
  const [showPins, setShowPins] = useState(false);
  const [pins, setPins] = useState([]);
  const [confirmDel, setConfirmDel] = useState(null);
  const [watchOpen, setWatchOpen] = useState(false);
  useEffect(() => { setWatchOpen(false); }, [channel.id]);
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
  const del = (m) => setConfirmDel(m);
  const toggleSave = async (m) => {
    const it = savedByMsg?.get(m.id);
    try {
      if (it) await api(`/saved/${it.id}`, { method: 'DELETE' });
      else await api('/saved', { method: 'POST', body: { content: m.content, attachment_url: m.attachment_url, author_name: m.display_name, source: channel.name, source_message_id: m.id } });
      window.dispatchEvent(new Event('pulsar:saved-changed'));
    } catch { /* ignore */ }
  };
  const taskFromMsg = (m) => onCreateTask?.({ title: (m.content || '').replace(/\s+/g, ' ').trim().slice(0, 140), description: m.content && m.content.length > 140 ? m.content : '', server_id: channel.server_id, channel_id: channel.id, source_message_id: m.id, source_label: channel.name });
  const msgMenu = (m, isOwn) => ctx(() => m.deleted ? [] : [
    { label: 'Répondre', icon: 'reply', onClick: () => setReplyingTo(m) },
    onCreateTask && { label: 'Créer une tâche', icon: 'square-check', onClick: () => taskFromMsg(m) },
    { label: savedByMsg?.get(m.id) ? 'Retirer des enregistrés' : 'Enregistrer le message', icon: 'bookmark', onClick: () => toggleSave(m) },
    canManage && { label: m.pinned ? 'Détacher' : 'Épingler', icon: 'thumbtack', onClick: () => pin(m) },
    m.content && { label: 'Copier le texte', icon: 'copy', onClick: () => navigator.clipboard?.writeText(m.content) },
    (isOwn || canManage) && { sep: true },
    isOwn && { label: 'Modifier', icon: 'pen', onClick: () => startEdit(m) },
    (isOwn || canManage) && { label: 'Supprimer', icon: 'trash', danger: true, onClick: () => del(m) },
  ]);
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
      <WatchTogether channelId={channel.id} open={watchOpen} onClose={() => setWatchOpen(false)} />
      <button className="chat-pins-btn" title="Messages épinglés" onClick={togglePins}><Icon name="thumbtack" /></button>

      {showPins && (
        <div className="pins-panel">
          <div className="pins-head">Messages épinglés <button onClick={() => setShowPins(false)}><Icon name="xmark" /></button></div>
          {pins.length === 0 && <div className="pins-empty">Aucun message épinglé.</div>}
          {pins.map((m) => (
            <div className="pin-item" key={m.id}>
              <Avatar user={m} size={28} />
              <div>
                <div className="pin-author">{m.display_name}</div>
                <div className="pin-text">{renderRich(m.content, currentUser) || (m.attachment_url ? 'pièce jointe' : '')}</div>
              </div>
              {canManage && <button className="pin-remove" title="Détacher" onClick={() => pin(m)}><Icon name="xmark" /></button>}
            </div>
          ))}
        </div>
      )}

      <div className="messages" ref={scrollRef}>
        <div className="spacer-top" />
        <div className="msg-welcome">
          <h2>{channel.name}</h2>
          <p>C’est le début du salon <strong>{channel.name}</strong>. Envoyez le premier message&nbsp;!</p>
        </div>

        {messages.map((m, i) => {
          const grouped = shouldGroup(messages[i - 1], m);
          const isOwn = m.user_id === currentUser.id;
          const editing = editingId === m.id;
          const nearBottom = i >= messages.length - 3;
          const isTaskMsg = !m.deleted && taskMsgIds?.has(m.id);
          const isReminderMsg = !m.deleted && !isTaskMsg && reminderMsgIds?.has(m.id);
          const isSavedMsg = !m.deleted && !isTaskMsg && !isReminderMsg && savedMsgIds?.has(m.id);
          return (
            <div className={`message ${grouped ? 'grouped' : ''} ${m.pinned ? 'pinned' : ''} ${m.reply_to && !m.deleted ? 'is-reply' : ''} ${m.deleted ? 'is-deleted' : ''} ${isTaskMsg ? 'is-task' : ''} ${isReminderMsg ? 'is-reminder' : ''} ${isSavedMsg ? 'is-saved' : ''}`} key={m.id} onContextMenu={msgMenu(m, isOwn)}>
              {(isTaskMsg || isReminderMsg || isSavedMsg) && (
                <span className={`msg-mark ${isTaskMsg ? 'task' : isReminderMsg ? 'reminder' : 'saved'}`} title={isTaskMsg ? 'Vous avez créé une tâche depuis ce message' : isReminderMsg ? 'Vous vous êtes fait un rappel sur ce message' : 'Vous avez enregistré ce message'}>
                  <Icon name={isTaskMsg ? 'square-check' : isReminderMsg ? 'clock' : 'bookmark'} />
                </span>
              )}
              {grouped ? (
                <div className="gutter gutter-time">{m.deleted ? '' : formatTime(m.created_at)}</div>
              ) : (
                <Avatar user={m} size={40} onClick={() => onOpenProfile?.(m.user_id)} />
              )}
              <div className="msg-body">
                {m.reply_to && (
                  <div className="reply-preview">
                    <Icon name="reply" /> <strong>{m.reply_to.display_name}</strong>{' '}
                    <span>{m.reply_to.content ? m.reply_to.content.slice(0, 60) : 'pièce jointe'}</span>
                  </div>
                )}
                {!grouped && (
                  <div className="msg-head">
                    <span className="msg-author clickable" style={{ color: userColor(m.user_id ?? m.username) }} onClick={() => onOpenProfile?.(m.user_id)}
                      onContextMenu={ctx([
                        { label: 'Voir le profil', icon: 'user', onClick: () => onOpenProfile?.(m.user_id) },
                        { label: 'Copier le nom', icon: 'copy', onClick: () => navigator.clipboard?.writeText(m.display_name) },
                      ])}>{m.display_name}</span>
                    <span className="msg-time">{formatTimeDate(m.created_at)}</span>
                    {m.pinned ? <span className="msg-pin-tag" title="Épinglé"><Icon name="thumbtack" /></span> : null}
                  </div>
                )}

                {m.deleted ? (
                  <div className="msg-tombstone"><Icon name="ban" /> Message supprimé</div>
                ) : editing ? (
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
                    {m.content && <div className="msg-text">{renderRich(m.content, currentUser)}</div>}
                    {m.attachment_url && <Attachment url={m.attachment_url} name={m.attachment_name} />}
                    {m.edited ? <div className="msg-edited">modifié</div> : null}
                  </>
                )}

                {!m.deleted && m.reactions?.length > 0 && (
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

              {!editing && !m.deleted && (
                <div className="msg-actions">
                  <button title="Réagir" onClick={() => (pickerFor === m.id ? setPickerFor(null) : openPicker(m.id))}><Icon name="face-smile" /></button>
                  <button title="Répondre" onClick={() => setReplyingTo(m)}><Icon name="reply" /></button>
                  {onCreateTask && (
                    <button title="Créer une tâche depuis ce message" onClick={() => onCreateTask({
                      title: (m.content || '').replace(/\s+/g, ' ').trim().slice(0, 140),
                      description: m.content && m.content.length > 140 ? m.content : '',
                      server_id: channel.server_id,
                      channel_id: channel.id,
                      source_message_id: m.id,
                      source_label: channel.name,
                    })}><Icon name="square-check" /></button>
                  )}
                  <BookmarkButton content={m.content} attachmentUrl={m.attachment_url} authorName={m.display_name} source={channel.name} sourceMessageId={m.id} existing={savedByMsg?.get(m.id)} />
                  <ReminderButton content={m.content} attachmentUrl={m.attachment_url} authorName={m.display_name} source={channel.name} sourceMessageId={m.id} existing={savedByMsg?.get(m.id)} dropUp={nearBottom} />
                  {canManage && <button title={m.pinned ? 'Détacher' : 'Épingler'} onClick={() => pin(m)}><Icon name="thumbtack" /></button>}
                  {isOwn && <button title="Modifier" onClick={() => startEdit(m)}><Icon name="pen" /></button>}
                  {(isOwn || canManage) && <button title="Supprimer" onClick={() => del(m)}><Icon name="trash" /></button>}
                  {pickerFor === m.id && !pickerFull && (
                    <div className={`emoji-picker ${nearBottom ? 'up' : ''}`}>
                      {QUICK_EMOJIS.map((e) => (
                        <button key={e} onClick={() => react(m.id, e)}>{e}</button>
                      ))}
                      <button className="emoji-more" title="Plus" onClick={() => setPickerFull(true)}><Icon name="plus" /></button>
                    </div>
                  )}
                  {pickerFor === m.id && pickerFull && (
                    <div className={`emoji-pop ${nearBottom ? 'up' : ''}`}><EmojiPicker onPick={(e) => react(m.id, e)} onClose={() => setPickerFor(null)} /></div>
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
        placeholder={`Envoyer un message dans ${channel.name}`}
        replyingTo={replyingTo}
        onClearReply={() => setReplyingTo(null)}
        onSendText={(t) => send({ content: t })}
        onSendAttachment={(url, text, name) => send({ content: text || '', attachmentUrl: url, attachmentName: name })}
        onTyping={onTyping}
        onWatch={() => setWatchOpen((v) => !v)}
      />

      {confirmDel && (
        <ConfirmModal title="Supprimer ce message ?" message="Le message sera remplacé par « Message supprimé »." confirmLabel="Supprimer" danger
          onConfirm={() => getSocket().emit('message:delete', { messageId: confirmDel.id })} onClose={() => setConfirmDel(null)} />
      )}
    </div>
  );
}
