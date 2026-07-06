import { Router } from 'express';
import db from '../db.js';
import { authMiddleware, publicUser, hashPassword, verifyPassword } from '../auth.js';

const router = Router();
router.use(authMiddleware);

const STATUSES = ['online', 'idle', 'dnd', 'meeting', 'invisible'];

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
  const nextPronouns = txt('pronouns', 40);
  const nextBannerColor = b.banner_color === undefined ? current.banner_color : (/^#[0-9a-fA-F]{6}$/.test(b.banner_color || '') ? b.banner_color : null);
  const nextBannerUrl = b.banner_url === undefined ? current.banner_url : (b.banner_url || null);

  db.prepare(`
    UPDATE users SET display_name = ?, avatar_color = ?, avatar_url = ?, about = ?, status = ?,
      headline = ?, company = ?, location = ?, website = ?, email_pro = ?, phone = ?, skills = ?,
      cv_url = ?, cv_name = ?, cv_summary = ?, pronouns = ?, banner_color = ?, banner_url = ?
    WHERE id = ?
  `).run(nextName, nextColor, nextAvatar, nextAbout, nextStatus,
    nextHeadline, nextCompany, nextLocation, nextWebsite, nextEmailPro, nextPhone, nextSkills,
    nextCvUrl, nextCvName, nextCvSummary, nextPronouns, nextBannerColor, nextBannerUrl, req.userId);

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

/** Ids des amis acceptés d'un utilisateur. */
function acceptedFriendIds(uid) {
  return db.prepare(`
    SELECT CASE WHEN requester_id = @u THEN addressee_id ELSE requester_id END AS id
    FROM friendships WHERE (requester_id = @u OR addressee_id = @u) AND status = 'accepted'
  `).all({ u: uid }).map((r) => r.id);
}

/** Relation entre l'utilisateur courant et une cible. */
function relationshipWith(me, targetId) {
  if (me === targetId) return 'self';
  if (db.prepare('SELECT 1 FROM blocks WHERE blocker_id = ? AND blocked_id = ?').get(me, targetId)) return 'blocked';
  const f = db.prepare(
    'SELECT * FROM friendships WHERE (requester_id = ? AND addressee_id = ?) OR (requester_id = ? AND addressee_id = ?)'
  ).get(me, targetId, targetId, me);
  if (!f) return 'none';
  if (f.status === 'accepted') return 'friends';
  return f.requester_id === me ? 'pending_out' : 'pending_in';
}

/** Profil public d'un autre utilisateur (+ relation, mutuels, nb de contacts). */
router.get('/:id', (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'Utilisateur introuvable' });
  const targetId = user.id;
  const me = req.userId;

  const relationship = relationshipWith(me, targetId);

  const mutualServers = me === targetId ? [] : db.prepare(`
    SELECT s.id, s.name, s.icon_color, s.icon_url FROM servers s
    JOIN server_members a ON a.server_id = s.id AND a.user_id = ?
    JOIN server_members b ON b.server_id = s.id AND b.user_id = ?
  `).all(me, targetId);

  const targetFriends = acceptedFriendIds(targetId);
  const myFriends = new Set(acceptedFriendIds(me));
  const mutualIds = me === targetId ? [] : targetFriends.filter((id) => myFriends.has(id));
  const mutualContacts = mutualIds.length
    ? db.prepare(`SELECT * FROM users WHERE id IN (${mutualIds.map(() => '?').join(',')})`).all(...mutualIds).map(publicUser)
    : [];

  res.json({
    user: publicUser(user),
    relationship,
    friends_count: targetFriends.length,
    mutual_servers: mutualServers,
    mutual_contacts: mutualContacts,
  });
});

/** Liste des contacts (amis acceptés) d'un utilisateur, avec l'info « déjà dans mes contacts ». */
router.get('/:id/contacts', (req, res) => {
  const targetId = Number(req.params.id);
  const ids = acceptedFriendIds(targetId);
  const mine = new Set(acceptedFriendIds(req.userId));
  const contacts = ids.length
    ? db.prepare(`SELECT * FROM users WHERE id IN (${ids.map(() => '?').join(',')}) ORDER BY display_name COLLATE NOCASE`).all(...ids)
      .map((u) => ({ ...publicUser(u), is_mine: mine.has(u.id) || u.id === req.userId }))
    : [];
  res.json({ contacts });
});

/** Signaler un utilisateur. */
router.post('/:id/report', (req, res) => {
  const targetId = Number(req.params.id);
  if (targetId === req.userId) return res.status(400).json({ error: 'Impossible' });
  if (!db.prepare('SELECT 1 FROM users WHERE id = ?').get(targetId)) return res.status(404).json({ error: 'Utilisateur introuvable' });
  db.prepare('INSERT INTO reports (reporter_id, target_id, reason) VALUES (?, ?, ?)')
    .run(req.userId, targetId, (req.body?.reason || '').toString().slice(0, 1000));
  res.json({ ok: true });
});

export default router;
