import { Router } from 'express';
import db from '../db.js';
import { authMiddleware, publicUser } from '../auth.js';
import { disconnectSessions } from '../socket.js';

const router = Router();
router.use(authMiddleware);

/**
 * Barrière d'administration. Le droit est relu en base à CHAQUE requête : un
 * jeton ne « contient » jamais le fait d'être admin, donc retirer le drapeau
 * coupe l'accès immédiatement, sans attendre l'expiration du jeton.
 */
function requireAdmin(req, res, next) {
  const me = db.prepare('SELECT platform_admin FROM users WHERE id = ?').get(req.userId);
  if (!me || !me.platform_admin) return res.status(403).json({ error: 'Accès réservé à l’administration.' });
  next();
}
router.use(requireAdmin);

/** Journalise une action d'administration (traçabilité). */
const logAction = (adminId, action, target, detail) =>
  db.prepare('INSERT INTO admin_log (admin_id, action, target, detail) VALUES (?, ?, ?, ?)')
    .run(adminId, action, target != null ? String(target) : null, detail || null);

// ---------------------------------------------------------------------------
// Tableau de bord
// ---------------------------------------------------------------------------
router.get('/stats', (req, res) => {
  const one = (sql) => db.prepare(sql).get().n;
  const since = (days) => `datetime('now', '-${days} days')`;

  // Inscriptions par jour sur 14 jours, pour une petite courbe.
  const signups = db.prepare(`
    SELECT date(created_at) AS jour, COUNT(*) AS n
    FROM users WHERE created_at >= ${since(13)}
    GROUP BY date(created_at) ORDER BY jour
  `).all();

  res.json({
    users: one('SELECT COUNT(*) n FROM users'),
    verified: one('SELECT COUNT(*) n FROM users WHERE verified = 1'),
    suspended: one('SELECT COUNT(*) n FROM users WHERE suspended = 1'),
    admins: one('SELECT COUNT(*) n FROM users WHERE platform_admin = 1'),
    servers: one('SELECT COUNT(*) n FROM servers'),
    channels: one('SELECT COUNT(*) n FROM channels'),
    messages: one('SELECT COUNT(*) n FROM messages WHERE deleted = 0'),
    dms: one('SELECT COUNT(*) n FROM dm_messages WHERE deleted = 0'),
    newUsers7d: one(`SELECT COUNT(*) n FROM users WHERE created_at >= ${since(7)}`),
    activeMsgs7d: one(`SELECT COUNT(*) n FROM messages WHERE created_at >= ${since(7)}`),
    openReports: one("SELECT COUNT(*) n FROM reports WHERE status = 'open'"),
    newFeedback: one('SELECT COUNT(*) n FROM feedback WHERE handled = 0'),
    signups,
  });
});

// ---------------------------------------------------------------------------
// Comptes
// ---------------------------------------------------------------------------
router.get('/users', (req, res) => {
  const q = (req.query.q || '').toString().trim();
  const like = `%${q}%`;
  const rows = db.prepare(`
    SELECT u.id, u.username, u.display_name, u.email, u.avatar_url, u.avatar_color,
           u.verified, u.suspended, u.suspended_reason, u.platform_admin, u.created_at,
           (SELECT COUNT(*) FROM server_members sm WHERE sm.user_id = u.id) AS servers,
           (SELECT COUNT(*) FROM messages m WHERE m.user_id = u.id AND m.deleted = 0) AS messages
    FROM users u
    ${q ? 'WHERE u.username LIKE ? OR u.display_name LIKE ? OR u.email LIKE ?' : ''}
    ORDER BY u.id DESC LIMIT 100
  `).all(...(q ? [like, like, like] : []));
  res.json({ users: rows });
});

