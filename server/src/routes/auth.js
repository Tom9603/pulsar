import { Router } from 'express';
import { randomInt, randomBytes } from 'node:crypto';
import db from '../db.js';
import { hashPassword, verifyPassword, issueToken, authMiddleware, publicUser } from '../auth.js';
import { mailEnabled, sendActivationCode, sendResetEmail, sendPasswordChangedEmail, sendExistingAccountEmail, CODE_TTL_MIN, RESET_TTL_MIN } from '../mail.js';
import { limit, take, reset, clientIp } from '../ratelimit.js';
import { disconnectSessions } from '../socket.js';

const router = Router();

const AVATAR_COLORS = ['#5865F2', '#EB459E', '#57F287', '#FAA61A', '#ED4245', '#3498DB', '#9B59B6'];
const randomColor = () => AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const CODE_TTL = CODE_TTL_MIN * 60_000;   // validité du code de confirmation
const RESET_TTL = RESET_TTL_MIN * 60_000; // validité du lien de réinitialisation
const MAX_TRIES = 5;                      // essais avant de devoir redemander un code
const RESEND_COOLDOWN = 60_000;           // délai minimal entre deux envois

/** URL publique de l'app (pour les liens des emails), sinon déduite de la requête. */
function baseUrl(req) {
  if (process.env.PULSAR_PUBLIC_URL) return process.env.PULSAR_PUBLIC_URL.replace(/\/+$/, '');
  const origin = req.headers.origin;
  if (origin) return origin.replace(/\/+$/, '');
  return `${req.protocol}://${req.get('host')}`;
}

/** Code à 5 chiffres, tiré au sort de façon cryptographique (10000 à 99999). */
const newCode = () => String(randomInt(10000, 100000));

/** Génère un code, l'enregistre et l'envoie. Ne divulgue jamais le code au client. */
async function issueCode(user) {
  const code = newCode();
  db.prepare('UPDATE users SET verify_code = ?, verify_expires = ?, verify_tries = 0, verify_sent_at = ? WHERE id = ?')
    .run(code, Date.now() + CODE_TTL, Date.now(), user.id);
  try {
    await sendActivationCode(user.email, user.display_name, code);
  } catch (e) {
    console.error('[mail] envoi du code impossible :', e.message);
  }
}

router.post('/register', limit('register', 5, 3600, 'Trop de créations de compte depuis cet appareil. Réessayez dans une heure.'), async (req, res) => {
  const { username, password, display_name, email, tos_version } = req.body || {};
  const cleanEmail = (email || '').trim().toLowerCase();
  if (!username || !password) return res.status(400).json({ error: 'Nom d’utilisateur et mot de passe requis' });
  if (username.trim().length < 3) return res.status(400).json({ error: 'Nom d’utilisateur trop court (3 caractères min.)' });
  if (!EMAIL_RE.test(cleanEmail)) return res.status(400).json({ error: 'Adresse email invalide' });
  if (password.length < 8) return res.status(400).json({ error: 'Mot de passe trop court (8 caractères min.)' });
  // L'acceptation est exigée côté serveur aussi : une case cochée dans le
  // navigateur ne prouve rien, et la preuve doit être enregistrée.
  const tosVersion = Number(tos_version);
  if (!tosVersion) return res.status(400).json({ error: 'Vous devez accepter les conditions d’utilisation' });

  const clean = username.trim();
  if (db.prepare('SELECT id FROM users WHERE username = ?').get(clean)) return res.status(409).json({ error: 'Ce nom d’utilisateur est déjà pris' });

  // Anti-énumération : si l'email est déjà utilisé, on ne le révèle PAS. Avec les
  // emails actifs, on renvoie la même réponse neutre qu'une inscription normale et
  // on prévient le vrai titulaire par email. Sans emails (dev), on reste explicite.
  const emailOwner = db.prepare('SELECT id, display_name FROM users WHERE email = ?').get(cleanEmail);
  if (emailOwner) {
    if (mailEnabled) {
      try { sendExistingAccountEmail(cleanEmail, emailOwner.display_name); } catch (e) { console.error('[mail] compte existant :', e.message); }
      return res.json({ pending: true, email: cleanEmail });
    }
    return res.status(409).json({ error: 'Un compte existe déjà avec cet email' });
  }

  const verified = mailEnabled ? 0 : 1; // sans email configuré : compte activé directement
  const info = db.prepare(
    'INSERT INTO users (username, password_hash, display_name, avatar_color, email, verified, tos_accepted_at, tos_version, setup_completed) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)'
  ).run(clean, hashPassword(password), (display_name || '').trim() || clean, randomColor(), cleanEmail, verified, Date.now(), tosVersion);

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
  if (!verified) { await issueCode(user); return res.json({ pending: true, email: cleanEmail }); }
  res.json({ token: issueToken(user, req), user: publicUser(user) });
});

