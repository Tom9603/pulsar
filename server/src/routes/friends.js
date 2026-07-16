import { Router } from 'express';
import db from '../db.js';
import { authMiddleware, publicUser } from '../auth.js';
import { getIO } from '../realtime.js';

const router = Router();
router.use(authMiddleware);

const notify = (userId) => getIO()?.to('user:' + userId).emit('friends:changed', {});

function friendshipBetween(a, b) {
  return db.prepare(
    'SELECT * FROM friendships WHERE (requester_id = ? AND addressee_id = ?) OR (requester_id = ? AND addressee_id = ?)'
  ).get(a, b, b, a);
}

/** Listes : amis, demandes reçues, demandes envoyées, utilisateurs bloqués. */
router.get('/', (req, res) => {
  const me = req.userId;
  const friends = db.prepare(`
    SELECT u.* FROM friendships f
    JOIN users u ON u.id = CASE WHEN f.requester_id = @me THEN f.addressee_id ELSE f.requester_id END
    WHERE (f.requester_id = @me OR f.addressee_id = @me) AND f.status = 'accepted'
    ORDER BY u.display_name COLLATE NOCASE
  `).all({ me }).map(publicUser);

  const incoming = db.prepare(`
    SELECT u.* FROM friendships f JOIN users u ON u.id = f.requester_id
    WHERE f.addressee_id = ? AND f.status = 'pending' ORDER BY f.id DESC
  `).all(me).map(publicUser);

  const outgoing = db.prepare(`
    SELECT u.* FROM friendships f JOIN users u ON u.id = f.addressee_id
    WHERE f.requester_id = ? AND f.status = 'pending' ORDER BY f.id DESC
  `).all(me).map(publicUser);

  const blocked = db.prepare(`
    SELECT u.* FROM blocks b JOIN users u ON u.id = b.blocked_id WHERE b.blocker_id = ?
  `).all(me).map(publicUser);

  res.json({ friends, incoming, outgoing, blocked });
});

/** Envoyer une demande d'ami (par nom d'utilisateur). */
router.post('/request', (req, res) => {
  const me = req.userId;
  const target = db.prepare('SELECT * FROM users WHERE username = ?').get((req.body?.username || '').trim());
  if (!target) return res.status(404).json({ error: 'Aucun utilisateur avec ce nom' });
  if (target.id === me) return res.status(400).json({ error: 'Impossible de s’ajouter soi-même' });

  const blocked = db.prepare(
    'SELECT 1 FROM blocks WHERE (blocker_id = ? AND blocked_id = ?) OR (blocker_id = ? AND blocked_id = ?)'
  ).get(me, target.id, target.id, me);
  if (blocked) return res.status(403).json({ error: 'Action impossible (blocage)' });

  const existing = friendshipBetween(me, target.id);
  if (existing) {
    if (existing.status === 'accepted') return res.status(409).json({ error: 'Vous êtes déjà amis' });
    if (existing.addressee_id === me) {
      // demande déjà reçue → on l'accepte
      db.prepare("UPDATE friendships SET status = 'accepted' WHERE id = ?").run(existing.id);
      notify(target.id); notify(me);
      return res.json({ ok: true, status: 'accepted' });
    }
    return res.status(409).json({ error: 'Demande déjà envoyée' });
  }

  // Confidentialité : cette personne n'accepte pas les demandes d'ami.
  if (target.privacy_friend === 'none') return res.status(403).json({ error: 'Cette personne n’accepte pas les demandes d’ami.' });

  const message = (req.body?.message || '').toString().slice(0, 300) || null;
  db.prepare("INSERT INTO friendships (requester_id, addressee_id, status, message) VALUES (?, ?, 'pending', ?)").run(me, target.id, message);
  notify(target.id);
  res.json({ ok: true, status: 'pending' });
});

/** Accepter une demande reçue. */
router.post('/:userId/accept', (req, res) => {
  const other = Number(req.params.userId);
  const f = db.prepare("SELECT * FROM friendships WHERE requester_id = ? AND addressee_id = ? AND status = 'pending'").get(other, req.userId);
  if (!f) return res.status(404).json({ error: 'Demande introuvable' });
  db.prepare("UPDATE friendships SET status = 'accepted' WHERE id = ?").run(f.id);
  notify(other); notify(req.userId);
  res.json({ ok: true });
});

/** Retirer un ami / annuler ou refuser une demande. */
router.delete('/:userId', (req, res) => {
  const other = Number(req.params.userId);
  const f = friendshipBetween(req.userId, other);
  if (f) db.prepare('DELETE FROM friendships WHERE id = ?').run(f.id);
  notify(other); notify(req.userId);
  res.json({ ok: true });
});

/** Bloquer un utilisateur (retire aussi l'amitié). */
router.post('/:userId/block', (req, res) => {
  const other = Number(req.params.userId);
  if (other === req.userId) return res.status(400).json({ error: 'Impossible' });
  const f = friendshipBetween(req.userId, other);
  if (f) db.prepare('DELETE FROM friendships WHERE id = ?').run(f.id);
  db.prepare('INSERT OR IGNORE INTO blocks (blocker_id, blocked_id) VALUES (?, ?)').run(req.userId, other);
  notify(other); notify(req.userId);
  res.json({ ok: true });
});

/** Débloquer. */
router.delete('/:userId/block', (req, res) => {
  db.prepare('DELETE FROM blocks WHERE blocker_id = ? AND blocked_id = ?').run(req.userId, Number(req.params.userId));
  notify(req.userId);
  res.json({ ok: true });
});

export default router;
