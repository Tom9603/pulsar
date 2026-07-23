import db from './db.js';
import { verifyToken, publicUser, sessionExists } from './auth.js';
import { hasPermission, canAccessChannel, isOwner } from './permissions.js';
import { getIO } from './realtime.js';
import { take } from './ratelimit.js';

// Anti-spam : plafond d'envoi par utilisateur. Large pour ne jamais gêner une
// conversation animée, mais suffisant pour couper un envoi automatisé.
const SEND_MAX = 20;        // messages...
const SEND_WINDOW = 10_000; // ...par tranche de 10 secondes

/** L'utilisateur peut-il envoyer ? Sinon, on le lui dit une fois. */
function canSend(socket, userId) {
  if (take(`send:${userId}`, SEND_MAX, SEND_WINDOW).ok) return true;
  socket.emit('rate:limited', { message: 'Vous envoyez trop de messages à la suite. Patientez quelques secondes.' });
  return false;
}

// Deux utilisateurs sont-ils amis (relation acceptée) ?
const areFriends = (a, b) => !!db.prepare(
  "SELECT 1 FROM friendships WHERE status = 'accepted' AND ((requester_id = ? AND addressee_id = ?) OR (requester_id = ? AND addressee_id = ?))"
).get(a, b, b, a);

// Présence : userId -> Set(socketId)
const onlineUsers = new Map();
// Vocal : channelId -> Map(socketId -> { socketId, userId, user, muted, speaking })
const voiceRooms = new Map();
// Appels privés (1-à-1) : callId -> { callerId, calleeId, callerSocketId, calleeSocketId }
const activeCalls = new Map();
// « Regarder ensemble » : channelId -> { url, kind, mediaId, playing, time, ts }
const watchSessions = new Map();
// Tableau blanc : channelId -> [ strokes ] (historique en mémoire, plafonné)
const boards = new Map();
const dmBoards = new Map(); // dmKey -> strokes[] (tableau blanc en message privé)
// « Regarder ensemble » en message privé : clé paire triée -> session
const dmWatchSessions = new Map();
const dmKey = (a, b) => (a < b ? `${a}-${b}` : `${b}-${a}`);
function dmWatchState(key) {
  const s = dmWatchSessions.get(key);
  if (!s) return null;
  const time = s.playing ? s.time + (Date.now() - s.ts) / 1000 : s.time;
  return { url: s.url, kind: s.kind, mediaId: s.mediaId, playing: s.playing, time };
}