/** Suspendre / réactiver un compte. On ne se suspend jamais soi-même. */
router.post('/users/:id/suspend', (req, res) => {
  const id = Number(req.params.id);
  const suspend = req.body?.suspend !== false;
  const reason = (req.body?.reason || '').toString().slice(0, 200) || null;
  const target = db.prepare('SELECT id, platform_admin FROM users WHERE id = ?').get(id);
  if (!target) return res.status(404).json({ error: 'Compte introuvable.' });
  if (id === req.userId) return res.status(400).json({ error: 'Vous ne pouvez pas vous suspendre vous-même.' });
  if (target.platform_admin) return res.status(400).json({ error: 'Un administrateur ne peut pas être suspendu depuis ici.' });

  db.prepare('UPDATE users SET suspended = ?, suspended_reason = ? WHERE id = ?').run(suspend ? 1 : 0, suspend ? reason : null, id);
  if (suspend) {
    // On coupe immédiatement toutes ses sessions ouvertes.
    const sids = db.prepare('SELECT id FROM sessions WHERE user_id = ?').all(id).map((s) => s.id);
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(id);
    disconnectSessions(sids);
  }
  logAction(req.userId, suspend ? 'suspend_user' : 'unsuspend_user', id, reason);
  res.json({ ok: true });
});

/** Supprimer définitivement un compte (et tout ce qui en dépend, via ON DELETE CASCADE). */
router.delete('/users/:id', (req, res) => {
  const id = Number(req.params.id);
  const target = db.prepare('SELECT id, platform_admin, username FROM users WHERE id = ?').get(id);
  if (!target) return res.status(404).json({ error: 'Compte introuvable.' });
  if (id === req.userId) return res.status(400).json({ error: 'Vous ne pouvez pas supprimer votre propre compte ici.' });
  if (target.platform_admin) return res.status(400).json({ error: 'Un administrateur ne peut pas être supprimé depuis ici.' });

  const sids = db.prepare('SELECT id FROM sessions WHERE user_id = ?').all(id).map((s) => s.id);
  db.prepare('DELETE FROM users WHERE id = ?').run(id);
  disconnectSessions(sids);
  logAction(req.userId, 'delete_user', id, target.username);
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Retours (feedback envoyé par les utilisateurs)
// ---------------------------------------------------------------------------
router.get('/feedback', (req, res) => {
  const rows = db.prepare(`
    SELECT f.id, f.type, f.subject, f.message, f.area, f.screenshots, f.handled, f.created_at,
           u.username, u.display_name, u.email
    FROM feedback f LEFT JOIN users u ON u.id = f.user_id
    ORDER BY f.id DESC LIMIT 200
  `).all().map((f) => { try { return { ...f, screenshots: JSON.parse(f.screenshots || '[]') }; } catch { return { ...f, screenshots: [] }; } });
  res.json({ feedback: rows });
});

router.post('/feedback/:id/handled', (req, res) => {
  const handled = req.body?.handled !== false;
  db.prepare('UPDATE feedback SET handled = ? WHERE id = ?').run(handled ? 1 : 0, Number(req.params.id));
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Signalements (modération)
// ---------------------------------------------------------------------------
router.get('/reports', (req, res) => {
  const status = ['open', 'resolved', 'dismissed'].includes(req.query.status) ? req.query.status : 'open';
  const rows = db.prepare(`
    SELECT r.*, rep.display_name AS reporter_name, tgt.display_name AS target_name, tgt.username AS target_username,
           tgt.suspended AS target_suspended
    FROM reports r
    LEFT JOIN users rep ON rep.id = r.reporter_id
    LEFT JOIN users tgt ON tgt.id = r.target_id
    WHERE r.status = ?
    ORDER BY r.id DESC LIMIT 200
  `).all(status);
  res.json({ reports: rows });
});

router.post('/reports/:id/resolve', (req, res) => {
  const status = req.body?.status === 'dismissed' ? 'dismissed' : 'resolved';
  db.prepare('UPDATE reports SET status = ?, handled_by = ? WHERE id = ?').run(status, req.userId, Number(req.params.id));
  logAction(req.userId, 'resolve_report', req.params.id, status);
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Journal d'administration
// ---------------------------------------------------------------------------
router.get('/log', (req, res) => {
  const rows = db.prepare(`
    SELECT l.id, l.action, l.target, l.detail, l.created_at, u.display_name AS admin_name
    FROM admin_log l LEFT JOIN users u ON u.id = l.admin_id
    ORDER BY l.id DESC LIMIT 100
  `).all();
  res.json({ log: rows });
});

export default router;
