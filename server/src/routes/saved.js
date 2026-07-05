import { Router } from 'express';
import db from '../db.js';
import { authMiddleware } from '../auth.js';

const router = Router();
router.use(authMiddleware);

const nowEpoch = () => Math.floor(Date.now() / 1000);

/** Détermine l'échéance : soit un instant absolu (remindAt, epoch), soit un délai (remindInSeconds). */
function resolveRemindAt({ remindAt, remindInSeconds }) {
  if (Number.isFinite(remindAt) && remindAt > nowEpoch()) return Math.floor(remindAt);
  if (Number.isFinite(remindInSeconds) && remindInSeconds > 0) return nowEpoch() + Math.floor(remindInSeconds);
  return null;
}

/** Liste des messages sauvegardés de l'utilisateur (rappels d'abord). */
router.get('/', (req, res) => {
  const items = db.prepare(
    'SELECT * FROM saved_messages WHERE user_id = ? ORDER BY (remind_at IS NOT NULL AND notified = 0) DESC, id DESC'
  ).all(req.userId);
  res.json({ items });
});

/** Enregistrer un message (avec rappel optionnel dans `remindInSeconds`). */
router.post('/', (req, res) => {
  const { content, attachment_url, author_name, source } = req.body || {};
  const remindAt = resolveRemindAt(req.body || {});
  const info = db.prepare(
    'INSERT INTO saved_messages (user_id, content, attachment_url, author_name, source, remind_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(req.userId, (content || '').slice(0, 2000), attachment_url || null, author_name || null, source || null, remindAt);
  res.json({ item: db.prepare('SELECT * FROM saved_messages WHERE id = ?').get(info.lastInsertRowid) });
});

/** Modifier / (re)programmer un rappel. */
router.patch('/:id', (req, res) => {
  const item = db.prepare('SELECT * FROM saved_messages WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
  if (!item) return res.status(404).json({ error: 'Introuvable' });
  const remindAt = resolveRemindAt(req.body || {});
  db.prepare('UPDATE saved_messages SET remind_at = ?, notified = 0 WHERE id = ?').run(remindAt, item.id);
  res.json({ item: db.prepare('SELECT * FROM saved_messages WHERE id = ?').get(item.id) });
});

/** Supprimer un enregistrement. */
router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM saved_messages WHERE id = ? AND user_id = ?').run(req.params.id, req.userId);
  res.json({ ok: true });
});

export default router;
