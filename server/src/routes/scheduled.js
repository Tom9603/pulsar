import { Router } from 'express';
import db from '../db.js';
import { authMiddleware } from '../auth.js';
import { canAccessChannel } from '../permissions.js';

const router = Router();
router.use(authMiddleware);

const MAX_AHEAD = 366 * 24 * 3600; // un an maximum dans le futur

/** Messages programmés en attente de l'utilisateur (salons et privés). */
router.get('/', (req, res) => {
  const items = db.prepare(`
    SELECT s.id, s.channel_id, s.recipient_id, s.content, s.send_at,
           c.name AS channel_name, c.server_id,
           u.display_name AS recipient_name
    FROM scheduled_messages s
    LEFT JOIN channels c ON c.id = s.channel_id
    LEFT JOIN users u    ON u.id = s.recipient_id
    WHERE s.user_id = ? AND s.sent = 0
    ORDER BY s.send_at ASC
  `).all(req.userId);
  res.json({ items });
});

/** Programme un message dans un salon OU vers un utilisateur (message privé). */
router.post('/', (req, res) => {
  const { channelId, toUserId, content, sendAt } = req.body || {};
  const text = (content || '').trim().slice(0, 2000);
  const when = Math.floor(Number(sendAt));
  const now = Math.floor(Date.now() / 1000);

  if (!text) return res.status(400).json({ error: 'Message vide' });
  if (!Number.isFinite(when) || when <= now) return res.status(400).json({ error: 'Choisissez une date et une heure à venir' });
  if (when > now + MAX_AHEAD) return res.status(400).json({ error: 'Date trop lointaine (un an maximum)' });
  if (!channelId === !toUserId) return res.status(400).json({ error: 'Destination invalide' }); // exactement l'un des deux

  if (channelId) {
    const channel = db.prepare("SELECT * FROM channels WHERE id = ? AND type = 'text'").get(channelId);
    if (!channel || !canAccessChannel(channelId, req.userId)) return res.status(403).json({ error: 'Salon inaccessible' });
    const info = db.prepare('INSERT INTO scheduled_messages (user_id, channel_id, content, send_at) VALUES (?, ?, ?, ?)')
      .run(req.userId, channelId, text, when);
    return res.json({ id: info.lastInsertRowid });
  }

  const recipient = db.prepare('SELECT id FROM users WHERE id = ?').get(toUserId);
  if (!recipient || recipient.id === req.userId) return res.status(400).json({ error: 'Destinataire invalide' });
  const info = db.prepare('INSERT INTO scheduled_messages (user_id, recipient_id, content, send_at) VALUES (?, ?, ?, ?)')
    .run(req.userId, recipient.id, text, when);
  res.json({ id: info.lastInsertRowid });
});

/** Annule un message programmé encore en attente. */
router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM scheduled_messages WHERE id = ? AND user_id = ? AND sent = 0').run(req.params.id, req.userId);
  res.json({ ok: true });
});

export default router;
