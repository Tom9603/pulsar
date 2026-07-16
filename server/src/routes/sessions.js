import { Router } from 'express';
import db from '../db.js';
import { authMiddleware } from '../auth.js';
import { disconnectSessions } from '../socket.js';

const router = Router();
router.use(authMiddleware);

/** Libellé lisible d'un appareil, déduit de son navigateur. */
function deviceLabel(ua) {
  const s = String(ua || '');
  if (!s) return 'Appareil inconnu';
  if (/Electron/i.test(s)) return 'Application de bureau';
  const browser = /Edg\//i.test(s) ? 'Edge'
    : /OPR\//i.test(s) ? 'Opera'
    : /Firefox\//i.test(s) ? 'Firefox'
    : /Chrome\//i.test(s) ? 'Chrome'
    : /Safari\//i.test(s) ? 'Safari'
    : 'Navigateur';
  const os = /iPhone|iPad/i.test(s) ? 'iOS'
    : /Android/i.test(s) ? 'Android'
    : /Mac OS X|Macintosh/i.test(s) ? 'macOS'
    : /Windows/i.test(s) ? 'Windows'
    : /Linux/i.test(s) ? 'Linux'
    : '';
  return os ? `${browser} sur ${os}` : browser;
}

/** Appareils actuellement connectés à ce compte. */
router.get('/', (req, res) => {
  const rows = db.prepare('SELECT id, user_agent, created_at, last_seen FROM sessions WHERE user_id = ? ORDER BY last_seen DESC').all(req.userId);
  res.json({
    sessions: rows.map((s) => ({
      id: s.id,
      label: deviceLabel(s.user_agent),
      created_at: s.created_at,
      last_seen: s.last_seen,
      current: s.id === req.sessionId,
    })),
  });
});

/** Ferme la session courante (utilisé à la déconnexion, pour ne pas laisser l'appareil dans la liste). */
router.delete('/current', (req, res) => {
  db.prepare('DELETE FROM sessions WHERE id = ? AND user_id = ?').run(req.sessionId, req.userId);
  res.json({ ok: true });
});

/** Déconnecte tous les autres appareils, en gardant celui-ci. */
router.post('/revoke-others', (req, res) => {
  const others = db.prepare('SELECT id FROM sessions WHERE user_id = ? AND id != ?').all(req.userId, req.sessionId).map((r) => r.id);
  db.prepare('DELETE FROM sessions WHERE user_id = ? AND id != ?').run(req.userId, req.sessionId);
  disconnectSessions(others);
  res.json({ ok: true, count: others.length });
});

/** Déconnecte un appareil précis. */
router.delete('/:id', (req, res) => {
  const id = String(req.params.id);
  const found = db.prepare('SELECT 1 FROM sessions WHERE id = ? AND user_id = ?').get(id, req.userId);
  if (!found) return res.status(404).json({ error: 'Session introuvable' });
  db.prepare('DELETE FROM sessions WHERE id = ? AND user_id = ?').run(id, req.userId);
  disconnectSessions([id]);
  res.json({ ok: true });
});

export default router;
