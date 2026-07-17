import { Router } from 'express';
import db from '../db.js';
import { authMiddleware } from '../auth.js';
import { limit } from '../ratelimit.js';

const router = Router();
router.use(authMiddleware);

const REASONS = ['spam', 'harcèlement', 'contenu choquant', 'autre'];

/**
 * Signaler un message ou un compte.
 *
 * Le contenu incriminé est recopié dans le signalement au moment où il est
 * fait : l'administrateur juge sur cette copie, sans avoir à ouvrir la
 * conversation privée de qui que ce soit.
 */
router.post('/', limit('report', 20, 3600, 'Trop de signalements envoyés. Réessayez plus tard.'), (req, res) => {
  const b = req.body || {};
  const type = ['message', 'dm', 'user'].includes(b.target_type) ? b.target_type : null;
  if (!type) return res.status(400).json({ error: 'Type de signalement invalide.' });
  const reason = REASONS.includes(b.reason) ? b.reason : 'autre';

  let targetUserId = null;
  let excerpt = null;
  let context = null;

  if (type === 'message') {
    const m = db.prepare('SELECT m.user_id, m.content, c.name AS channel, s.name AS server FROM messages m JOIN channels c ON c.id = m.channel_id JOIN servers s ON s.id = c.server_id WHERE m.id = ?').get(b.target_id);
    if (!m) return res.status(404).json({ error: 'Message introuvable.' });
    targetUserId = m.user_id;
    excerpt = (m.content || '').slice(0, 500);
    context = `salon ${m.channel} · ${m.server}`;
  } else if (type === 'dm') {
    const m = db.prepare('SELECT sender_id, recipient_id, content FROM dm_messages WHERE id = ?').get(b.target_id);
    // On ne peut signaler qu'un message privé qui nous a été adressé.
    if (!m || m.recipient_id !== req.userId) return res.status(404).json({ error: 'Message introuvable.' });
    targetUserId = m.sender_id;
    excerpt = (m.content || '').slice(0, 500);
    context = 'message privé reçu';
  } else {
    const u = db.prepare('SELECT id FROM users WHERE id = ?').get(b.target_id);
    if (!u) return res.status(404).json({ error: 'Compte introuvable.' });
    targetUserId = u.id;
    context = (b.note || '').toString().slice(0, 200) || null;
  }

  db.prepare(`INSERT INTO reports (reporter_id, target_type, target_id, reason, content_excerpt, context_label)
              VALUES (?, ?, ?, ?, ?, ?)`)
    .run(req.userId, type, targetUserId, reason, excerpt, context);

  res.json({ ok: true });
});

export default router;