router.post('/login', limit('login', 10, 900, 'Trop de tentatives de connexion. Réessayez dans quelques minutes.'), (req, res) => {
  const { username, password } = req.body || {};
  const key = (username || '').trim();
  const user = db.prepare('SELECT * FROM users WHERE username = ? OR email = ?').get(key, key.toLowerCase());
  if (!user || !verifyPassword(password || '', user.password_hash)) {
    return res.status(401).json({ error: 'Identifiants invalides' });
  }
  if (!user.verified) return res.status(403).json({ error: 'Compte non confirmé. Saisissez le code reçu par email.', needsVerification: true, email: user.email });
  if (user.suspended) {
    return res.status(403).json({ error: user.suspended_reason
      ? `Votre compte a été suspendu : ${user.suspended_reason}`
      : 'Votre compte a été suspendu. Contactez l’administrateur.' });
  }
  // Désactivation temporaire : la reconnexion réactive automatiquement le compte.
  if (user.deactivated) {
    db.prepare('UPDATE users SET deactivated = 0 WHERE id = ?').run(user.id);
    user.deactivated = 0;
  }
  reset(`login:${clientIp(req)}`); // connexion réussie : on repart de zéro
  res.json({ token: issueToken(user, req), user: publicUser(user) });
});

/** Saisie du code reçu par email : confirme le compte et connecte directement. */
router.post('/verify-code', limit('verify', 15, 900, 'Trop de tentatives. Réessayez dans quelques minutes.'), (req, res) => {
  const email = (req.body?.email || '').trim().toLowerCase();
  const code = String(req.body?.code || '').trim();
  const user = email && db.prepare('SELECT * FROM users WHERE email = ?').get(email);

  if (!user || user.verified) return res.status(400).json({ error: 'Ce compte est déjà confirmé ou n’existe pas.' });
  if (!user.verify_code || !user.verify_expires || Date.now() > user.verify_expires) {
    return res.status(410).json({ error: 'Ce code a expiré. Demandez-en un nouveau.', expired: true });
  }
  if (user.verify_tries >= MAX_TRIES) {
    return res.status(429).json({ error: 'Trop d’essais sur ce code. Demandez-en un nouveau.', expired: true });
  }
  if (code !== user.verify_code) {
    db.prepare('UPDATE users SET verify_tries = verify_tries + 1 WHERE id = ?').run(user.id);
    const left = MAX_TRIES - (user.verify_tries + 1);
    return res.status(400).json({ error: left > 0 ? `Code incorrect. Il vous reste ${left} essai${left > 1 ? 's' : ''}.` : 'Code incorrect. Demandez un nouveau code.' });
  }

  db.prepare('UPDATE users SET verified = 1, verify_code = NULL, verify_expires = NULL, verify_tries = 0 WHERE id = ?').run(user.id);
  const fresh = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id);
  res.json({ token: issueToken(fresh, req), user: publicUser(fresh) });
});

