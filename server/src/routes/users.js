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

  const b = req.body || {};
  const { display_name, avatar_color, avatar_url, about, status } = b;

  const nextName = (display_name ?? '').toString().trim() || current.display_name;
  const nextColor = /^#[0-9a-fA-F]{6}$/.test(avatar_color || '') ? avatar_color : current.avatar_color;
  const nextAvatar = avatar_url === undefined ? current.avatar_url : (avatar_url || null);
  const nextAbout = about === undefined ? current.about : String(about).slice(0, 300);
  const nextStatus = STATUSES.includes(status) ? status : current.status;

  // Fiche professionnelle : chaque champ n'est mis à jour que s'il est fourni.
  const txt = (key, max) => (b[key] === undefined ? current[key] : (String(b[key]).slice(0, max) || null));
  const nextHeadline = txt('headline', 120);
  const nextCompany = txt('company', 120);
  const nextLocation = txt('location', 120);
  const nextWebsite = txt('website', 200);
  const nextEmailPro = txt('email_pro', 160);
  const nextPhone = txt('phone', 40);
  const nextSkills = txt('skills', 400);
  const nextCvUrl = b.cv_url === undefined ? current.cv_url : (b.cv_url || null);
  const nextCvName = b.cv_name === undefined ? current.cv_name : (b.cv_name ? String(b.cv_name).slice(0, 160) : null);
  const nextCvSummary = txt('cv_summary', 800);

  db.prepare(`
    UPDATE users SET display_name = ?, avatar_color = ?, avatar_url = ?, about = ?, status = ?,
      headline = ?, company = ?, location = ?, website = ?, email_pro = ?, phone = ?, skills = ?,
      cv_url = ?, cv_name = ?, cv_summary = ?
    WHERE id = ?
  `).run(nextName, nextColor, nextAvatar, nextAbout, nextStatus,
    nextHeadline, nextCompany, nextLocation, nextWebsite, nextEmailPro, nextPhone, nextSkills,
    nextCvUrl, nextCvName, nextCvSummary, req.userId);

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
