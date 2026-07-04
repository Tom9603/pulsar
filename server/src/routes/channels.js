import { Router } from 'express';
import db from '../db.js';
import { authMiddleware } from '../auth.js';
import { hasPermission } from '../permissions.js';
import { getIO } from '../realtime.js';
import { reactionsFor } from '../socket.js';

const router = Router();
router.use(authMiddleware);

/** Renvoie le salon (avec owner_id du serveur) si l'utilisateur y a accès, sinon null. */
function accessibleChannel(channelId, userId) {
  const row = db.prepare(`
    SELECT c.*, s.owner_id AS server_owner_id
    FROM channels c JOIN servers s ON s.id = c.server_id
    WHERE c.id = ?
  `).get(channelId);
  if (!row) return null;
  const member = db.prepare('SELECT 1 FROM server_members WHERE server_id = ? AND user_id = ?').get(row.server_id, userId);
  return member ? row : null;
}

/** Historique des messages d'un salon textuel. */
router.get('/:id/messages', (req, res) => {
  const channel = accessibleChannel(req.params.id, req.userId);
  if (!channel) return res.status(403).json({ error: 'Accès refusé à ce salon' });

  const limit = Math.min(parseInt(req.query.limit, 10) || 50, 100);
  const before = parseInt(req.query.before, 10) || null;

  const rows = before
    ? db.prepare(`
        SELECT m.id, m.content, m.created_at, m.user_id, m.edited, m.attachment_url,
               u.username, u.display_name, u.avatar_color, u.avatar_url
        FROM messages m JOIN users u ON u.id = m.user_id
        WHERE m.channel_id = ? AND m.id < ?
        ORDER BY m.id DESC LIMIT ?`).all(channel.id, before, limit)
    : db.prepare(`
        SELECT m.id, m.content, m.created_at, m.user_id, m.edited, m.attachment_url,
               u.username, u.display_name, u.avatar_color, u.avatar_url
        FROM messages m JOIN users u ON u.id = m.user_id
        WHERE m.channel_id = ?
        ORDER BY m.id DESC LIMIT ?`).all(channel.id, limit);

  for (const m of rows) m.reactions = reactionsFor(m.id);
  res.json({ messages: rows.reverse() });
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
