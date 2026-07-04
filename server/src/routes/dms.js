import { Router } from 'express';
import db from '../db.js';
import { authMiddleware, publicUser } from '../auth.js';

const router = Router();
router.use(authMiddleware);

/** Liste des conversations privées de l'utilisateur (dernier message + interlocuteur). */
router.get('/', (req, res) => {
  const rows = db.prepare(`
    SELECT u.id, u.username, u.display_name, u.avatar_color, u.avatar_url, u.status,
      (SELECT content FROM dm_messages d
        WHERE (d.sender_id = @me AND d.recipient_id = u.id)
           OR (d.sender_id = u.id AND d.recipient_id = @me)
        ORDER BY d.id DESC LIMIT 1) AS last_content,
      (SELECT MAX(id) FROM dm_messages d
        WHERE (d.sender_id = @me AND d.recipient_id = u.id)
           OR (d.sender_id = u.id AND d.recipient_id = @me)) AS last_id
    FROM users u
    WHERE u.id IN (
      SELECT recipient_id FROM dm_messages WHERE sender_id = @me
      UNION
      SELECT sender_id FROM dm_messages WHERE recipient_id = @me
    )
    ORDER BY last_id DESC
  `).all({ me: req.userId });

  res.json({ conversations: rows });
});

/** Démarrer (ou retrouver) une conversation avec un utilisateur, par nom d'utilisateur. */
router.post('/start', (req, res) => {
  const username = (req.body?.username || '').trim();
  if (!username) return res.status(400).json({ error: 'Nom d’utilisateur requis' });

  const target = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!target) return res.status(404).json({ error: 'Aucun utilisateur avec ce nom' });
  if (target.id === req.userId) return res.status(400).json({ error: 'Impossible de se parler à soi-même' });

  res.json({ user: publicUser(target) });
});

/** Historique des messages avec un utilisateur donné. */
router.get('/:userId/messages', (req, res) => {
  const otherId = Number(req.params.userId);
  const other = db.prepare('SELECT * FROM users WHERE id = ?').get(otherId);
  if (!other) return res.status(404).json({ error: 'Utilisateur introuvable' });

  const limit = Math.min(parseInt(req.query.limit, 10) || 50, 100);
  const rows = db.prepare(`
    SELECT d.id, d.content, d.created_at, d.sender_id, d.recipient_id, d.attachment_url,
           u.username, u.display_name, u.avatar_color, u.avatar_url
    FROM dm_messages d JOIN users u ON u.id = d.sender_id
    WHERE (d.sender_id = @me AND d.recipient_id = @other)
       OR (d.sender_id = @other AND d.recipient_id = @me)
    ORDER BY d.id DESC LIMIT @limit
  `).all({ me: req.userId, other: otherId, limit });

  res.json({ user: publicUser(other), messages: rows.reverse() });
});

export default router;
