import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { getSocket } from '../socket.js';
import { renderRich } from '../richtext.jsx';
import Avatar from './Avatar.jsx';
import Composer from './Composer.jsx';
import Attachment from './Attachment.jsx';

function formatTime(ts) {
  const d = new Date(ts.replace(' ', 'T') + 'Z');
  return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

/** Conversation privée avec un utilisateur (texte, images, GIF, vocal, appel). */
export default function DmChat({ peer, currentUser, onlineIds, onCall }) {
  const [messages, setMessages] = useState([]);
  const [peerTyping, setPeerTyping] = useState(false);
  const scrollRef = useRef(null);
  const typingTimer = useRef(null);
  const lastTypingSent = useRef(0);
  const online = new Set(onlineIds).has(peer.id);

  useEffect(() => {
    let cancelled = false;
    setMessages([]);
    api(`/dms/${peer.id}/messages`).then(({ messages }) => {
      if (!cancelled) setMessages(messages);
    });
    return () => { cancelled = true; };
  }, [peer.id]);

  useEffect(() => {
    const socket = getSocket();
    const onNew = ({ message }) => {
      const involvesPeer =
        (message.sender_id === peer.id && message.recipient_id === currentUser.id) ||
        (message.sender_id === currentUser.id && message.recipient_id === peer.id);
      if (involvesPeer) setMessages((prev) => [...prev, message]);
    };
    const onTyping = ({ fromUserId }) => {
      if (fromUserId !== peer.id) return;
      setPeerTyping(true);
      clearTimeout(typingTimer.current);
      typingTimer.current = setTimeout(() => setPeerTyping(false), 4000);
    };
    socket.on('dm:new', onNew);
    socket.on('dm:typing', onTyping);
    return () => {
      socket.off('dm:new', onNew);
      socket.off('dm:typing', onTyping);
    };
  }, [peer.id, currentUser.id]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, peerTyping]);

  function onTypingSignal() {
    const now = Date.now();
    if (now - lastTypingSent.current > 2000) {
      lastTypingSent.current = now;
      getSocket().emit('dm:typing', { toUserId: peer.id });
    }
  }

  return (
    <div className="main-content">
      <div className="content-header">
        <Avatar user={peer} size={24} status={online ? peer.status : 'offline'} />
        <span>{peer.display_name}</span>
        <span className="topic">@{peer.username}</span>
        <span className="spacer" />
        <button className="header-btn" title="Appel vocal" onClick={() => onCall(peer)}>📞</button>
      </div>

      <div className="content-body">
        <div className="chat-area">
          <div className="messages" ref={scrollRef}>
            <div className="spacer-top" />
            <div className="msg-welcome">
              <Avatar user={peer} size={64} />
              <h2 style={{ marginTop: 12 }}>{peer.display_name}</h2>
              <p>Ceci est le début de ta conversation privée avec <strong>{peer.display_name}</strong>.</p>
            </div>

            {messages.map((m, i) => {
              const prev = messages[i - 1];
              const grouped = prev && prev.sender_id === m.sender_id && !m.attachment_url;
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
                    {m.content && <div className="msg-text">{renderRich(m.content, currentUser)}</div>}
                    {m.attachment_url && <Attachment url={m.attachment_url} name={m.attachment_name} />}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="typing-line">
            {peerTyping && `${peer.display_name} est en train d’écrire…`}
          </div>

          <Composer
            placeholder={`Envoyer un message à ${peer.display_name}`}
            onSendText={(t) => getSocket().emit('dm:send', { toUserId: peer.id, content: t })}
            onSendAttachment={(url, text, name) => getSocket().emit('dm:send', { toUserId: peer.id, content: text || '', attachmentUrl: url, attachmentName: name })}
            onTyping={onTypingSignal}
          />
        </div>
      </div>
    </div>
  );
}
