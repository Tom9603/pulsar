import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { getSocket } from '../socket.js';
import { renderRich } from '../richtext.jsx';
import { formatTime } from '../datetime.js';
import { userColor } from '../usercolor.js';
import { sendFiles } from '../attachments.js';
import Avatar from './Avatar.jsx';
import Icon from './Icon.jsx';
import Attachment from './Attachment.jsx';
import Composer from './Composer.jsx';
import FileDropZone from './FileDropZone.jsx';

/** Une ligne de message dans le fil (rendu volontairement épuré). */
function ThreadMessage({ m, currentUser, onOpenProfile }) {
  return (
    <div className={`tp-msg ${m.deleted ? 'is-deleted' : ''}`}>
      <Avatar user={m} size={30} onClick={() => onOpenProfile?.(m.user_id)} />
      <div className="tp-msg-body">
        <div className="tp-msg-head">
          <span className="tp-author clickable" style={{ color: userColor(m.user_id ?? m.username) }} onClick={() => onOpenProfile?.(m.user_id)}>
            {m.display_name}
          </span>
          <span className="tp-time">{formatTime(m.created_at)}</span>
          {m.edited === 1 && <span className="tp-edited">modifié</span>}
        </div>
        {m.deleted
          ? <div className="tp-text tp-gone">Message supprimé</div>
          : (
            <>
              {m.content && <div className="tp-text">{renderRich(m.content, currentUser)}</div>}
              {m.attachment_url && <Attachment url={m.attachment_url} name={m.attachment_name} />}
            </>
          )}
      </div>
    </div>
  );
}

/**
 * Panneau latéral d'un fil de discussion.
 *
 * Le fil reste rattaché à son message d'origine : rien n'est créé dans la
 * barre latérale, et les réponses n'encombrent pas le salon principal.
 */
export default function ThreadPanel({ rootId, channel, currentUser, members, aiEnabled, onOpenProfile, onClose }) {
  const [root, setRoot] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const endRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    api(`/channels/threads/${rootId}`)
      .then(({ root: r, messages: msgs }) => {
        if (cancelled) return;
        setRoot(r);
        setMessages(msgs);
      })
      .catch((e) => !cancelled && setError(e.message))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [rootId]);

  // Temps réel : nouvelles réponses et suppressions dans CE fil.
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;
    const onNew = ({ parentId, message }) => {
      if (parentId !== rootId) return;
      setMessages((prev) => (prev.some((m) => m.id === message.id) ? prev : [...prev, message]));
    };
    const onUpdated = ({ message }) => {
      setMessages((prev) => prev.map((m) => (m.id === message.id ? message : m)));
      setRoot((r) => (r && r.id === message.id ? { ...message, thread: r.thread } : r));
    };
    socket.on('thread:new', onNew);
    socket.on('message:updated', onUpdated);
    return () => { socket.off('thread:new', onNew); socket.off('message:updated', onUpdated); };
  }, [rootId]);

  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }); }, [messages.length]);

  const liveCount = messages.filter((m) => !m.deleted).length;
  const send = (extra) => getSocket().emit('thread:send', { parentId: rootId, ...extra });
  const sendAttachment = (url, text, name) => send({ content: text || '', attachmentUrl: url, attachmentName: name });

  return (
    <aside className="thread-panel">
      <div className="tp-head">
        <span className="tp-title"><Icon name="comments" /> Fil de discussion</span>
        <span className="tp-sub">dans {channel.name}</span>
        <button className="tp-close" onClick={onClose} title="Fermer le fil"><Icon name="xmark" /></button>
      </div>

      <FileDropZone onFiles={(files) => sendFiles(files, sendAttachment)} label="Déposez pour répondre dans le fil">
        <div className="tp-scroll">
          {loading && <div className="tp-state">Chargement…</div>}
          {error && <div className="tp-state tp-error"><Icon name="circle-exclamation" /> {error}</div>}

          {root && (
            <>
              <div className="tp-root">
                <ThreadMessage m={root} currentUser={currentUser} onOpenProfile={onOpenProfile} />
              </div>
              {/* Les messages supprimés ne comptent pas, pour rester d'accord
                  avec la ligne affichée sous le message d'origine. */}
              <div className="tp-sep">
                {liveCount === 0
                  ? 'Aucune réponse pour l’instant'
                  : `${liveCount} réponse${liveCount > 1 ? 's' : ''}`}
              </div>
            </>
          )}

          {messages.map((m) => (
            <ThreadMessage key={m.id} m={m} currentUser={currentUser} onOpenProfile={onOpenProfile} />
          ))}
          <div ref={endRef} />
        </div>
      </FileDropZone>

      <Composer
        placeholder="Répondre dans le fil"
        onSendText={(t) => send({ content: t })}
        onSendAttachment={sendAttachment}
        mentionables={members}
        aiEnabled={aiEnabled}
        draftKey={`thread:${rootId}`}
      />
    </aside>
  );
}
