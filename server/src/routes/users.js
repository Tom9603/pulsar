import { Router } from 'express';
import db from '../db.js';
import { authMiddleware, publicUser, hashPassword, verifyPassword } from '../auth.js';
import { refreshPresence } from '../socket.js';

const router = Router();
router.use(authMiddleware);

const STATUSES = ['online', 'idle', 'dnd', 'meeting', 'invisible'];
const DM_POLICIES = ['everyone', 'friends'];
const FRIEND_POLICIES = ['everyone', 'none'];

/** Met à jour le profil de l'utilisateur connecté (personnalisation). */
router.patch('/me', (req, res) => {
  const current = db.prepare('SELECT * FROM users WHERE id = ?').get(req.userId);
  if (!current) return res.status(404).json({ error: 'Utilisateur introuvable' });

  const b = req.body || {};
  const { display_name, avatar_color, avatar_url, about, status } = b;

  const nextName = (display_name ?? '').toString().trim() || current.display_name;
  const nextColor = /^#[0-9a-fA-F]{6}$/.test(avatar_color || '') ? avatar_color : current.avatar_color;
  const nextAvatar = avatar_url === undefined ? current.avatar_url : (avatar_url || null);
  // Origine de la photo : sert à savoir s'il faut confirmer avant de la remplacer.
  let nextAvatarSource;
  if (avatar_url === undefined) nextAvatarSource = current.avatar_source;      // avatar inchangé
  else if (!avatar_url) nextAvatarSource = null;                               // photo retirée
  else nextAvatarSource = ['upload', 'preset'].includes(b.avatar_source) ? b.avatar_source : (current.avatar_source || null);
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

  // Réseaux : on ne garde que les clés connues, chaque valeur bornée. Stocké en JSON.
  const SOCIAL_KEYS = ['linkedin', 'twitter', 'instagram', 'facebook', 'github', 'youtube'];
  let nextSocials = current.socials;
  if (b.socials !== undefined) {
    const src = (b.socials && typeof b.socials === 'object') ? b.socials : {};
    const clean = {};
    for (const k of SOCIAL_KEYS) {
      const v = String(src[k] || '').trim().slice(0, 200);
      if (v) clean[k] = v;
    }
    nextSocials = Object.keys(clean).length ? JSON.stringify(clean) : null;
  }

  const nextSetup = b.setup_completed === undefined ? current.setup_completed : (b.setup_completed ? 1 : 0);

  // Confidentialité
  const nextPrivacyDm = DM_POLICIES.includes(b.privacy_dm) ? b.privacy_dm : current.privacy_dm;
  const nextPrivacyFriend = FRIEND_POLICIES.includes(b.privacy_friend) ? b.privacy_friend : current.privacy_friend;
  const nextHide = b.hide_presence === undefined ? current.hide_presence : (b.hide_presence ? 1 : 0);

  // Statut personnalisé (texte + emoji + expiration)
  const rawCustom = b.custom_status === undefined ? (current.custom_status || '') : String(b.custom_status || '').slice(0, 100).trim();
  const hasCustom = !!rawCustom;
  const nextCustom = hasCustom ? rawCustom : null;
  const nextCustomEmoji = !hasCustom ? null : (b.custom_status_emoji === undefined ? current.custom_status_emoji : (String(b.custom_status_emoji || '').slice(0, 16) || null));
  let nextCustomUntil = current.custom_status_until;
  if (!hasCustom) nextCustomUntil = null;
  else if (b.custom_status_minutes !== undefined) {
    const mins = Number(b.custom_status_minutes) || 0;
    nextCustomUntil = mins > 0 ? Math.floor(Date.now() / 1000) + mins * 60 : null;
  }

  db.prepare(`
    UPDATE users SET display_name = ?, avatar_color = ?, avatar_url = ?, avatar_source = ?, about = ?, status = ?,
      headline = ?, company = ?, location = ?, website = ?, email_pro = ?, phone = ?, skills = ?,
      cv_url = ?, cv_name = ?, cv_summary = ?, pronouns = ?, banner_color = ?, banner_url = ?,
      socials = ?, setup_completed = ?,
      privacy_dm = ?, privacy_friend = ?, hide_presence = ?,
      custom_status = ?, custom_status_emoji = ?, custom_status_until = ?
    WHERE id = ?
  `).run(nextName, nextColor, nextAvatar, nextAvatarSource, nextAbout, nextStatus,
    nextHeadline, nextCompany, nextLocation, nextWebsite, nextEmailPro, nextPhone, nextSkills,
    nextCvUrl, nextCvName, nextCvSummary, nextPronouns, nextBannerColor, nextBannerUrl,
    nextSocials, nextSetup,
    nextPrivacyDm, nextPrivacyFriend, nextHide,
    nextCustom, nextCustomEmoji, nextCustomUntil, req.userId);

  if (nextHide !== current.hide_presence) refreshPresence(); // (dé)masquer le statut en ligne, tout de suite

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

/** Disposition des widgets de l'accueil (propre à chaque personne).
 *  Renvoie null tant que rien n'a été personnalisé : le client pose alors
 *  sa disposition par défaut. */
router.get('/me/home', (req, res) => {
  const row = db.prepare('SELECT home_layout FROM users WHERE id = ?').get(req.userId);
  let layout = null;
  try { layout = row?.home_layout ? JSON.parse(row.home_layout) : null; } catch { layout = null; }
  res.json({ layout });
});

/** Enregistre la disposition. On valide chaque case pour ne jamais stocker
 *  n'importe quoi, et on borne la taille du document. */
router.put('/me/home', (req, res) => {
  const raw = req.body?.layout;
  if (!Array.isArray(raw)) return res.status(400).json({ error: 'Disposition invalide' });
  if (raw.length > 40) return res.status(400).json({ error: 'Trop de widgets' });

  const num = (v, min, max, fallback) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.max(min, Math.min(max, Math.round(n))) : fallback;
  };
  const layout = raw.slice(0, 40).map((w) => ({
    id: String(w?.id ?? '').slice(0, 40) || Math.random().toString(36).slice(2, 10),
    type: String(w?.type ?? '').slice(0, 40),
    x: num(w?.x, 0, 11, 0),
    y: num(w?.y, 0, 59, 0),
    w: num(w?.w, 1, 4, 1),
    h: num(w?.h, 1, 4, 1),
    config: w?.config && typeof w.config === 'object' ? w.config : undefined,
  })).filter((w) => w.type);

  const json = JSON.stringify(layout);
  if (json.length > 20000) return res.status(400).json({ error: 'Disposition trop lourde' });
  db.prepare('UPDATE users SET home_layout = ? WHERE id = ?').run(json, req.userId);
  res.json({ ok: true, layout });
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

/** Désactiver temporairement son compte (nécessite le mot de passe).
 *  Le compte est réactivé automatiquement à la prochaine connexion. */
router.post('/me/deactivate', (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.userId);
  if (!user || !verifyPassword(req.body?.password || '', user.password_hash)) {
    return res.status(403).json({ error: 'Mot de passe incorrect' });
  }
  db.prepare('UPDATE users SET deactivated = 1 WHERE id = ?').run(req.userId);
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
    SELECT s.id, s.name, s.icon_color, s.icon_url,
      (SELECT COUNT(*) FROM server_members m WHERE m.server_id = s.id) AS member_count
    FROM servers s
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
