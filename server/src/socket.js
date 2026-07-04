import db from './db.js';
import { verifyToken, publicUser } from './auth.js';
import { hasPermission } from './permissions.js';

// Présence : userId -> Set(socketId)
const onlineUsers = new Map();
// Vocal : channelId -> Map(socketId -> { socketId, userId, user, muted, speaking })
const voiceRooms = new Map();
// Appels privés (1-à-1) : callId -> { callerId, calleeId, callerSocketId, calleeSocketId }
const activeCalls = new Map();

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

/** Message de salon complet (auteur + pièce jointe + réactions + réponse + épinglé). */
export function fullMessage(id) {
  const m = db.prepare(`
    SELECT m.id, m.content, m.created_at, m.user_id, m.edited, m.attachment_url, m.attachment_name,
           m.reply_to_id, m.pinned, m.channel_id,
           u.username, u.display_name, u.avatar_color, u.avatar_url
    FROM messages m JOIN users u ON u.id = m.user_id WHERE m.id = ?
  `).get(id);
  if (m) {
    m.reactions = reactionsFor(id);
    m.reply_to = replyPreview(m.reply_to_id);
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

function broadcastPresence(io) {
  io.emit('presence', { online: Array.from(onlineUsers.keys()) });
}

export function setupSocket(io) {
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    const payload = token ? verifyToken(token) : null;
    if (!payload) return next(new Error('unauthorized'));
    socket.userId = payload.id;
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
      if (member) socket.join('server:' + serverId);
    });

    // ------------------------------------------------------------------
    // Chat de serveur
    // ------------------------------------------------------------------
    socket.on('message:send', ({ channelId, content, attachmentUrl, attachmentName, replyTo }) => {
      const text = (content || '').trim().slice(0, 2000);
      const attach = validAttachment(attachmentUrl);
      if (!text && !attach) return;
      const channel = db.prepare('SELECT * FROM channels WHERE id = ?').get(channelId);
      if (!channel || channel.type !== 'text') return;
      if (!db.prepare('SELECT 1 FROM server_members WHERE server_id = ? AND user_id = ?').get(channel.server_id, userId)) return;

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
        message: fullMessage(info.lastInsertRowid),
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
      if (!db.prepare('SELECT 1 FROM server_members WHERE server_id = ? AND user_id = ?').get(channel.server_id, userId)) return;
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
      const m = db.prepare('SELECT m.user_id, m.channel_id, c.server_id FROM messages m JOIN channels c ON c.id = m.channel_id WHERE m.id = ?').get(messageId);
      if (!m) return;
      const allowed = m.user_id === userId || hasPermission(m.server_id, userId, 'MANAGE_CHANNELS');
      if (!allowed) return;
      db.prepare('DELETE FROM messages WHERE id = ?').run(messageId);
      io.to('server:' + m.server_id).emit('message:deleted', { channelId: m.channel_id, messageId: Number(messageId) });
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
      if (!serverId) return;
      socket.to('server:' + serverId).emit('typing', { channelId: Number(channelId), user });
    });

    // ------------------------------------------------------------------
    // Messages privés (DM)
    // ------------------------------------------------------------------
    socket.on('dm:send', ({ toUserId, content, attachmentUrl, attachmentName }) => {
      const text = (content || '').trim().slice(0, 2000);
      const attach = validAttachment(attachmentUrl);
      if ((!text && !attach) || !toUserId) return;
      const recipient = db.prepare('SELECT id FROM users WHERE id = ?').get(toUserId);
      if (!recipient || recipient.id === userId) return;

      const blocked = db.prepare(
        'SELECT 1 FROM blocks WHERE (blocker_id = ? AND blocked_id = ?) OR (blocker_id = ? AND blocked_id = ?)'
      ).get(userId, recipient.id, recipient.id, userId);
      if (blocked) { socket.emit('dm:blocked', { toUserId: recipient.id }); return; }

      const name = attach && typeof attachmentName === 'string' ? attachmentName.slice(0, 120) : null;
      const info = db.prepare('INSERT INTO dm_messages (sender_id, recipient_id, content, attachment_url, attachment_name) VALUES (?, ?, ?, ?, ?)')
        .run(userId, recipient.id, text, attach, name);
      const message = db.prepare(`
        SELECT d.id, d.content, d.created_at, d.sender_id, d.recipient_id, d.attachment_url, d.attachment_name,
               u.username, u.display_name, u.avatar_color, u.avatar_url
        FROM dm_messages d JOIN users u ON u.id = d.sender_id WHERE d.id = ?
      `).get(info.lastInsertRowid);

      io.to('user:' + recipient.id).emit('dm:new', { message });
      io.to('user:' + userId).emit('dm:new', { message });
    });

    socket.on('dm:typing', ({ toUserId }) => {
      if (toUserId) io.to('user:' + toUserId).emit('dm:typing', { fromUserId: userId, user });
    });

    // ------------------------------------------------------------------
    // Vocal (WebRTC — audio réel en maillage peer-to-peer)
    // ------------------------------------------------------------------
    socket.on('voice:join', ({ channelId }) => {
      const channel = db.prepare('SELECT * FROM channels WHERE id = ?').get(channelId);
      if (!channel || channel.type !== 'voice') return;
      if (!db.prepare('SELECT 1 FROM server_members WHERE server_id = ? AND user_id = ?').get(channel.server_id, userId)) return;

      removeSocketFromVoice(io, socket);

      const existing = roomMembers(channelId);
      if (!voiceRooms.has(channelId)) voiceRooms.set(channelId, new Map());
      voiceRooms.get(channelId).set(socket.id, { socketId: socket.id, userId, user, muted: false, speaking: false });
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

    socket.on('voice:leave', () => removeSocketFromVoice(io, socket));

    // ------------------------------------------------------------------
    // Appels vocaux privés (DM) — 1-à-1
    // ------------------------------------------------------------------
    socket.on('call:invite', ({ toUserId }) => {
      if (!toUserId || toUserId === userId) return;
      const callee = db.prepare('SELECT * FROM users WHERE id = ?').get(toUserId);
      if (!callee) return;
      if (!onlineUsers.get(toUserId)?.size) {
        socket.emit('call:unavailable', { reason: 'offline' });
        return;
      }
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