function parseMedia(url) {
  if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) return null;
  const yt = /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([\w-]{11})/.exec(url);
  if (yt) return { kind: 'youtube', id: yt[1] };
  if (/\.(mp4|webm|ogg|mp3|m4a|wav)(\?|#|$)/i.test(url)) return { kind: 'media', id: url };
  return null;
}

/** État courant d'une session (le temps est extrapolé si en lecture). */
function watchState(channelId) {
  const s = watchSessions.get(channelId);
  if (!s) return null;
  const time = s.playing ? s.time + (Date.now() - s.ts) / 1000 : s.time;
  return { url: s.url, kind: s.kind, mediaId: s.mediaId, playing: s.playing, time };
}

function roomMembers(channelId) {
  return Array.from(voiceRooms.get(channelId)?.values() || []);
}

function serverIdOfChannel(channelId) {
  return db.prepare('SELECT server_id FROM channels WHERE id = ?').get(channelId)?.server_id;
}

// Autorise nos images (/uploads/...) et les GIF Tenor.
const validAttachment = (url) => {
  if (typeof url !== 'string') return null;
  if (url.startsWith('/uploads/')) return url;
  if (/^https:\/\/([a-z0-9-]+\.)*tenor\.com\//i.test(url)) return url;
  return null;
};

/** Réactions agrégées d'un message : [{ emoji, count, userIds }]. */
export function reactionsFor(messageId) {
  const rows = db.prepare('SELECT emoji, user_id FROM message_reactions WHERE message_id = ?').all(messageId);
  const map = new Map();
  for (const r of rows) {
    if (!map.has(r.emoji)) map.set(r.emoji, []);
    map.get(r.emoji).push(r.user_id);
  }
  return Array.from(map, ([emoji, userIds]) => ({ emoji, count: userIds.length, userIds }));
}

/** Aperçu court d'un message référencé (pour les réponses). */
export function replyPreview(id) {
  if (!id) return null;
  const r = db.prepare(`
    SELECT m.id, m.content, m.attachment_url, u.display_name
    FROM messages m JOIN users u ON u.id = m.user_id WHERE m.id = ?
  `).get(id);
  if (!r) return null;
  return { id: r.id, display_name: r.display_name, content: r.content, attachment_url: r.attachment_url };
}

/** Sondage sérialisé (question, options + comptes, total, mes votes). */
export function pollObject(pollId, userId = null) {
  const p = db.prepare('SELECT * FROM polls WHERE id = ?').get(pollId);
  if (!p) return null;
  let options = [];
  try { options = JSON.parse(p.options); } catch { options = []; }
  const counts = new Array(options.length).fill(0);
  for (const v of db.prepare('SELECT option_index, COUNT(*) AS n FROM poll_votes WHERE poll_id = ? GROUP BY option_index').all(pollId)) {
    if (counts[v.option_index] !== undefined) counts[v.option_index] = v.n;
  }
  const myVotes = userId
    ? db.prepare('SELECT option_index FROM poll_votes WHERE poll_id = ? AND user_id = ?').all(pollId, userId).map((r) => r.option_index)
    : [];
  return {
    id: p.id, question: p.question, multi: !!p.multi, closes_at: p.closes_at,
    closed: p.closes_at ? p.closes_at * 1000 < Date.now() : false,
    options: options.map((text, i) => ({ text, votes: counts[i] })),
    total: counts.reduce((a, b) => a + b, 0),
    my_votes: myVotes,
  };
}

/** Message de salon complet (auteur + pièce jointe + réactions + réponse + épinglé + sondage). */
export function fullMessage(id, userId = null) {
  const m = db.prepare(`
    SELECT m.id, m.content, m.created_at, m.user_id, m.edited, m.deleted, m.attachment_url, m.attachment_name,
           m.reply_to_id, m.pinned, m.channel_id, m.poll_id,
           u.username, u.display_name, u.avatar_color, u.avatar_url
    FROM messages m JOIN users u ON u.id = m.user_id WHERE m.id = ?
  `).get(id);
  if (m) {
    m.reactions = reactionsFor(id);
    m.reply_to = replyPreview(m.reply_to_id);
    if (m.poll_id) m.poll = pollObject(m.poll_id, userId);
  }
  return m;
}

const THREAD_FACES = 3; // avatars montrés sous le message d'origine

/**
 * Attache à chaque message le résumé de son fil (nombre de réponses,
 * participants, dernière activité), ou null s'il n'en a pas.
 * Volontairement en deux requêtes groupées plutôt qu'une par message :
 * un salon chargé afficherait sinon des centaines de requêtes.
 */
export function attachThreads(rows) {
  const ids = rows.map((r) => r.id);
  if (!ids.length) return rows;
  const marks = ids.map(() => '?').join(',');

  const counts = db.prepare(`
    SELECT thread_parent_id AS pid, COUNT(*) AS reply_count, MAX(created_at) AS last_reply_at
    FROM messages WHERE thread_parent_id IN (${marks}) AND deleted = 0
    GROUP BY thread_parent_id
  `).all(...ids);
  const byId = new Map(counts.map((c) => [c.pid, c]));

  const faces = db.prepare(`
    SELECT DISTINCT m.thread_parent_id AS pid, u.id, u.username, u.display_name, u.avatar_url, u.avatar_color
    FROM messages m JOIN users u ON u.id = m.user_id
    WHERE m.thread_parent_id IN (${marks}) AND m.deleted = 0
    ORDER BY m.thread_parent_id, m.id
  `).all(...ids);
  const facesBy = new Map();
  for (const f of faces) {
    if (!facesBy.has(f.pid)) facesBy.set(f.pid, []);
    const list = facesBy.get(f.pid);
    if (list.length < THREAD_FACES) list.push(f);
  }

  for (const r of rows) {
    const c = byId.get(r.id);
    r.thread = c
      ? { reply_count: c.reply_count, last_reply_at: c.last_reply_at, participants: facesBy.get(r.id) || [] }
      : null;
  }
  return rows;
}

/** Résumé du fil d'un seul message (après une nouvelle réponse). */
export const threadSummaryOf = (parentId) => attachThreads([{ id: parentId }])[0].thread;

/** Réactions agrégées d'un message privé. */
export function dmReactionsFor(messageId) {
  const rows = db.prepare('SELECT emoji, user_id FROM dm_reactions WHERE message_id = ?').all(messageId);
  const map = new Map();
  for (const r of rows) {
    if (!map.has(r.emoji)) map.set(r.emoji, []);
    map.get(r.emoji).push(r.user_id);
  }
  return Array.from(map, ([emoji, userIds]) => ({ emoji, count: userIds.length, userIds }));
}

/** Aperçu d'un message privé référencé (réponses). */
export function dmReplyPreview(id) {
  if (!id) return null;
  const r = db.prepare(`
    SELECT d.id, d.content, d.attachment_url, u.display_name
    FROM dm_messages d JOIN users u ON u.id = d.sender_id WHERE d.id = ?
  `).get(id);
  if (!r) return null;
  return { id: r.id, display_name: r.display_name, content: r.content, attachment_url: r.attachment_url };
}

/** Message privé complet (auteur, pièce jointe, réactions, réponse, édité, supprimé). */
export function fullDm(id) {
  const m = db.prepare(`
    SELECT d.id, d.content, d.created_at, d.sender_id, d.recipient_id, d.attachment_url, d.attachment_name,
           d.reply_to_id, d.edited, d.deleted, d.pinned,
           u.username, u.display_name, u.avatar_color, u.avatar_url
    FROM dm_messages d JOIN users u ON u.id = d.sender_id WHERE d.id = ?
  `).get(id);
  if (m) {
    m.reactions = dmReactionsFor(id);
    m.reply_to = dmReplyPreview(m.reply_to_id);
  }
  return m;
}

function emitVoiceState(io, channelId) {
  const serverId = serverIdOfChannel(channelId);
  if (!serverId) return;
  io.to('server:' + serverId).emit('voice:state', {
    channelId: Number(channelId),
    members: roomMembers(channelId),
  });
}

/** Retire un socket de son salon vocal courant et prévient ses pairs. */
function removeSocketFromVoice(io, socket) {
  const channelId = socket.data.voiceChannelId;
  if (!channelId) return;
  const room = voiceRooms.get(channelId);
  if (room?.has(socket.id)) {
    room.delete(socket.id);
    if (room.size === 0) voiceRooms.delete(channelId);
    io.to('voice:' + channelId).emit('voice:peer-left', { socketId: socket.id });
  }
  socket.leave('voice:' + channelId);
  socket.data.voiceChannelId = null;
  emitVoiceState(io, channelId);
}

// Liste des utilisateurs en ligne, en retirant ceux qui ont choisi d'apparaître hors ligne.
function onlineIds() {
  const ids = Array.from(onlineUsers.keys());
  if (!ids.length) return ids;
  const hidden = new Set(
    db.prepare(`SELECT id FROM users WHERE hide_presence = 1 AND id IN (${ids.map(() => '?').join(',')})`).all(...ids).map((r) => r.id)
  );
  return ids.filter((id) => !hidden.has(id));
}
function broadcastPresence(io) {
  io.emit('presence', { online: onlineIds() });
}
// Rediffuse la présence (appelé depuis les réglages quand on (dé)masque son statut).
export function refreshPresence() {
  const io = getIO();
  if (io) io.emit('presence', { online: onlineIds() });
}

/** Coupe les connexions temps réel des sessions révoquées (déconnexion à distance immédiate). */
export function disconnectSessions(sessionIds = []) {
  const io = getIO();
  if (!io || !sessionIds.length) return;
  const revoked = new Set(sessionIds);
  for (const s of io.sockets.sockets.values()) {
    if (revoked.has(s.data?.sessionId)) s.disconnect(true);
  }
}

export function setupSocket(io) {
  // Vérificateur de rappels : notifie l'utilisateur quand un rappel arrive à échéance.
  setInterval(() => {
    const now = Math.floor(Date.now() / 1000);
    const due = db.prepare('SELECT * FROM saved_messages WHERE remind_at IS NOT NULL AND notified = 0 AND remind_at <= ?').all(now);
    for (const item of due) {
      db.prepare('UPDATE saved_messages SET notified = 1 WHERE id = ?').run(item.id);
      io.to('user:' + item.user_id).emit('reminder:due', { item });
    }

    // Échéance des tâches : on prévient le responsable (ou, à défaut, le créateur)
    // quand la date arrive. « due_notified » garantit un seul avertissement.
    // due_at est en secondes (comme remind_at).
    const tasksDue = db.prepare(`
      SELECT t.*, cu.display_name AS creator_name
      FROM tasks t JOIN users cu ON cu.id = t.creator_id
      WHERE t.due_at IS NOT NULL AND t.due_notified = 0 AND t.status != 'done' AND t.due_at <= ?
    `).all(now);
    for (const task of tasksDue) {
      db.prepare('UPDATE tasks SET due_notified = 1 WHERE id = ?').run(task.id);
      const who = task.assignee_id || task.creator_id;
      io.to('user:' + who).emit('task:due', { task });
    }
  }, 20000);

  // Distributeur des messages programmés : envoie ceux arrivés à échéance,
  // que l'auteur soit connecté ou non.
  setInterval(() => {
    const now = Math.floor(Date.now() / 1000);
    // Efface les statuts personnalisés dont l'expiration est passée.
    db.prepare('UPDATE users SET custom_status = NULL, custom_status_emoji = NULL, custom_status_until = NULL WHERE custom_status_until IS NOT NULL AND custom_status_until <= ?').run(now);
    const due = db.prepare('SELECT * FROM scheduled_messages WHERE sent = 0 AND send_at <= ?').all(now);
    for (const s of due) {
      db.prepare('UPDATE scheduled_messages SET sent = 1 WHERE id = ?').run(s.id); // marqué avant envoi : jamais de doublon
      try {
        if (s.channel_id) {
          const channel = db.prepare("SELECT * FROM channels WHERE id = ? AND type = 'text'").get(s.channel_id);
          if (channel && canAccessChannel(s.channel_id, s.user_id)) {
            const info = db.prepare('INSERT INTO messages (channel_id, user_id, content) VALUES (?, ?, ?)').run(s.channel_id, s.user_id, s.content);
            io.to('server:' + channel.server_id).emit('message:new', {
              channelId: s.channel_id,
              serverId: channel.server_id,
              message: fullMessage(info.lastInsertRowid),
            });
          }
        } else if (s.recipient_id) {
          const recipient = db.prepare('SELECT id, privacy_dm FROM users WHERE id = ?').get(s.recipient_id);
          const blocked = recipient && db.prepare(
            'SELECT 1 FROM blocks WHERE (blocker_id = ? AND blocked_id = ?) OR (blocker_id = ? AND blocked_id = ?)'
          ).get(s.user_id, s.recipient_id, s.recipient_id, s.user_id);
          const refused = recipient && recipient.privacy_dm === 'friends' && !areFriends(s.user_id, s.recipient_id);
          if (recipient && !blocked && !refused) {
            const info = db.prepare('INSERT INTO dm_messages (sender_id, recipient_id, content) VALUES (?, ?, ?)').run(s.user_id, s.recipient_id, s.content);
            const message = fullDm(info.lastInsertRowid);
            io.to('user:' + s.recipient_id).emit('dm:new', { message });
            io.to('user:' + s.user_id).emit('dm:new', { message });
          }
        }
      } catch { /* déjà marqué envoyé : on n'essaie pas en boucle */ }
      io.to('user:' + s.user_id).emit('scheduled:sent', { id: s.id }); // rafraîchit la liste "en attente" côté auteur
    }
  }, 15000);

  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    const payload = token ? verifyToken(token) : null;
    if (!payload) return next(new Error('unauthorized'));
    // La session doit exister : un appareil déconnecté à distance est refusé.
    if (!sessionExists(payload.sid, payload.id)) return next(new Error('unauthorized'));
    socket.userId = payload.id;
    socket.data.sessionId = payload.sid;
    next();
  });

  io.on('connection', (socket) => {
    const userId = socket.userId;
    const user = publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(userId));
    if (!user) return socket.disconnect(true);

    socket.data.voiceChannelId = null;

    if (!onlineUsers.has(userId)) onlineUsers.set(userId, new Set());
    onlineUsers.get(userId).add(socket.id);
    socket.join('user:' + userId);

    for (const { server_id } of db.prepare('SELECT server_id FROM server_members WHERE user_id = ?').all(userId)) {
      socket.join('server:' + server_id);
      for (const { id } of db.prepare("SELECT id FROM channels WHERE server_id = ? AND type = 'voice'").all(server_id)) {
        socket.emit('voice:state', { channelId: id, members: roomMembers(id) });
      }
    }

    broadcastPresence(io);

    socket.on('server:subscribe', ({ serverId }) => {
      const member = db.prepare('SELECT 1 FROM server_members WHERE server_id = ? AND user_id = ?').get(serverId, userId);
      if (!member) return;
      socket.join('server:' + serverId);
      // On renvoie l'occupation des salons vocaux : l'affichage reste juste
      // même après une reconnexion ou un changement d'écran.
      for (const { id } of db.prepare("SELECT id FROM channels WHERE server_id = ? AND type = 'voice'").all(serverId)) {
        socket.emit('voice:state', { channelId: id, members: roomMembers(id) });
      }
    });

    // ------------------------------------------------------------------
    // Chat de serveur
    // ------------------------------------------------------------------
    socket.on('message:send', ({ channelId, content, attachmentUrl, attachmentName, replyTo }) => {
      const text = (content || '').trim().slice(0, 2000);
      const attach = validAttachment(attachmentUrl);
      if (!text && !attach) return;
      if (!canSend(socket, userId)) return;
      const channel = db.prepare('SELECT * FROM channels WHERE id = ?').get(channelId);
      if (!channel || channel.type !== 'text') return;
      if (!canAccessChannel(channelId, userId)) return;

      let replyId = null;
      if (replyTo) {
        const r = db.prepare('SELECT id FROM messages WHERE id = ? AND channel_id = ?').get(replyTo, channelId);
        if (r) replyId = r.id;
      }
      const name = attach && typeof attachmentName === 'string' ? attachmentName.slice(0, 120) : null;

      const info = db.prepare(
        'INSERT INTO messages (channel_id, user_id, content, attachment_url, attachment_name, reply_to_id) VALUES (?, ?, ?, ?, ?, ?)'
      ).run(channelId, userId, text, attach, name, replyId);
      io.to('server:' + channel.server_id).emit('message:new', {
        channelId: Number(channelId),
        serverId: channel.server_id,
        message: fullMessage(info.lastInsertRowid),
      });
    });

    /**
     * Réponse dans un fil rattaché à un message.
     * Le message est enregistré dans le même salon, mais marqué comme réponse
     * de fil : il n'apparaîtra donc pas dans le flux principal.
     */
    socket.on('thread:send', ({ parentId, content, attachmentUrl, attachmentName }) => {
      const text = (content || '').trim().slice(0, 2000);
      const attach = validAttachment(attachmentUrl);
      if (!text && !attach) return;
      if (!canSend(socket, userId)) return;

      const parent = db.prepare('SELECT id, channel_id, thread_parent_id FROM messages WHERE id = ?').get(parentId);
      if (!parent) return;
      // Pas de fil dans un fil : on répond toujours au message racine.
      const rootId = parent.thread_parent_id || parent.id;
      const channel = db.prepare('SELECT * FROM channels WHERE id = ?').get(parent.channel_id);
      if (!channel || channel.type !== 'text') return;
      if (!canAccessChannel(channel.id, userId)) return;

      const name = attach && typeof attachmentName === 'string' ? attachmentName.slice(0, 120) : null;
      const info = db.prepare(
        'INSERT INTO messages (channel_id, user_id, content, attachment_url, attachment_name, thread_parent_id) VALUES (?, ?, ?, ?, ?, ?)'
      ).run(channel.id, userId, text, attach, name, rootId);

      io.to('server:' + channel.server_id).emit('thread:new', {
        channelId: channel.id,
        serverId: channel.server_id,
        parentId: rootId,
        message: fullMessage(info.lastInsertRowid),
        summary: threadSummaryOf(rootId), // met à jour la ligne sous le message d'origine
      });
    });

    socket.on('message:pin', ({ messageId, pinned }) => {
      const m = db.prepare('SELECT m.channel_id, c.server_id FROM messages m JOIN channels c ON c.id = m.channel_id WHERE m.id = ?').get(messageId);
      if (!m || !hasPermission(m.server_id, userId, 'MANAGE_CHANNELS')) return;
      db.prepare('UPDATE messages SET pinned = ? WHERE id = ?').run(pinned ? 1 : 0, messageId);
      io.to('server:' + m.server_id).emit('message:updated', { channelId: m.channel_id, message: fullMessage(messageId) });
      io.to('server:' + m.server_id).emit('pins:changed', { channelId: m.channel_id });
    });

    // Marque un salon comme lu (jusqu'au dernier message).
    socket.on('channel:read', ({ channelId }) => {
      const channel = db.prepare('SELECT server_id FROM channels WHERE id = ?').get(channelId);
      if (!channel) return;
      if (!canAccessChannel(channelId, userId)) return;
      const last = db.prepare('SELECT MAX(id) AS m FROM messages WHERE channel_id = ?').get(channelId).m || 0;
      db.prepare(
        'INSERT INTO channel_reads (user_id, channel_id, last_read_id) VALUES (?, ?, ?) ON CONFLICT(user_id, channel_id) DO UPDATE SET last_read_id = excluded.last_read_id'
      ).run(userId, channelId, last);
    });

    socket.on('message:edit', ({ messageId, content }) => {
      const text = (content || '').trim().slice(0, 2000);
      if (!text) return;
      const m = db.prepare('SELECT m.user_id, m.channel_id, c.server_id FROM messages m JOIN channels c ON c.id = m.channel_id WHERE m.id = ?').get(messageId);
      if (!m || m.user_id !== userId) return; // seul l'auteur peut éditer
      db.prepare('UPDATE messages SET content = ?, edited = 1 WHERE id = ?').run(text, messageId);
      io.to('server:' + m.server_id).emit('message:updated', { channelId: m.channel_id, message: fullMessage(messageId) });
    });

    socket.on('message:delete', ({ messageId }) => {
      const m = db.prepare('SELECT m.user_id, m.channel_id, m.thread_parent_id, c.server_id FROM messages m JOIN channels c ON c.id = m.channel_id WHERE m.id = ?').get(messageId);
      if (!m) return;
      const allowed = m.user_id === userId || hasPermission(m.server_id, userId, 'MANAGE_CHANNELS');
      if (!allowed) return;
      db.prepare("UPDATE messages SET deleted = 1, content = '', attachment_url = NULL, attachment_name = NULL, pinned = 0 WHERE id = ?").run(messageId);
      db.prepare('DELETE FROM message_reactions WHERE message_id = ?').run(messageId);
      io.to('server:' + m.server_id).emit('message:updated', { channelId: m.channel_id, message: fullMessage(messageId) });
      io.to('server:' + m.server_id).emit('pins:changed', { channelId: m.channel_id });
      // Réponse de fil supprimée : le compteur sous le message d'origine doit suivre.
      if (m.thread_parent_id) {
        io.to('server:' + m.server_id).emit('thread:summary', {
          channelId: m.channel_id, parentId: m.thread_parent_id, summary: threadSummaryOf(m.thread_parent_id),
        });
      }
    });

    socket.on('reaction:toggle', ({ messageId, emoji }) => {
      if (!emoji || String(emoji).length > 12) return;
      const m = db.prepare('SELECT m.channel_id, c.server_id FROM messages m JOIN channels c ON c.id = m.channel_id WHERE m.id = ?').get(messageId);
      if (!m) return;
      if (!db.prepare('SELECT 1 FROM server_members WHERE server_id = ? AND user_id = ?').get(m.server_id, userId)) return;
      const exists = db.prepare('SELECT 1 FROM message_reactions WHERE message_id = ? AND user_id = ? AND emoji = ?').get(messageId, userId, emoji);
      if (exists) db.prepare('DELETE FROM message_reactions WHERE message_id = ? AND user_id = ? AND emoji = ?').run(messageId, userId, emoji);
      else db.prepare('INSERT INTO message_reactions (message_id, user_id, emoji) VALUES (?, ?, ?)').run(messageId, userId, emoji);
      io.to('server:' + m.server_id).emit('reaction:update', {
        channelId: m.channel_id,
        messageId: Number(messageId),
        reactions: reactionsFor(messageId),
      });
    });

    socket.on('typing', ({ channelId }) => {
      const serverId = serverIdOfChannel(channelId);
      if (!serverId || !canAccessChannel(channelId, userId)) return;
      socket.to('server:' + serverId).emit('typing', { channelId: Number(channelId), user });
    });

    // ------------------------------------------------------------------
    // Messages privés (DM)
    // ------------------------------------------------------------------
    socket.on('dm:send', ({ toUserId, content, attachmentUrl, attachmentName, replyTo }) => {
      const text = (content || '').trim().slice(0, 2000);
      const attach = validAttachment(attachmentUrl);
      if ((!text && !attach) || !toUserId) return;
      if (!canSend(socket, userId)) return;
      const recipient = db.prepare('SELECT id, privacy_dm FROM users WHERE id = ?').get(toUserId);
      if (!recipient || recipient.id === userId) return;

      const blocked = db.prepare(
        'SELECT 1 FROM blocks WHERE (blocker_id = ? AND blocked_id = ?) OR (blocker_id = ? AND blocked_id = ?)'
      ).get(userId, recipient.id, recipient.id, userId);
      if (blocked) { socket.emit('dm:blocked', { toUserId: recipient.id }); return; }

      // Confidentialité : cette personne n'accepte les messages que de ses contacts.
      if (recipient.privacy_dm === 'friends' && !areFriends(userId, recipient.id)) {
        socket.emit('dm:refused', { toUserId: recipient.id, reason: 'friends' });
        return;
      }

      let replyId = null;
      if (replyTo) {
        const r = db.prepare(`SELECT id FROM dm_messages WHERE id = @id
          AND ((sender_id = @me AND recipient_id = @other) OR (sender_id = @other AND recipient_id = @me))`)
          .get({ id: replyTo, me: userId, other: recipient.id });
        if (r) replyId = r.id;
      }
      const name = attach && typeof attachmentName === 'string' ? attachmentName.slice(0, 120) : null;
      const info = db.prepare('INSERT INTO dm_messages (sender_id, recipient_id, content, attachment_url, attachment_name, reply_to_id) VALUES (?, ?, ?, ?, ?, ?)')
        .run(userId, recipient.id, text, attach, name, replyId);
      const message = fullDm(info.lastInsertRowid);

      io.to('user:' + recipient.id).emit('dm:new', { message });
      io.to('user:' + userId).emit('dm:new', { message });
    });

    // Récupère un message privé si l'utilisateur en est un des deux participants.
    const myDm = (messageId) => {
      const m = db.prepare('SELECT * FROM dm_messages WHERE id = ?').get(messageId);
      return m && (m.sender_id === userId || m.recipient_id === userId) ? m : null;
    };
    const emitDm = (m, event, payload) => {
      io.to('user:' + m.sender_id).emit(event, payload);
      io.to('user:' + m.recipient_id).emit(event, payload);
    };

    socket.on('dm:edit', ({ messageId, content }) => {
      const text = (content || '').trim().slice(0, 2000);
      if (!text) return;
      const m = myDm(messageId);
      if (!m || m.sender_id !== userId || m.deleted) return;
      db.prepare('UPDATE dm_messages SET content = ?, edited = 1 WHERE id = ?').run(text, messageId);
      emitDm(m, 'dm:updated', { message: fullDm(messageId) });
    });

    socket.on('dm:delete', ({ messageId }) => {
      const m = myDm(messageId);
      if (!m || m.sender_id !== userId) return;
      db.prepare("UPDATE dm_messages SET deleted = 1, content = '', attachment_url = NULL, attachment_name = NULL, pinned = 0 WHERE id = ?").run(messageId);
      db.prepare('DELETE FROM dm_reactions WHERE message_id = ?').run(messageId);
      emitDm(m, 'dm:updated', { message: fullDm(messageId) });
    });

    socket.on('dm:pin', ({ messageId, pinned }) => {
      const m = myDm(messageId);
      if (!m || m.deleted) return;
      db.prepare('UPDATE dm_messages SET pinned = ? WHERE id = ?').run(pinned ? 1 : 0, messageId);
      emitDm(m, 'dm:updated', { message: fullDm(messageId) });
      emitDm(m, 'dm:pins-changed', {});
    });

    socket.on('dm:react', ({ messageId, emoji }) => {
      if (!emoji || String(emoji).length > 12) return;
      const m = myDm(messageId);
      if (!m || m.deleted) return;
      const exists = db.prepare('SELECT 1 FROM dm_reactions WHERE message_id = ? AND user_id = ? AND emoji = ?').get(messageId, userId, emoji);
      if (exists) db.prepare('DELETE FROM dm_reactions WHERE message_id = ? AND user_id = ? AND emoji = ?').run(messageId, userId, emoji);
      else db.prepare('INSERT INTO dm_reactions (message_id, user_id, emoji) VALUES (?, ?, ?)').run(messageId, userId, emoji);
      emitDm(m, 'dm:reaction', { messageId: Number(messageId), reactions: dmReactionsFor(messageId) });
    });

    socket.on('dm:typing', ({ toUserId }) => {
      if (toUserId) io.to('user:' + toUserId).emit('dm:typing', { fromUserId: userId, user });
    });

    // ------------------------------------------------------------------
    // Vocal (WebRTC · audio réel en maillage peer-to-peer)
    // ------------------------------------------------------------------
    socket.on('voice:join', ({ channelId }) => {
      const channel = db.prepare('SELECT * FROM channels WHERE id = ?').get(channelId);
      if (!channel || channel.type !== 'voice') return;
      if (!canAccessChannel(channelId, userId)) return;

      removeSocketFromVoice(io, socket);

      const existing = roomMembers(channelId);
      if (!voiceRooms.has(channelId)) voiceRooms.set(channelId, new Map());
      voiceRooms.get(channelId).set(socket.id, { socketId: socket.id, userId, user, muted: false, speaking: false, handRaised: false, sharingScreen: false });
      socket.data.voiceChannelId = channelId;
      socket.join('voice:' + channelId);

      socket.emit('voice:peers', { channelId: Number(channelId), peers: existing });
      emitVoiceState(io, channelId);
    });

    socket.on('voice:signal', ({ targetSocketId, data }) => {
      if (!targetSocketId) return;
      io.to(targetSocketId).emit('voice:signal', { fromSocketId: socket.id, data });
    });

    socket.on('voice:mute', ({ muted }) => {
      const room = voiceRooms.get(socket.data.voiceChannelId);
      const me = room?.get(socket.id);
      if (me) {
        me.muted = !!muted;
        emitVoiceState(io, socket.data.voiceChannelId);
      }
    });

    socket.on('voice:speaking', ({ speaking }) => {
      const room = voiceRooms.get(socket.data.voiceChannelId);
      const me = room?.get(socket.id);
      if (me && me.speaking !== !!speaking) {
        me.speaking = !!speaking;
        emitVoiceState(io, socket.data.voiceChannelId);
      }
    });

    socket.on('voice:hand', ({ raised, targetSocketId }) => {
      const channelId = socket.data.voiceChannelId;
      const room = voiceRooms.get(channelId);
      if (!room) return;
      if (targetSocketId && targetSocketId !== socket.id) {
        // Baisser la main d'un autre : réservé au propriétaire ou à « Gérer les salons ».
        const serverId = serverIdOfChannel(channelId);
        if (!serverId || !(isOwner(serverId, userId) || hasPermission(serverId, userId, 'MANAGE_CHANNELS'))) return;
        const target = room.get(targetSocketId);
        if (target && target.handRaised) { target.handRaised = false; emitVoiceState(io, channelId); }
        return;
      }
      const me = room.get(socket.id);
      if (me && me.handRaised !== !!raised) { me.handRaised = !!raised; emitVoiceState(io, channelId); }
    });

    socket.on('voice:screen', ({ sharing }) => {
      const room = voiceRooms.get(socket.data.voiceChannelId);
      const me = room?.get(socket.id);
      if (me && me.sharingScreen !== !!sharing) {
        me.sharingScreen = !!sharing;
        emitVoiceState(io, socket.data.voiceChannelId);
      }
    });

    socket.on('voice:leave', () => removeSocketFromVoice(io, socket));

    // ------------------------------------------------------------------
    // Appels vocaux privés (DM) · 1-à-1
    // ------------------------------------------------------------------
    socket.on('call:invite', ({ toUserId }) => {
      if (!toUserId || toUserId === userId) return;
      const callee = db.prepare('SELECT * FROM users WHERE id = ?').get(toUserId);
      if (!callee) return;
      // On autorise l'appel MÊME si la personne est hors ligne : ça sonne, et si
      // elle ne se connecte pas à temps, l'appel se termine en « pas de réponse ».
      const callId = `${userId}-${toUserId}-${Date.now()}`;
      activeCalls.set(callId, { callerId: userId, calleeId: toUserId, callerSocketId: socket.id, calleeSocketId: null });
      io.to('user:' + toUserId).emit('call:incoming', { callId, from: user });
      socket.emit('call:ringing', { callId, to: publicUser(callee) });
      setTimeout(() => {
        const c = activeCalls.get(callId);
        if (c && !c.calleeSocketId) {
          activeCalls.delete(callId);
          io.to('user:' + c.callerId).emit('call:ended', { callId, reason: 'no-answer' });
          io.to('user:' + c.calleeId).emit('call:canceled', { callId });
        }
      }, 30000);
    });

    socket.on('call:accept', ({ callId }) => {
      const c = activeCalls.get(callId);
      if (!c || c.calleeId !== userId) return;
      c.calleeSocketId = socket.id;
      io.to(c.callerSocketId).emit('call:accepted', { callId, peerSocketId: socket.id }); // l'appelant initie
      socket.emit('call:connected', { callId, peerSocketId: c.callerSocketId });
    });

    socket.on('call:decline', ({ callId }) => {
      const c = activeCalls.get(callId);
      if (!c || c.calleeId !== userId) return;
      activeCalls.delete(callId);
      io.to(c.callerSocketId).emit('call:declined', { callId });
    });

    socket.on('call:cancel', ({ callId }) => {
      const c = activeCalls.get(callId);
      if (!c || c.callerId !== userId) return;
      activeCalls.delete(callId);
      io.to('user:' + c.calleeId).emit('call:canceled', { callId });
    });

    socket.on('call:end', ({ callId }) => {
      const c = activeCalls.get(callId);
      if (!c || (c.callerId !== userId && c.calleeId !== userId)) return;
      activeCalls.delete(callId);
      const otherId = c.callerId === userId ? c.calleeId : c.callerId;
      io.to('user:' + otherId).emit('call:ended', { callId });
    });

    socket.on('call:signal', ({ targetSocketId, data }) => {
      if (targetSocketId) io.to(targetSocketId).emit('call:signal', { fromSocketId: socket.id, data });
    });

    // ------------------------------------------------------------------
    // Regarder / écouter ensemble (lecture synchronisée par salon)
    // ------------------------------------------------------------------
    function watchMember(channelId) {
      const channel = db.prepare('SELECT server_id FROM channels WHERE id = ?').get(channelId);
      if (!channel || !canAccessChannel(channelId, userId)) return null;
      return channel;
    }

    socket.on('watch:start', ({ channelId, url }) => {
      const channel = watchMember(channelId);
      if (!channel) return;
      const media = parseMedia(url);
      if (!media) { socket.emit('watch:error', { message: 'Lien non supporté (YouTube ou fichier vidéo/audio direct).' }); return; }
      watchSessions.set(channelId, { url, kind: media.kind, mediaId: media.id, playing: true, time: 0, ts: Date.now() });
      io.to('server:' + channel.server_id).emit('watch:state', { channelId: Number(channelId), session: watchState(channelId), by: user.display_name });
    });

    socket.on('watch:control', ({ channelId, playing, time }) => {
      const channel = watchMember(channelId);
      const s = watchSessions.get(channelId);
      if (!channel || !s) return;
      s.playing = !!playing;
      s.time = Math.max(0, Number(time) || 0);
      s.ts = Date.now();
      socket.to('server:' + channel.server_id).emit('watch:sync', { channelId: Number(channelId), playing: s.playing, time: s.time });
    });

    socket.on('watch:get', ({ channelId }) => {
      if (!watchMember(channelId)) return;
      socket.emit('watch:state', { channelId: Number(channelId), session: watchState(channelId) });
    });

    socket.on('watch:stop', ({ channelId }) => {
      const channel = watchMember(channelId);
      if (!channel) return;
      watchSessions.delete(channelId);
      io.to('server:' + channel.server_id).emit('watch:state', { channelId: Number(channelId), session: null });
    });

    // « Regarder ensemble » en message privé (1-à-1).
    socket.on('watch:dm:start', ({ toUserId, url }) => {
      const other = Number(toUserId);
      if (!other || other === userId) return;
      const media = parseMedia(url);
      if (!media) { socket.emit('watch:error', { message: 'Lien non supporté (collez un lien YouTube).' }); return; }
      const key = dmKey(userId, other);
      dmWatchSessions.set(key, { url, kind: media.kind, mediaId: media.id, playing: true, time: 0, ts: Date.now() });
      const s = dmWatchState(key);
      io.to('user:' + userId).emit('watch:dm:state', { peerId: other, session: s, by: user.display_name });
      io.to('user:' + other).emit('watch:dm:state', { peerId: userId, session: s, by: user.display_name });
    });

    socket.on('watch:dm:control', ({ toUserId, playing, time }) => {
      const other = Number(toUserId);
      const key = dmKey(userId, other);
      const s = dmWatchSessions.get(key);
      if (!s) return;
      s.playing = !!playing;
      s.time = Math.max(0, Number(time) || 0);
      s.ts = Date.now();
      io.to('user:' + other).emit('watch:dm:sync', { peerId: userId, playing: s.playing, time: s.time });
    });

    socket.on('watch:dm:get', ({ toUserId }) => {
      const other = Number(toUserId);
      if (!other) return;
      socket.emit('watch:dm:state', { peerId: other, session: dmWatchState(dmKey(userId, other)) });
    });

    socket.on('watch:dm:stop', ({ toUserId }) => {
      const other = Number(toUserId);
      const key = dmKey(userId, other);
      dmWatchSessions.delete(key);
      io.to('user:' + userId).emit('watch:dm:state', { peerId: other, session: null });
      io.to('user:' + other).emit('watch:dm:state', { peerId: userId, session: null });
    });

    // ------------------------------------------------------------------
    // Soundboard : diffuse un son aux membres connectés au salon vocal
    // ------------------------------------------------------------------
    socket.on('sound:play', ({ channelId, sound }) => {
      if (!sound || !watchMember(channelId)) return;
      socket.to('voice:' + channelId).emit('sound:play', { channelId: Number(channelId), sound });
    });

    // ------------------------------------------------------------------
    // Tableau blanc partagé (dessin temps réel par salon)
    // ------------------------------------------------------------------
    // On garde des OBJETS (formes déplaçables) et on synchronise l'état complet
    // à chaque changement : simple, robuste, toujours cohérent entre les clients.
    const sanitizeElements = (arr) => (Array.isArray(arr) ? arr.slice(0, 4000) : []);

    socket.on('board:get', ({ channelId }) => {
      if (!watchMember(channelId)) return;
      socket.emit('board:init', { channelId: Number(channelId), elements: boards.get(channelId) || [] });
    });

    socket.on('board:set', ({ channelId, elements }) => {
      const channel = watchMember(channelId);
      if (!channel) return;
      const els = sanitizeElements(elements);
      boards.set(channelId, els);
      socket.to('server:' + channel.server_id).emit('board:init', { channelId: Number(channelId), elements: els });
    });

    // Tableau blanc partagé en message privé (routé entre les 2 correspondants).
    socket.on('dmboard:get', ({ dmUserId }) => {
      const other = Number(dmUserId);
      if (!other) return;
      socket.emit('dmboard:init', { dmUserId: other, elements: dmBoards.get(dmKey(userId, other)) || [] });
    });
    socket.on('dmboard:set', ({ dmUserId, elements }) => {
      const other = Number(dmUserId);
      if (!other) return;
      const els = sanitizeElements(elements);
      dmBoards.set(dmKey(userId, other), els);
      io.to('user:' + other).emit('dmboard:init', { dmUserId: userId, elements: els });
    });

    socket.on('disconnect', () => {
      removeSocketFromVoice(io, socket);
      for (const [callId, c] of activeCalls) {
        if (c.callerSocketId === socket.id || c.calleeSocketId === socket.id) {
          activeCalls.delete(callId);
          const otherId = c.callerId === userId ? c.calleeId : c.callerId;
          io.to('user:' + otherId).emit('call:ended', { callId, reason: 'disconnect' });
        }
      }
      const set = onlineUsers.get(userId);
      if (set) {
        set.delete(socket.id);
        if (set.size === 0) onlineUsers.delete(userId);
      }
      broadcastPresence(io);
    });
  });
}
