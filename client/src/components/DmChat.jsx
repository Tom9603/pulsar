import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { getSocket } from '../socket.js';
import { notify } from '../notice.js';
import { renderRich } from '../richtext.jsx';
import Avatar from './Avatar.jsx';
import Icon from './Icon.jsx';
import Composer from './Composer.jsx';
import ReportModal from './ReportModal.jsx';
import FileDropZone from './FileDropZone.jsx';
import { sendFiles } from '../attachments.js';
import Attachment from './Attachment.jsx';
import EmojiPicker from './EmojiPicker.jsx';
import BookmarkButton from './BookmarkButton.jsx';
import ReminderButton from './ReminderButton.jsx';
import ConfirmModal from './ConfirmModal.jsx';
import WatchTogether from './WatchTogether.jsx';
import Whiteboard from './Whiteboard.jsx';
import { ctx } from '../contextmenu.js';
import { userColor } from '../usercolor.js';
import { formatTime, formatTimeDate } from '../datetime.js';
import { useConfirm } from '../context/ConfirmContext.jsx';

const QUICK_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🎉'];

/** Conversation privée : mêmes options qu'un salon (réponse, réactions, tâche, rappel, édition…). */
export default function DmChat({ peer, currentUser, onlineIds, onCall, onOpenProfile, onCreateTask, onForward, reminderMsgIds, taskMsgIds, savedMsgIds, savedByMsg, aiEnabled }) {
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
  const [watchOpen, setWatchOpen] = useState(false);
  const [reportTarget, setReportTarget] = useState(null); // message privé à signaler
  const [showSearch, setShowSearch] = useState(false);
  const [searchQ, setSearchQ] = useState('');
  const [boardOpen, setBoardOpen] = useState(false);
  useEffect(() => { setWatchOpen(false); setShowSearch(false); setSearchQ(''); setBoardOpen(false); }, [peer.id]);
  const searchHits = searchQ.trim().length < 2 ? [] : messages.filter((m) => !m.deleted && (m.content || '').toLowerCase().includes(searchQ.trim().toLowerCase()));
  function jumpToMessage(id) {
    const el = scrollRef.current?.querySelector(`[data-mid="${id}"]`);
    if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 1600); }
  }
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
  const confirm = useConfirm();
  // Clic sur une épingle : fermer le panneau et sauter au message.
  const jumpFromPin = (id) => { setShowPins(false); requestAnimationFrame(() => jumpToMessage(id)); };
  // Détacher demande confirmation (on ne détache pas par mégarde).
  const removePin = async (m, e) => {
    e.stopPropagation();
    const ok = await confirm({
      title: 'Détacher ce message ?',
      message: 'Il ne sera plus épinglé dans cette conversation. Vous pourrez le ré-épingler plus tard.',
      confirmLabel: 'Détacher', danger: true,
    });
    if (ok) pin(m);
  };

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
    const onRefused = ({ toUserId }) => { if (toUserId === peer.id) notify('Cette personne n’accepte les messages privés que de ses contacts.'); };
    const onBlocked = ({ toUserId }) => { if (toUserId === peer.id) notify('Message non envoyé.'); };
    socket.on('dm:new', onNew);
    socket.on('dm:updated', onUpdated);
    socket.on('dm:reaction', onReaction);
    socket.on('dm:pins-changed', onPins);
    socket.on('dm:typing', onTyping);
    socket.on('dm:refused', onRefused);
    socket.on('dm:blocked', onBlocked);
    return () => { socket.off('dm:new', onNew); socket.off('dm:updated', onUpdated); socket.off('dm:reaction', onReaction); socket.off('dm:pins-changed', onPins); socket.off('dm:typing', onTyping); socket.off('dm:refused', onRefused); socket.off('dm:blocked', onBlocked); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [peer.id, currentUser.id, showPins]);

  // Descend en bas à chaque nouveau message ET en changeant d'interlocuteur.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    requestAnimationFrame(() => { el.scrollTop = el.scrollHeight; });
  }, [messages, peerTyping, peer.id]);

  function onTypingSignal() {
    const now = Date.now();
    if (now - lastTypingSent.current > 2000) { lastTypingSent.current = now; getSocket().emit('dm:typing', { toUserId: peer.id }); }
  }

  const react = (messageId, emoji) => { getSocket().emit('dm:react', { messageId, emoji }); setPickerFor(null); setPickerFull(false); };
  const startEdit = (m) => { setEditingId(m.id); setEditText(m.content); };
  function submitEdit(m) { const t = editText.trim(); if (t && t !== m.content) getSocket().emit('dm:edit', { messageId: m.id, content: t }); setEditingId(null); }
  const send = (extra) => getSocket().emit('dm:send', { toUserId: peer.id, replyTo: replyingTo?.id, ...extra });
  const toggleSave = async (m) => {
    const it = savedByMsg?.get(m.id);
    try {
      if (it) await api(`/saved/${it.id}`, { method: 'DELETE' });
      else await api('/saved', { method: 'POST', body: { content: m.content, attachment_url: m.attachment_url, author_name: m.display_name, source: `@${peer.username}`, source_message_id: m.id } });
      window.dispatchEvent(new Event('pulsar:saved-changed'));
    } catch { /* ignore */ }
  };
  const msgMenu = (m, isOwn) => ctx(() => m.deleted ? [] : [
    { label: 'Répondre', icon: 'reply', onClick: () => setReplyingTo(m) },
    onForward && { label: 'Transférer', icon: 'share', onClick: () => onForward(m) },
    { sep: true },
    onCreateTask && { label: 'Créer une tâche', icon: 'circle-check', onClick: () => onCreateTask({ title: (m.content || '').replace(/\s+/g, ' ').trim().slice(0, 140), description: m.content && m.content.length > 140 ? m.content : '', source_message_id: m.id, source_label: `@${peer.username}`, peer: { id: peer.id, display_name: peer.display_name } }) },
    { label: savedByMsg?.get(m.id) ? 'Retirer des enregistrés' : 'Enregistrer le message', icon: 'bookmark', onClick: () => toggleSave(m) },
    { label: m.pinned ? 'Détacher' : 'Épingler', icon: 'thumbtack', onClick: () => pin(m) },
    m.content && { label: 'Copier le texte', icon: 'copy', onClick: () => navigator.clipboard?.writeText(m.content) },
    !isOwn && { label: 'Signaler', icon: 'flag', onClick: () => setReportTarget({ type: 'dm', id: m.id }) },
    isOwn && { sep: true },
    isOwn && { label: 'Modifier', icon: 'pen', onClick: () => startEdit(m) },
    isOwn && { label: 'Supprimer', icon: 'trash', danger: true, onClick: () => setConfirmDel(m) },
  ]);

  const sendAttachment = (url, text, name) => send({ content: text || '', attachmentUrl: url, attachmentName: name });

  return (
    <FileDropZone onFiles={(files) => sendFiles(files, sendAttachment)} label={`Déposez pour envoyer à ${peer.display_name}`}>
    <div className="main-content">
      <div className="content-header">
        <Avatar user={peer} size={24} status={online ? peer.status : 'offline'} onClick={() => onOpenProfile?.(peer.id)} />
        <span className="clickable" onClick={() => onOpenProfile?.(peer.id)}>{peer.display_name}</span>
        <span className="topic">@{peer.username}</span>
        <span className="spacer" />
        <button className="header-btn" title="Tableau blanc partagé" onClick={() => setBoardOpen(true)}><Icon name="palette" /></button>
        <button className={`header-btn ${showSearch ? 'active' : ''}`} title="Rechercher dans la conversation" onClick={() => setShowSearch((v) => !v)}><Icon name="magnifying-glass" /></button>
        <button className={`header-btn ${showPins ? 'active' : ''}`} title="Messages épinglés" onClick={togglePins}><Icon name="thumbtack" /></button>
        <button className="header-btn header-call" title="Appel vocal" onClick={() => onCall(peer)}><Icon name="phone" /> Appeler</button>
      </div>

      {boardOpen && (
        <Whiteboard dmUserId={peer.id} onClose={() => setBoardOpen(false)}
          onPublish={(url) => send({ content: '', attachmentUrl: url, attachmentName: 'tableau-blanc.png' })} />
      )}

      {showSearch && (
        <div className="dm-search">
          <div className="dm-search-bar">
            <Icon name="magnifying-glass" />
            <input autoFocus value={searchQ} onChange={(e) => setSearchQ(e.target.value)} placeholder={`Rechercher dans les messages avec ${peer.display_name}…`} />
            <button title="Fermer" onClick={() => { setShowSearch(false); setSearchQ(''); }}><Icon name="xmark" /></button>
          </div>
          {searchQ.trim().length >= 2 && (
            <div className="dm-search-results">
              {searchHits.length === 0 && <div className="search-empty">Aucun message trouvé.</div>}
              {searchHits.map((m) => (
                <button className="dm-search-item" key={m.id} onClick={() => jumpToMessage(m.id)}>
                  <Avatar user={m} size={26} />
                  <div>
                    <div className="dm-search-meta"><strong>{m.display_name}</strong> · {formatTimeDate(m.created_at)}</div>
                    <div className="dm-search-text">{m.content}</div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="content-body">
        <div className="chat-area">
          <WatchTogether dmUserId={peer.id} open={watchOpen} onClose={() => setWatchOpen(false)} />
          {showPins && (
            <div className="pins-panel">
              <div className="pins-head">Messages épinglés <button onClick={() => setShowPins(false)}><Icon name="xmark" /></button></div>
              {pins.length === 0 && <div className="pins-empty">Aucun message épinglé.</div>}
              {pins.map((m) => (
                <div
                  className="pin-item" key={m.id} role="button" tabIndex={0}
                  title="Aller au message" onClick={() => jumpFromPin(m.id)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); jumpFromPin(m.id); } }}
                >
                  <Avatar user={m} size={28} />
                  <div>
                    <div className="pin-author">{m.display_name}</div>
                    <div className="pin-text">{renderRich(m.content, currentUser) || (m.attachment_url ? 'pièce jointe' : '')}</div>
                  </div>
                  <button className="pin-remove" title="Détacher" onClick={(e) => removePin(m, e)}><Icon name="xmark" /></button>
                </div>
              ))}
            </div>
          )}
          <div className="messages dm-thread" ref={scrollRef}>
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
              const isSavedMsg = !m.deleted && !isTaskMsg && !isReminderMsg && savedMsgIds?.has(m.id);
              return (
                <div className={`message ${isOwn ? 'own' : 'theirs'} ${grouped ? 'grouped' : ''} ${m.pinned && !m.deleted ? 'pinned' : ''} ${m.reply_to && !m.deleted ? 'is-reply' : ''} ${m.deleted ? 'is-deleted' : ''} ${isTaskMsg ? 'is-task' : ''} ${isReminderMsg ? 'is-reminder' : ''} ${isSavedMsg ? 'is-saved' : ''}`} key={m.id} data-mid={m.id} onContextMenu={msgMenu(m, isOwn)}>
                  {(isTaskMsg || isReminderMsg || isSavedMsg) && (
                    <span className={`msg-mark ${isTaskMsg ? 'task' : isReminderMsg ? 'reminder' : 'saved'}`} title={isTaskMsg ? 'Vous avez créé une tâche depuis ce message' : isReminderMsg ? 'Vous vous êtes fait un rappel sur ce message' : 'Vous avez enregistré ce message'}>
                      <Icon name={isTaskMsg ? 'circle-check' : isReminderMsg ? 'clock' : 'bookmark'} />
                    </span>
                  )}
                  {grouped ? <div className="gutter gutter-time">{m.deleted ? '' : formatTime(m.created_at)}</div> : <Avatar user={m} size={40} onClick={() => onOpenProfile?.(m.sender_id)} />}
                  <div className="msg-body">
                    {m.reply_to && (
                      <div className="reply-preview"><Icon name="reply" /> <strong>{m.reply_to.display_name}</strong> <span>{m.reply_to.content ? m.reply_to.content.slice(0, 60) : 'pièce jointe'}</span></div>
                    )}
                    {!grouped && (
                      <div className="msg-head">
                        <span className="msg-author clickable" style={{ color: userColor(m.sender_id ?? m.username) }} onClick={() => onOpenProfile?.(m.sender_id)}>{m.display_name}</span>
                        <span className="msg-time">{formatTimeDate(m.created_at)}</span>
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
                        })}><Icon name="circle-check" /></button>
                      )}
                      <BookmarkButton content={m.content} attachmentUrl={m.attachment_url} authorName={m.display_name} source={`@${peer.username}`} sourceMessageId={m.id} existing={savedByMsg?.get(m.id)} />
                      <ReminderButton content={m.content} attachmentUrl={m.attachment_url} authorName={m.display_name} source={`@${peer.username}`} sourceMessageId={m.id} existing={savedByMsg?.get(m.id)} dropUp={nearBottom} />
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
            onSendAttachment={sendAttachment}
            onTyping={onTypingSignal}
            onWatch={() => setWatchOpen((v) => !v)}
            aiEnabled={aiEnabled}
            scheduleScope={{ toUserId: peer.id }}
            draftKey={`dm:${peer.id}`}
          />

          {confirmDel && (
            <ConfirmModal title="Supprimer ce message ?" message="Le message sera remplacé par « Message supprimé »." confirmLabel="Supprimer" danger
              onConfirm={() => getSocket().emit('dm:delete', { messageId: confirmDel.id })} onClose={() => setConfirmDel(null)} />
          )}
        </div>
      </div>
    </div>
    {reportTarget && <ReportModal target={reportTarget} onClose={() => setReportTarget(null)} />}
    </FileDropZone>
  );
}
