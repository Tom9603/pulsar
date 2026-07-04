import { useEffect, useRef, useState } from 'react';
import { api, uploadImage, mediaUrl } from '../api.js';
import { getSocket } from '../socket.js';
import Avatar from './Avatar.jsx';

function formatTime(ts) {
  const d = new Date(ts.replace(' ', 'T') + 'Z');
  return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

const readAsDataURL = (file) =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });

/** Conversation privée avec un utilisateur. */
export default function DmChat({ peer, currentUser, onlineIds }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [peerTyping, setPeerTyping] = useState(false);
  const [uploading, setUploading] = useState(false);
  const scrollRef = useRef(null);
  const typingTimer = useRef(null);
  const lastTypingSent = useRef(0);
  const online = new Set(onlineIds).has(peer.id);

  async function onPickImage(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > 4 * 1024 * 1024) { alert('Image trop lourde (4 Mo max).'); return; }
    setUploading(true);
    try {
      const url = await uploadImage(await readAsDataURL(file));
      getSocket().emit('dm:send', { toUserId: peer.id, content: input.trim(), attachmentUrl: url });
      setInput('');
    } catch (err) {
      alert(err.message);
    } finally {
      setUploading(false);
    }
  }

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

  function handleChange(e) {
    setInput(e.target.value);
    const now = Date.now();
    if (now - lastTypingSent.current > 2000) {
      lastTypingSent.current = now;
      getSocket().emit('dm:typing', { toUserId: peer.id });
    }
  }

  function send(e) {
    e.preventDefault();
    const content = input.trim();
    if (!content) return;
    getSocket().emit('dm:send', { toUserId: peer.id, content });
    setInput('');
  }

  return (
    <div className="main-content">
      <div className="content-header">
        <Avatar user={peer} size={24} status={online ? peer.status : 'offline'} />
        <span>{peer.display_name}</span>
        <span className="topic">@{peer.username}</span>
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
              const grouped = prev && prev.sender_id === m.sender_id;
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
                    {m.content && <div className="msg-text">{m.content}</div>}
                    {m.attachment_url && (
                      <img
                        className="msg-image"
                        src={mediaUrl(m.attachment_url)}
                        alt="pièce jointe"
                        onClick={() => window.open(mediaUrl(m.attachment_url), '_blank')}
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="typing-line">
            {peerTyping && `${peer.display_name} est en train d’écrire…`}
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
                placeholder={uploading ? 'Envoi de l’image…' : `Envoyer un message à ${peer.display_name}`}
                maxLength={2000}
                disabled={uploading}
              />
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
