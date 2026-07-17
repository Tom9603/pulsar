import { Router } from 'express';
import db from '../db.js';
import { authMiddleware } from '../auth.js';
import { hasPermission, canAccessChannel } from '../permissions.js';
import { getIO } from '../realtime.js';
import { reactionsFor, replyPreview, pollObject, fullMessage, attachThreads } from '../socket.js';

const router = Router();
router.use(authMiddleware);

const MESSAGE_COLS = `
  m.id, m.content, m.created_at, m.user_id, m.edited, m.deleted, m.attachment_url, m.attachment_name,
  m.reply_to_id, m.pinned, m.poll_id, u.username, u.display_name, u.avatar_color, u.avatar_url
`;

function decorate(rows, userId) {
  for (const m of rows) {
    m.reactions = reactionsFor(m.id);
    m.reply_to = replyPreview(m.reply_to_id);
    if (m.poll_id) m.poll = pollObject(m.poll_id, userId);
  }
  return attachThreads(rows);
}

/** Renvoie le salon (avec owner_id du serveur) si l'utilisateur y a accès, sinon null. */
function accessibleChannel(channelId, userId) {
  const row = db.prepare(`
    SELECT c.*, s.owner_id AS server_owner_id
    FROM channels c JOIN servers s ON s.id = c.server_id
    WHERE c.id = ?
  `).get(channelId);
  if (!row) return null;
  return canAccessChannel(row.id, userId) ? row : null;
}

/** Historique des messages d'un salon textuel. */
router.get('/:id/messages', (req, res) => {
  const channel = accessibleChannel(req.params.id, req.userId);
  if (!channel) return res.status(403).json({ error: 'Accès refusé à ce salon' });

  const limit = Math.min(parseInt(req.query.limit, 10) || 50, 100);
  const before = parseInt(req.query.before, 10) || null;

  // « thread_parent_id IS NULL » : les réponses d'un fil vivent dans leur fil,
  // pas dans le flux du salon. C'est tout l'intérêt des fils.
  const rows = before
    ? db.prepare(`SELECT ${MESSAGE_COLS} FROM messages m JOIN users u ON u.id = m.user_id
        WHERE m.channel_id = ? AND m.thread_parent_id IS NULL AND m.id < ? ORDER BY m.id DESC LIMIT ?`).all(channel.id, before, limit)
    : db.prepare(`SELECT ${MESSAGE_COLS} FROM messages m JOIN users u ON u.id = m.user_id
        WHERE m.channel_id = ? AND m.thread_parent_id IS NULL ORDER BY m.id DESC LIMIT ?`).all(channel.id, limit);

  res.json({ messages: decorate(rows, req.userId).reverse() });
});

/** Contenu d'un fil : le message d'origine et ses réponses. */
router.get('/threads/:messageId', (req, res) => {
  const parent = db.prepare(`SELECT ${MESSAGE_COLS}, m.channel_id FROM messages m JOIN users u ON u.id = m.user_id WHERE m.id = ?`)
    .get(req.params.messageId);
  if (!parent) return res.status(404).json({ error: 'Message introuvable' });
  if (!accessibleChannel(parent.channel_id, req.userId)) return res.status(403).json({ error: 'Accès refusé à ce salon' });

  const replies = db.prepare(`SELECT ${MESSAGE_COLS} FROM messages m JOIN users u ON u.id = m.user_id
    WHERE m.thread_parent_id = ? ORDER BY m.id ASC`).all(parent.id);

  res.json({ root: decorate([parent], req.userId)[0], messages: decorate(replies, req.userId) });
});

/** Messages épinglés d'un salon. */
router.get('/:id/pins', (req, res) => {
  const channel = accessibleChannel(req.params.id, req.userId);
  if (!channel) return res.status(403).json({ error: 'Accès refusé à ce salon' });
  const rows = db.prepare(`SELECT ${MESSAGE_COLS} FROM messages m JOIN users u ON u.id = m.user_id
    WHERE m.channel_id = ? AND m.pinned = 1 ORDER BY m.id DESC`).all(channel.id);
  res.json({ messages: decorate(rows, req.userId) });
});

/** Créer un sondage dans un salon (posté comme message). */
router.post('/:id/polls', (req, res) => {
  const channel = accessibleChannel(req.params.id, req.userId);
  if (!channel) return res.status(403).json({ error: 'Accès refusé à ce salon' });
  const question = (req.body?.question || '').trim();
  const rawOptions = Array.isArray(req.body?.options) ? req.body.options.map((o) => (o || '').trim()).filter(Boolean) : [];
  const options = [...new Set(rawOptions)].slice(0, 10);
  if (!question) return res.status(400).json({ error: 'La question est requise' });
  if (options.length < 2) return res.status(400).json({ error: 'Au moins deux options sont requises' });
  const multi = req.body?.multi ? 1 : 0;
  const hours = Number(req.body?.durationHours) || 0;
  const closesAt = hours > 0 ? Math.floor(Date.now() / 1000) + Math.round(hours * 3600) : null;

  const info = db.prepare('INSERT INTO polls (channel_id, creator_id, question, options, multi, closes_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(channel.id, req.userId, question, JSON.stringify(options), multi, closesAt);
  const pollId = info.lastInsertRowid;
  const msgInfo = db.prepare('INSERT INTO messages (channel_id, user_id, content, poll_id) VALUES (?, ?, ?, ?)')
    .run(channel.id, req.userId, '', pollId);

  const message = fullMessage(msgInfo.lastInsertRowid, req.userId);
  getIO()?.to('server:' + channel.server_id).emit('message:new', { channelId: channel.id, serverId: channel.server_id, message });
  res.json({ message });
});

/** Suppression d'un salon (propriétaire ou permission « Gérer les salons »). */
router.delete('/:id', (req, res) => {
  const channel = accessibleChannel(req.params.id, req.userId);
  if (!channel) return res.status(403).json({ error: 'Accès refusé à ce salon' });
  if (!hasPermission(channel.server_id, req.userId, 'MANAGE_CHANNELS')) {
    return res.status(403).json({ error: 'Permission « Gérer les salons » requise' });
  }
  db.prepare('DELETE FROM channels WHERE id = ?').run(channel.id);
  getIO()?.to('server:' + channel.server_id).emit('server:updated', { serverId: channel.server_id });
  res.json({ ok: true });
});

export default router;
