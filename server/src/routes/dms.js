import { Router } from 'express';
import db from '../db.js';
import { authMiddleware, publicUser } from '../auth.js';
import { dmReactionsFor, dmReplyPreview } from '../socket.js';

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
           OR (d.sender_id = u.id AND d.recipient_id = @me)) AS last_id,
      -- Non-lu : un message reçu de l'interlocuteur plus récent que ma dernière lecture.
      (COALESCE((SELECT MAX(id) FROM dm_messages d WHERE d.sender_id = u.id AND d.recipient_id = @me), 0)
        > COALESCE((SELECT last_read_id FROM dm_reads WHERE user_id = @me AND peer_id = u.id), 0)) AS unread
    FROM users u
    WHERE u.id IN (
      SELECT recipient_id FROM dm_messages WHERE sender_id = @me
      UNION
      SELECT sender_id FROM dm_messages WHERE recipient_id = @me
    )
    AND (
      SELECT MAX(id) FROM dm_messages d
        WHERE (d.sender_id = @me AND d.recipient_id = u.id)
           OR (d.sender_id = u.id AND d.recipient_id = @me)
    ) > COALESCE((SELECT hidden_msg_id FROM dm_hidden WHERE user_id = @me AND peer_id = u.id), 0)
    ORDER BY last_id DESC
  `).all({ me: req.userId });

  res.json({ conversations: rows.map((c) => ({ ...c, unread: !!c.unread })) });
});

/** Marquer une conversation comme lue (jusqu'au dernier message). */
router.post('/:userId/read', (req, res) => {
  const peerId = Number(req.params.userId);
  if (!peerId) return res.status(400).json({ error: 'Destinataire invalide' });
  const last = db.prepare(`
    SELECT MAX(id) AS m FROM dm_messages
    WHERE (sender_id = @me AND recipient_id = @peer) OR (sender_id = @peer AND recipient_id = @me)
  `).get({ me: req.userId, peer: peerId });
  db.prepare(`
    INSERT INTO dm_reads (user_id, peer_id, last_read_id) VALUES (?, ?, ?)
    ON CONFLICT(user_id, peer_id) DO UPDATE SET last_read_id = excluded.last_read_id
  `).run(req.userId, peerId, last?.m || 0);
  res.json({ ok: true });
});

/** « Supprimer la conversation » côté de l'utilisateur : masquée jusqu'au prochain
 *  message. Ne supprime rien chez l'interlocuteur. */
router.delete('/:userId', (req, res) => {
  const peerId = Number(req.params.userId);
  if (!peerId) return res.status(400).json({ error: 'Destinataire invalide' });
  if (!db.prepare('SELECT 1 FROM users WHERE id = ?').get(peerId)) return res.status(404).json({ error: 'Utilisateur introuvable' });
  const last = db.prepare(`
    SELECT MAX(id) AS m FROM dm_messages
    WHERE (sender_id = @me AND recipient_id = @peer) OR (sender_id = @peer AND recipient_id = @me)
  `).get({ me: req.userId, peer: peerId });
  db.prepare(`
    INSERT INTO dm_hidden (user_id, peer_id, hidden_msg_id) VALUES (?, ?, ?)
    ON CONFLICT(user_id, peer_id) DO UPDATE SET hidden_msg_id = excluded.hidden_msg_id
  `).run(req.userId, peerId, last?.m || 0);
  res.json({ ok: true });
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
    SELECT d.id, d.content, d.created_at, d.sender_id, d.recipient_id, d.attachment_url, d.attachment_name,
           d.reply_to_id, d.edited, d.deleted, d.pinned,
           u.username, u.display_name, u.avatar_color, u.avatar_url
    FROM dm_messages d JOIN users u ON u.id = d.sender_id
    WHERE (d.sender_id = @me AND d.recipient_id = @other)
       OR (d.sender_id = @other AND d.recipient_id = @me)
    ORDER BY d.id DESC LIMIT @limit
  `).all({ me: req.userId, other: otherId, limit });

  for (const m of rows) {
    m.reactions = dmReactionsFor(m.id);
    m.reply_to = dmReplyPreview(m.reply_to_id);
  }

  res.json({ user: publicUser(other), messages: rows.reverse() });
});

/** Messages épinglés d'une conversation privée. */
router.get('/:userId/pins', (req, res) => {
  const otherId = Number(req.params.userId);
  const rows = db.prepare(`
    SELECT d.id, d.content, d.created_at, d.sender_id, d.recipient_id, d.attachment_url, d.attachment_name,
           d.reply_to_id, d.edited, d.pinned,
           u.username, u.display_name, u.avatar_color, u.avatar_url
    FROM dm_messages d JOIN users u ON u.id = d.sender_id
    WHERE d.pinned = 1 AND ((d.sender_id = @me AND d.recipient_id = @other) OR (d.sender_id = @other AND d.recipient_id = @me))
    ORDER BY d.id DESC
  `).all({ me: req.userId, other: otherId });
  res.json({ messages: rows });
});

export default router;
