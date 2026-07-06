import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { getSocket } from '../socket.js';
import { renderRich } from '../richtext.jsx';
import Avatar from './Avatar.jsx';
import Icon from './Icon.jsx';
import Composer from './Composer.jsx';
import Attachment from './Attachment.jsx';
import EmojiPicker from './EmojiPicker.jsx';
import SaveButton from './SaveButton.jsx';
import ConfirmModal from './ConfirmModal.jsx';
import { ctx } from '../contextmenu.js';

const QUICK_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🎉'];

function formatTime(ts) {
  const d = new Date(ts.replace(' ', 'T') + 'Z');
  return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

/** Conversation privée : mêmes options qu'un salon (réponse, réactions, tâche, rappel, édition…). */
export default function DmChat({ peer, currentUser, onlineIds, onCall, onOpenProfile, onCreateTask, reminderMsgIds, taskMsgIds }) {
  const [messages, setMessages] = useState([]);
  const [peerTyping, setPeerTyping] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editText, setEditText] = useState('');
  const [pickerFor, setPickerFor] = useState(null);
  const [pickerFull, setPickerFull] = useState(false);
  const [replyingTo, setReplyingTo] = useState(null);
  const [confirmDel, setConfirmDel] = useState(null);
  const [showPins, setShowPins] = useState(false);
  const [pins, setPins] = useState([]);
  const scrollRef = useRef(null);
  const typingTimer = useRef(null);
  const lastTypingSent = useRef(0);
  const online = new Set(onlineIds).has(peer.id);

  useEffect(() => {
    let cancelled = false;
    setMessages([]); setReplyingTo(null); setEditingId(null); setShowPins(false);
    api(`/dms/${peer.id}/messages`).then(({ messages }) => { if (!cancelled) setMessages(messages); });
    return () => { cancelled = true; };
  }, [peer.id]);

  const loadPins = () => api(`/dms/${peer.id}/pins`).then(({ messages }) => setPins(messages)).catch(() => {});
  const togglePins = () => setShowPins((v) => { if (!v) loadPins(); return !v; });
  const pin = (m) => getSocket().emit('dm:pin', { messageId: m.id, pinned: !m.pinned });

  useEffect(() => {
    const socket = getSocket();
    const involvesPeer = (m) => (m.sender_id === peer.id && m.recipient_id === currentUser.id) || (m.sender_id === currentUser.id && m.recipient_id === peer.id);
    const onNew = ({ message }) => { if (involvesPeer(message)) setMessages((prev) => [...prev, message]); };
    const onUpdated = ({ message }) => { if (involvesPeer(message)) setMessages((prev) => prev.map((m) => (m.id === message.id ? message : m))); };
    const onReaction = ({ messageId, reactions }) => setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, reactions } : m)));
    const onPins = () => { if (showPins) loadPins(); };
    const onTyping = ({ fromUserId }) => {
      if (fromUserId !== peer.id) return;
      setPeerTyping(true);
      clearTimeout(typingTimer.current);
      typingTimer.current = setTimeout(() => setPeerTyping(false), 4000);
    };
    socket.on('dm:new', onNew);
    socket.on('dm:updated', onUpdated);
    socket.on('dm:reaction', onReaction);
    socket.on('dm:pins-changed', onPins);
    socket.on('dm:typing', onTyping);
    return () => { socket.off('dm:new', onNew); socket.off('dm:updated', onUpdated); socket.off('dm:reaction', onReaction); socket.off('dm:pins-changed', onPins); socket.off('dm:typing', onTyping); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [peer.id, currentUser.id, showPins]);

  useEffect(() => { const el = scrollRef.current; if (el) el.scrollTop = el.scrollHeight; }, [messages, peerTyping]);

  function onTypingSignal() {
    const now = Date.now();
    if (now - lastTypingSent.current > 2000) { lastTypingSent.current = now; getSocket().emit('dm:typing', { toUserId: peer.id }); }
  }

  const react = (messageId, emoji) => { getSocket().emit('dm:react', { messageId, emoji }); setPickerFor(null); setPickerFull(false); };
  const startEdit = (m) => { setEditingId(m.id); setEditText(m.content); };
  function submitEdit(m) { const t = editText.trim(); if (t && t !== m.content) getSocket().emit('dm:edit', { messageId: m.id, content: t }); setEditingId(null); }
  const send = (extra) => getSocket().emit('dm:send', { toUserId: peer.id, replyTo: replyingTo?.id, ...extra });
  const quickSave = (m) => api('/saved', { method: 'POST', body: { content: m.content, attachment_url: m.attachment_url, author_name: m.display_name, source: `@${peer.username}`, source_message_id: m.id } })
    .then(() => window.dispatchEvent(new Event('pulsar:saved-changed'))).catch(() => {});
  const msgMenu = (m, isOwn) => ctx(() => m.deleted ? [] : [
    { label: 'Répondre', icon: 'reply', onClick: () => setReplyingTo(m) },
    onCreateTask && { label: 'Créer une tâche', icon: 'square-check', onClick: () => onCreateTask({ title: (m.content || '').replace(/\s+/g, ' ').trim().slice(0, 140), description: m.content && m.content.length > 140 ? m.content : '', source_message_id: m.id, source_label: `@${peer.username}`, peer: { id: peer.id, display_name: peer.display_name } }) },
    { label: 'Enregistrer le message', icon: 'bookmark', onClick: () => quickSave(m) },
    { label: m.pinned ? 'Détacher' : 'Épingler', icon: 'thumbtack', onClick: () => pin(m) },
    m.content && { label: 'Copier le texte', icon: 'copy', onClick: () => navigator.clipboard?.writeText(m.content) },
    isOwn && { sep: true },
    isOwn && { label: 'Modifier', icon: 'pen', onClick: () => startEdit(m) },
    isOwn && { label: 'Supprimer', icon: 'trash', danger: true, onClick: () => setConfirmDel(m) },
  ]);

  return (
    <div className="main-content">
      <div className="content-header">
        <Avatar user={peer} size={24} status={online ? peer.status : 'offline'} onClick={() => onOpenProfile?.(peer.id)} />
        <span className="clickable" onClick={() => onOpenProfile?.(peer.id)}>{peer.display_name}</span>
        <span className="topic">@{peer.username}</span>
        <span className="spacer" />
        <button className="header-btn" title="Appel vocal" onClick={() => onCall(peer)}><Icon name="phone" /></button>
      </div>

      <div className="content-body">
        <div className="chat-area">
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
                  <button className="pin-remove" title="Détacher" onClick={() => pin(m)}><Icon name="xmark" /></button>
                </div>
              ))}
            </div>
          )}
          <div className="messages" ref={scrollRef}>
            <div className="spacer-top" />
            <div className="msg-welcome">
              <Avatar user={peer} size={64} onClick={() => onOpenProfile?.(peer.id)} />
              <h2 style={{ marginTop: 12 }}>{peer.display_name}</h2>
              <p>Ceci est le début de votre conversation privée avec <strong>{peer.display_name}</strong>.</p>
            </div>

            {messages.map((m, i) => {
              const prev = messages[i - 1];
              const grouped = prev && prev.sender_id === m.sender_id && !m.attachment_url && !m.reply_to && !m.deleted;
              const isOwn = m.sender_id === currentUser.id;
              const editing = editingId === m.id;
              const nearBottom = i >= messages.length - 3;
              const isTaskMsg = !m.deleted && taskMsgIds?.has(m.id);
              const isReminderMsg = !m.deleted && !isTaskMsg && reminderMsgIds?.has(m.id);
              return (
                <div className={`message ${grouped ? 'grouped' : ''} ${m.pinned && !m.deleted ? 'pinned' : ''} ${m.reply_to && !m.deleted ? 'is-reply' : ''} ${m.deleted ? 'is-deleted' : ''} ${isTaskMsg ? 'is-task' : ''} ${isReminderMsg ? 'is-reminder' : ''}`} key={m.id} onContextMenu={msgMenu(m, isOwn)}>
                  {(isTaskMsg || isReminderMsg) && (
                    <span className={`msg-mark ${isTaskMsg ? 'task' : 'reminder'}`} title={isTaskMsg ? 'Vous avez créé une tâche depuis ce message' : 'Vous avez enregistré ce message'}>
                      <Icon name={isTaskMsg ? 'square-check' : 'bookmark'} />
                    </span>
                  )}
                  {grouped ? <div className="gutter gutter-time">{m.deleted ? '' : formatTime(m.created_at)}</div> : <Avatar user={m} size={40} onClick={() => onOpenProfile?.(m.sender_id)} />}
                  <div className="msg-body">
                    {m.reply_to && (
                      <div className="reply-preview"><Icon name="reply" /> <strong>{m.reply_to.display_name}</strong> <span>{m.reply_to.content ? m.reply_to.content.slice(0, 60) : 'pièce jointe'}</span></div>
                    )}
                    {!grouped && (
                      <div className="msg-head">
                        <span className="msg-author clickable" onClick={() => onOpenProfile?.(m.sender_id)}>{m.display_name}</span>
                        <span className="msg-time">{formatTime(m.created_at)}</span>
                      </div>
                    )}
                    {m.deleted ? (
                      <div className="msg-tombstone"><Icon name="ban" /> Message supprimé</div>
                    ) : editing ? (
                      <input className="msg-edit-input" autoFocus value={editText} onChange={(e) => setEditText(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') submitEdit(m); if (e.key === 'Escape') setEditingId(null); }} onBlur={() => setEditingId(null)} />
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
                          <button key={r.emoji} className={`reaction-chip ${r.userIds.includes(currentUser.id) ? 'reacted' : ''}`} onClick={() => react(m.id, r.emoji)}>{r.emoji} {r.count}</button>
                        ))}
                      </div>
                    )}
                  </div>

                  {!editing && !m.deleted && (
                    <div className="msg-actions">
                      <button title="Réagir" onClick={() => (pickerFor === m.id ? setPickerFor(null) : (setPickerFor(m.id), setPickerFull(false)))}><Icon name="face-smile" /></button>
                      <button title="Répondre" onClick={() => setReplyingTo(m)}><Icon name="reply" /></button>
                      {onCreateTask && (
                        <button title="Créer une tâche depuis ce message" onClick={() => onCreateTask({
                          title: (m.content || '').replace(/\s+/g, ' ').trim().slice(0, 140),
                          description: m.content && m.content.length > 140 ? m.content : '',
                          source_message_id: m.id, source_label: `@${peer.username}`,
                          peer: { id: peer.id, display_name: peer.display_name },
                        })}><Icon name="square-check" /></button>
                      )}
                      <SaveButton content={m.content} attachmentUrl={m.attachment_url} authorName={m.display_name} source={`@${peer.username}`} sourceMessageId={m.id} dropUp={nearBottom} />
                      <button title={m.pinned ? 'Détacher' : 'Épingler'} onClick={() => pin(m)}><Icon name="thumbtack" /></button>
                      {isOwn && <button title="Modifier" onClick={() => startEdit(m)}><Icon name="pen" /></button>}
                      {isOwn && <button title="Supprimer" onClick={() => setConfirmDel(m)}><Icon name="trash" /></button>}
                      {pickerFor === m.id && !pickerFull && (
                        <div className={`emoji-picker ${nearBottom ? 'up' : ''}`}>
                          {QUICK_EMOJIS.map((e) => <button key={e} onClick={() => react(m.id, e)}>{e}</button>)}
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

          <div className="typing-line">{peerTyping && `${peer.display_name} est en train d’écrire…`}</div>

          <Composer
            placeholder={`Envoyer un message à ${peer.display_name}`}
            replyingTo={replyingTo}
            onClearReply={() => setReplyingTo(null)}
            onSendText={(t) => send({ content: t })}
            onSendAttachment={(url, text, name) => send({ content: text || '', attachmentUrl: url, attachmentName: name })}
            onTyping={onTypingSignal}
          />

          {confirmDel && (
            <ConfirmModal title="Supprimer ce message ?" message="Le message sera remplacé par « Message supprimé »." confirmLabel="Supprimer" danger
              onConfirm={() => getSocket().emit('dm:delete', { messageId: confirmDel.id })} onClose={() => setConfirmDel(null)} />
          )}
        </div>
      </div>
    </div>
  );
}
