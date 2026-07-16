import jwt from 'jsonwebtoken';
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import db from './db.js';

export const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me-in-production';

// ---- Mots de passe (scrypt natif, aucune dépendance à compiler) ----

export function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password, stored) {
  const [salt, hash] = String(stored).split(':');
  if (!salt || !hash) return false;
  const hashBuf = Buffer.from(hash, 'hex');
  const testBuf = scryptSync(password, salt, 64);
  return hashBuf.length === testBuf.length && timingSafeEqual(hashBuf, testBuf);
}

// ---- Jetons JWT ----

export function signToken(user, sid) {
  return jwt.sign({ id: user.id, username: user.username, sid }, JWT_SECRET, { expiresIn: '30d' });
}

/**
 * Ouvre une session (un appareil) et renvoie son jeton.
 * Chaque connexion est enregistrée : c'est ce qui permet de lister les
 * appareils et de les déconnecter à distance.
 */
export function issueToken(user, req) {
  const sid = randomBytes(24).toString('hex');
  const now = Math.floor(Date.now() / 1000);
  const ua = String(req?.headers?.['user-agent'] || '').slice(0, 300) || null;
  db.prepare('INSERT INTO sessions (id, user_id, user_agent, created_at, last_seen) VALUES (?, ?, ?, ?, ?)')
    .run(sid, user.id, ua, now, now);
  return signToken(user, sid);
}

/** La session existe-t-elle encore (non révoquée) ? */
export const sessionExists = (sid, userId) =>
  !!(sid && db.prepare('SELECT 1 FROM sessions WHERE id = ? AND user_id = ?').get(sid, userId));

export function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}

// ---- Middleware Express ----

export function authMiddleware(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  const payload = token ? verifyToken(token) : null;
  if (!payload) return res.status(401).json({ error: 'Non authentifié' });

  // La session doit toujours exister : c'est ce qui rend possible la
  // déconnexion à distance (un appareil révoqué est refusé aussitôt).
  const session = payload.sid
    ? db.prepare('SELECT id, last_seen FROM sessions WHERE id = ? AND user_id = ?').get(payload.sid, payload.id)
    : null;
  if (!session) return res.status(401).json({ error: 'Session expirée' });

  const now = Math.floor(Date.now() / 1000);
  if (now - session.last_seen > 300) db.prepare('UPDATE sessions SET last_seen = ? WHERE id = ?').run(now, session.id); // « vu » au plus toutes les 5 min

  req.userId = payload.id;
  req.sessionId = session.id;
  next();
}

/** Retire le hash du mot de passe avant d'envoyer un utilisateur au client. */
export function publicUser(u) {
  if (!u) return null;
  const { password_hash, ...rest } = u;
  return rest;
}
