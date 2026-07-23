import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { getSocket } from '../socket.js';
import { renderRich } from '../richtext.jsx';
import Avatar from './Avatar.jsx';
import Icon from './Icon.jsx';
import Composer from './Composer.jsx';
import FileDropZone from './FileDropZone.jsx';
import ThreadStrip from './ThreadStrip.jsx';
import ThreadPanel from './ThreadPanel.jsx';
import ReportModal from './ReportModal.jsx';
import { sendFiles } from '../attachments.js';
import Attachment from './Attachment.jsx';
import PollCard from './PollCard.jsx';
import CreatePollModal from './CreatePollModal.jsx';
import EmojiPicker from './EmojiPicker.jsx';
import BookmarkButton from './BookmarkButton.jsx';
import ReminderButton from './ReminderButton.jsx';
import WatchTogether from './WatchTogether.jsx';
import ConfirmModal from './ConfirmModal.jsx';
import { ctx } from '../contextmenu.js';
import { userColor } from '../usercolor.js';
import { formatTime, formatTimeDate } from '../datetime.js';
import { useConfirm } from '../context/ConfirmContext.jsx';

const QUICK_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🎉'];

function shouldGroup(prev, cur) {
  if (!prev || prev.user_id !== cur.user_id || cur.attachment_url || cur.reply_to) return false;
  const gap = new Date(cur.created_at.replace(' ', 'T')) - new Date(prev.created_at.replace(' ', 'T'));
  return gap < 5 * 60 * 1000;
}

