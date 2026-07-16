import { Router } from 'express';
import { randomBytes } from 'node:crypto';
import db from '../db.js';
import { hashPassword, verifyPassword, issueToken, authMiddleware, publicUser } from '../auth.js';
import { mailEnabled, sendActivationEmail } from '../mail.js';

const router = Router();

const AVATAR_COLORS = ['#5865F2', '#EB459E', '#57F287', '#FAA61A', '#ED4245', '#3498DB', '#9B59B6'];
const randomColor = () => AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** URL publique de l'app (pour le lien d'activation), configurable, sinon déduite de la requête. */
function baseUrl(req) {
  if (process.env.PULSAR_PUBLIC_URL) return process.env.PULSAR_PUBLIC_URL.replace(/\/+$/, '');
  const origin = req.headers.origin;
  if (origin) return origin.replace(/\/+$/, '');
  return `${req.protocol}://${req.get('host')}`;
}

async function sendActivation(req, user) {
  const link = `${baseUrl(req)}/api/auth/verify?token=${user.verify_token}`;
  try { await sendActivationEmail(user.email, user.display_name, link); } catch { /* email best-effort */ }
}

router.post('/register', async (req, res) => {
  const { username, password, display_name, email } = req.body || {};
  const cleanEmail = (email || '').trim().toLowerCase();
  if (!username || !password) return res.status(400).json({ error: 'Nom d’utilisateur et mot de passe requis' });
  if (username.trim().length < 3) return res.status(400).json({ error: 'Nom d’utilisateur trop court (3 caractères min.)' });
  if (!EMAIL_RE.test(cleanEmail)) return res.status(400).json({ error: 'Adresse email invalide' });
  if (password.length < 8) return res.status(400).json({ error: 'Mot de passe trop court (8 caractères min.)' });

  const clean = username.trim();
  if (db.prepare('SELECT id FROM users WHERE username = ?').get(clean)) return res.status(409).json({ error: 'Ce nom d’utilisateur est déjà pris' });
  if (db.prepare('SELECT id FROM users WHERE email = ?').get(cleanEmail)) return res.status(409).json({ error: 'Un compte existe déjà avec cet email' });

  const token = randomBytes(24).toString('hex');
  const verified = mailEnabled ? 0 : 1; // sans email configuré : compte activé directement
  const info = db.prepare(
    'INSERT INTO users (username, password_hash, display_name, avatar_color, email, verified, verify_token) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(clean, hashPassword(password), (display_name || '').trim() || clean, randomColor(), cleanEmail, verified, verified ? null : token);

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
  if (!verified) { await sendActivation(req, user); return res.json({ pending: true, email: cleanEmail }); }
  res.json({ token: issueToken(user, req), user: publicUser(user) });
});

router.post('/login', (req, res) => {
  const { username, password } = req.body || {};
  const key = (username || '').trim();
  const user = db.prepare('SELECT * FROM users WHERE username = ? OR email = ?').get(key, key.toLowerCase());
  if (!user || !verifyPassword(password || '', user.password_hash)) {
    return res.status(401).json({ error: 'Identifiants invalides' });
  }
  if (!user.verified) return res.status(403).json({ error: 'Compte non activé. Vérifiez votre email.', needsVerification: true, email: user.email });
  res.json({ token: issueToken(user, req), user: publicUser(user) });
});

/** Lien d'activation cliqué depuis l'email : active le compte puis renvoie vers l'app. */
router.get('/verify', (req, res) => {
  const token = String(req.query.token || '');
  const user = token && db.prepare('SELECT * FROM users WHERE verify_token = ?').get(token);
  const redirect = `${baseUrl(req)}/#/login?verified=${user ? '1' : '0'}`;
  if (user) db.prepare('UPDATE users SET verified = 1, verify_token = NULL WHERE id = ?').run(user.id);
  res.redirect(redirect);
});

/** Renvoyer l'email d'activation (par email ou nom d'utilisateur). */
router.post('/resend', async (req, res) => {
  const key = (req.body?.email || req.body?.login || '').trim();
  const user = key && db.prepare('SELECT * FROM users WHERE email = ? OR username = ?').get(key.toLowerCase(), key);
  if (user && !user.verified) {
    if (!user.verify_token) { const t = randomBytes(24).toString('hex'); db.prepare('UPDATE users SET verify_token = ? WHERE id = ?').run(t, user.id); user.verify_token = t; }
    await sendActivation(req, user);
  }
  res.json({ ok: true }); // réponse neutre (ne révèle pas si l'email existe)
});

router.get('/me', authMiddleware, (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.userId);
  if (!user) return res.status(404).json({ error: 'Utilisateur introuvable' });
  res.json({ user: publicUser(user) });
});

export default router;