/** Renvoyer un code (réponse toujours neutre : ne révèle pas si l'email existe). */
router.post('/resend', async (req, res) => {
  const r = take(`resend:${clientIp(req)}`, 5, 3600_000);
  if (!r.ok) return res.status(429).json({ error: 'Trop de demandes de code. Réessayez plus tard.', retryAfter: r.retryAfter });

  const key = (req.body?.email || req.body?.login || '').trim();
  const user = key && db.prepare('SELECT * FROM users WHERE email = ? OR username = ?').get(key.toLowerCase(), key);
  if (user && !user.verified) {
    const since = Date.now() - (user.verify_sent_at || 0);
    if (since < RESEND_COOLDOWN) {
      return res.status(429).json({ error: 'Un code vient d’être envoyé. Patientez un instant.', retryAfter: Math.ceil((RESEND_COOLDOWN - since) / 1000) });
    }
    await issueCode(user);
  }
  res.json({ ok: true });
});

/**
 * « Mot de passe oublié » : envoie un lien de réinitialisation.
 * La réponse est toujours positive, même si l'email est inconnu : sinon, ce
 * point d'entrée permettrait de deviner quelles adresses ont un compte.
 */
router.post('/forgot', async (req, res) => {
  const r = take(`forgot:${clientIp(req)}`, 5, 3600_000);
  if (!r.ok) return res.status(429).json({ error: 'Trop de demandes. Réessayez plus tard.', retryAfter: r.retryAfter });

  const email = (req.body?.email || '').trim().toLowerCase();
  const user = email && db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (user && user.verified) {
    const token = randomBytes(32).toString('hex');
    db.prepare('UPDATE users SET reset_token = ?, reset_expires = ? WHERE id = ?').run(token, Date.now() + RESET_TTL, user.id);
    try {
      await sendResetEmail(user.email, user.display_name, `${baseUrl(req)}/#/reset?token=${token}`);
    } catch (e) {
      console.error('[mail] envoi du lien de réinitialisation impossible :', e.message);
    }
  }
  res.json({ ok: true });
});

/** Le lien reçu est-il encore valable ? (pour afficher un message clair avant la saisie) */
router.get('/reset-check', (req, res) => {
  const token = String(req.query.token || '');
  const user = token && db.prepare('SELECT reset_expires FROM users WHERE reset_token = ?').get(token);
  res.json({ valid: !!(user && user.reset_expires > Date.now()) });
});

/** Enregistre le nouveau mot de passe et ferme toutes les sessions ouvertes. */
router.post('/reset', limit('reset', 10, 900, 'Trop de tentatives. Réessayez dans quelques minutes.'), async (req, res) => {
  const token = String(req.body?.token || '');
  const password = String(req.body?.password || '');
  if (password.length < 8) return res.status(400).json({ error: 'Mot de passe trop court (8 caractères min.)' });

  const user = token && db.prepare('SELECT * FROM users WHERE reset_token = ?').get(token);
  if (!user || !user.reset_expires || Date.now() > user.reset_expires) {
    return res.status(410).json({ error: 'Ce lien a expiré ou a déjà été utilisé. Demandez-en un nouveau.' });
  }

  db.prepare('UPDATE users SET password_hash = ?, reset_token = NULL, reset_expires = NULL WHERE id = ?')
    .run(hashPassword(password), user.id);

  // Sécurité : si le compte avait été compromis, l'intrus perd tous ses accès.
  const sessions = db.prepare('SELECT id FROM sessions WHERE user_id = ?').all(user.id).map((s) => s.id);
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(user.id);
  disconnectSessions(sessions);

  try {
    await sendPasswordChangedEmail(user.email, user.display_name);
  } catch (e) {
    console.error('[mail] notification de changement impossible :', e.message);
  }
  res.json({ ok: true });
});

router.get('/me', authMiddleware, (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.userId);
  if (!user) return res.status(404).json({ error: 'Utilisateur introuvable' });
  res.json({ user: publicUser(user) });
});

export default router;
