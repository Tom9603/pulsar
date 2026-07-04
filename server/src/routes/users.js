import { Router } from 'express';
import db from '../db.js';
import { authMiddleware, publicUser, hashPassword, verifyPassword } from '../auth.js';

const router = Router();
router.use(authMiddleware);

const STATUSES = ['online', 'idle', 'dnd', 'invisible'];

/** Met à jour le profil de l'utilisateur connecté (personnalisation). */
router.patch('/me', (req, res) => {
  const current = db.prepare('SELECT * FROM users WHERE id = ?').get(req.userId);
  if (!current) return res.status(404).json({ error: 'Utilisateur introuvable' });

  const { display_name, avatar_color, avatar_url, about, status } = req.body || {};

  const nextName = (display_name ?? '').toString().trim() || current.display_name;
  const nextColor = /^#[0-9a-fA-F]{6}$/.test(avatar_color || '') ? avatar_color : current.avatar_color;
  const nextAvatar = avatar_url === undefined ? current.avatar_url : (avatar_url || null);
  const nextAbout = about === undefined ? current.about : String(about).slice(0, 300);
  const nextStatus = STATUSES.includes(status) ? status : current.status;

  db.prepare(
    'UPDATE users SET display_name = ?, avatar_color = ?, avatar_url = ?, about = ?, status = ? WHERE id = ?'
  ).run(nextName, nextColor, nextAvatar, nextAbout, nextStatus, req.userId);

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.userId);
  res.json({ user: publicUser(user) });
});

/** Changer son mot de passe. */
router.patch('/me/password', (req, res) => {
  const { old_password, new_password } = req.body || {};
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.userId);
  if (!user || !verifyPassword(old_password || '', user.password_hash)) {
    return res.status(403).json({ error: 'Mot de passe actuel incorrect' });
  }
  if (!new_password || new_password.length < 6) {
    return res.status(400).json({ error: 'Nouveau mot de passe trop court (6 min.)' });
  }
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(new_password), req.userId);
  res.json({ ok: true });
});

/** Supprimer son compte (nécessite le mot de passe). */
router.delete('/me', (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.userId);
  if (!user || !verifyPassword(req.body?.password || '', user.password_hash)) {
    return res.status(403).json({ error: 'Mot de passe incorrect' });
  }
  db.prepare('DELETE FROM users WHERE id = ?').run(req.userId); // cascade sur le reste
  res.json({ ok: true });
});

/** Profil public d'un autre utilisateur. */
router.get('/:id', (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'Utilisateur introuvable' });
  res.json({ user: publicUser(user) });
});

export default router;