export default function ChatView({ channel, currentUser, canManage, members, onCreateTask, onOpenProfile, onForward, reminderMsgIds, taskMsgIds, savedMsgIds, savedByMsg, aiEnabled, onThreadToggle }) {
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
  const [pollOpen, setPollOpen] = useState(false);
  const [threadId, setThreadId] = useState(null); // fil ouvert dans le panneau latéral
  const [reportTarget, setReportTarget] = useState(null); // message à signaler
  useEffect(() => { setWatchOpen(false); setPollOpen(false); setThreadId(null); }, [channel.id]);

  // Un fil ouvert prend la place à droite : on prévient la mise en page, qui
  // escamote la liste des membres pour ne pas écraser la conversation.
  useEffect(() => { onThreadToggle?.(!!threadId); }, [threadId, onThreadToggle]);
  useEffect(() => () => onThreadToggle?.(false), [onThreadToggle]);
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
    const onPoll = ({ channelId, poll }) => {
      if (channelId !== channel.id) return;
      setMessages((prev) => prev.map((m) => (m.poll && m.poll.id === poll.id ? { ...m, poll: { ...poll, my_votes: m.poll.my_votes } } : m)));
    };
    const onTypingEvt = ({ channelId, user }) => {
      if (channelId !== channel.id || user.id === currentUser.id) return;
      setTyping((prev) => ({ ...prev, [user.id]: user.display_name }));
      clearTimeout(typingTimers.current[user.id]);
      typingTimers.current[user.id] = setTimeout(() => {
        setTyping((prev) => { const n = { ...prev }; delete n[user.id]; return n; });
      }, 4000);
    };

    // Une réponse dans un fil ne rejoint pas le flux : seule la ligne
    // récapitulative sous le message d'origine est rafraîchie.
    const onThreadSummary = ({ channelId, parentId, summary }) => {
      if (channelId !== channel.id) return;
      setMessages((prev) => prev.map((m) => (m.id === parentId ? { ...m, thread: summary } : m)));
    };

    socket.on('message:new', onNew);
    socket.on('message:updated', onUpdated);
    socket.on('message:deleted', onDeleted);
    socket.on('reaction:update', onReaction);
    socket.on('pins:changed', onPins);
    socket.on('poll:update', onPoll);
    socket.on('typing', onTypingEvt);
    socket.on('thread:new', onThreadSummary);
    socket.on('thread:summary', onThreadSummary);
    return () => {
      socket.off('message:new', onNew);
      socket.off('message:updated', onUpdated);
      socket.off('message:deleted', onDeleted);
      socket.off('reaction:update', onReaction);
      socket.off('pins:changed', onPins);
      socket.off('poll:update', onPoll);
      socket.off('typing', onTypingEvt);
      socket.off('thread:new', onThreadSummary);
      socket.off('thread:summary', onThreadSummary);
    };
  }, [channel.id, currentUser.id, showPins]);

  // Descend en bas quand les messages arrivent et quand on entre dans le salon :
  // « scrollHeight » n'est correct qu'après la peinture, d'où requestAnimationFrame.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    requestAnimationFrame(() => { el.scrollTop = el.scrollHeight; });
  }, [messages, typing, channel.id]);

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
    { label: m.thread?.reply_count ? 'Ouvrir le fil' : 'Répondre dans un fil', icon: 'comments', onClick: () => setThreadId(m.id) },
    onForward && { label: 'Transférer', icon: 'share', onClick: () => onForward(m) },
    { sep: true },
    onCreateTask && { label: 'Créer une tâche', icon: 'circle-check', onClick: () => taskFromMsg(m) },
    { label: savedByMsg?.get(m.id) ? 'Retirer des enregistrés' : 'Enregistrer le message', icon: 'bookmark', onClick: () => toggleSave(m) },
    canManage && { label: m.pinned ? 'Détacher' : 'Épingler', icon: 'thumbtack', onClick: () => pin(m) },
    m.content && { label: 'Copier le texte', icon: 'copy', onClick: () => navigator.clipboard?.writeText(m.content) },
    !isOwn && { label: 'Signaler', icon: 'flag', onClick: () => setReportTarget({ type: 'message', id: m.id }) },
    (isOwn || canManage) && { sep: true },
    isOwn && { label: 'Modifier', icon: 'pen', onClick: () => startEdit(m) },
    (isOwn || canManage) && { label: 'Supprimer', icon: 'trash', danger: true, onClick: () => del(m) },
  ]);
  const confirm = useConfirm();
  const pin = (m) => getSocket().emit('message:pin', { messageId: m.id, pinned: !m.pinned });
  // Clic sur une épingle : on saute au message avec une brève surbrillance.
  const jumpTo = (id) => {
    setShowPins(false);
    requestAnimationFrame(() => {
      const el = document.getElementById(`msg-${id}`);
      if (!el) return;
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('flash');
      setTimeout(() => el.classList.remove('flash'), 1600);
    });
  };
  // Détacher demande confirmation (action volontaire, on ne détache pas par mégarde).
  const removePin = async (m, e) => {
    e.stopPropagation();
    const ok = await confirm({
      title: 'Détacher ce message ?',
      message: 'Il ne sera plus épinglé dans ce salon. Vous pourrez le ré-épingler plus tard.',
      confirmLabel: 'Détacher', danger: true,
    });
    if (ok) pin(m);
  };
  const startEdit = (m) => { setEditingId(m.id); setEditText(m.content); };
  function submitEdit(m) {
    const t = editText.trim();
    if (t && t !== m.content) getSocket().emit('message:edit', { messageId: m.id, content: t });
    setEditingId(null);
  }
  function openPicker(id) { setPickerFor(id); setPickerFull(false); }

  const send = (extra) => getSocket().emit('message:send', { channelId: channel.id, replyTo: replyingTo?.id, ...extra });
  const typingNames = Object.values(typing);

  const sendAttachment = (url, text, name) => send({ content: text || '', attachmentUrl: url, attachmentName: name });

  return (
    <div className="chat-split">
    <FileDropZone onFiles={(files) => sendFiles(files, sendAttachment)} label={`Déposez pour envoyer dans ${channel.name}`}>
    <div className="chat-area">
      <WatchTogether channelId={channel.id} open={watchOpen} onClose={() => setWatchOpen(false)} />
      <button className="chat-pins-btn" title="Messages épinglés" onClick={togglePins}><Icon name="thumbtack" /></button>

      {showPins && (
        <div className="pins-panel">
          <div className="pins-head">Messages épinglés <button onClick={() => setShowPins(false)}><Icon name="xmark" /></button></div>
          {pins.length === 0 && <div className="pins-empty">Aucun message épinglé.</div>}
          {pins.map((m) => (
            <div
              className="pin-item" key={m.id} role="button" tabIndex={0}
              title="Aller au message" onClick={() => jumpTo(m.id)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); jumpTo(m.id); } }}
            >
              <Avatar user={m} size={28} />
              <div>
                <div className="pin-author">{m.display_name}</div>
                <div className="pin-text">{renderRich(m.content, currentUser) || (m.attachment_url ? 'pièce jointe' : '')}</div>
              </div>
              {canManage && <button className="pin-remove" title="Détacher" onClick={(e) => removePin(m, e)}><Icon name="xmark" /></button>}
            </div>
          ))}
        </div>
      )}

      <div className="messages bubbles chat-thread" ref={scrollRef}>
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
            <div id={`msg-${m.id}`} className={`message ${isOwn ? 'own' : 'theirs'} ${grouped ? 'grouped' : ''} ${m.pinned ? 'pinned' : ''} ${m.reply_to && !m.deleted ? 'is-reply' : ''} ${m.deleted ? 'is-deleted' : ''} ${isTaskMsg ? 'is-task' : ''} ${isReminderMsg ? 'is-reminder' : ''} ${isSavedMsg ? 'is-saved' : ''}`} key={m.id} onContextMenu={msgMenu(m, isOwn)}>
              {(isTaskMsg || isReminderMsg || isSavedMsg) && (
                <span className={`msg-mark ${isTaskMsg ? 'task' : isReminderMsg ? 'reminder' : 'saved'}`} title={isTaskMsg ? 'Vous avez créé une tâche depuis ce message' : isReminderMsg ? 'Vous vous êtes fait un rappel sur ce message' : 'Vous avez enregistré ce message'}>
                  <Icon name={isTaskMsg ? 'circle-check' : isReminderMsg ? 'clock' : 'bookmark'} />
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
                    {m.poll && <PollCard poll={m.poll} />}
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

                {!m.deleted && <ThreadStrip thread={m.thread} active={threadId === m.id} onOpen={() => setThreadId(m.id)} />}
              </div>

              {!editing && !m.deleted && (
                <div className="msg-actions">
                  <button title="Réagir" onClick={() => (pickerFor === m.id ? setPickerFor(null) : openPicker(m.id))}><Icon name="face-smile" /></button>
                  <button title="Répondre" onClick={() => setReplyingTo(m)}><Icon name="reply" /></button>
                  <button title={m.thread?.reply_count ? 'Ouvrir le fil' : 'Répondre dans un fil'} onClick={() => setThreadId(m.id)}><Icon name="comments" /></button>
                  {onCreateTask && (
                    <button title="Créer une tâche depuis ce message" onClick={() => onCreateTask({
                      title: (m.content || '').replace(/\s+/g, ' ').trim().slice(0, 140),
                      description: m.content && m.content.length > 140 ? m.content : '',
                      server_id: channel.server_id,
                      channel_id: channel.id,
                      source_message_id: m.id,
                      source_label: channel.name,
                    })}><Icon name="circle-check" /></button>
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
        {typingNames.length > 0 && (
          <span className="typing-indicator">
            {typingNames.length === 1
              ? `${typingNames[0]} est en train d’écrire`
              : `${typingNames.join(', ')} sont en train d’écrire`}
            <span className="typing-dots"><i /><i /><i /></span>
          </span>
        )}
      </div>

      <Composer
        placeholder={`Envoyer un message dans ${channel.name}`}
        replyingTo={replyingTo}
        onClearReply={() => setReplyingTo(null)}
        onSendText={(t) => send({ content: t })}
        onSendAttachment={sendAttachment}
        onTyping={onTyping}
        onWatch={() => setWatchOpen((v) => !v)}
        onPoll={() => setPollOpen(true)}
        mentionables={members}
        aiEnabled={aiEnabled}
        scheduleScope={{ channelId: channel.id }}
        draftKey={`channel:${channel.id}`}
      />

      {pollOpen && <CreatePollModal channelId={channel.id} onClose={() => setPollOpen(false)} />}

      {confirmDel && (
        <ConfirmModal title="Supprimer ce message ?" message="Le message sera remplacé par « Message supprimé »." confirmLabel="Supprimer" danger
          onConfirm={() => getSocket().emit('message:delete', { messageId: confirmDel.id })} onClose={() => setConfirmDel(null)} />
      )}
    </div>
    </FileDropZone>

    {threadId && (
      <ThreadPanel
        rootId={threadId}
        channel={channel}
        currentUser={currentUser}
        members={members}
        aiEnabled={aiEnabled}
        onOpenProfile={onOpenProfile}
        onClose={() => setThreadId(null)}
      />
    )}
    {reportTarget && <ReportModal target={reportTarget} onClose={() => setReportTarget(null)} />}
    </div>
  );
}
