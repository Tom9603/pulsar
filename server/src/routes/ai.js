import { Router } from 'express';
import db from '../db.js';
import { authMiddleware } from '../auth.js';
import { canAccessChannel } from '../permissions.js';

const router = Router();
router.use(authMiddleware);

// --- Configuration (tout via variables d'environnement, aucune clé en dur) ---
const AI_KEY = process.env.PULSAR_AI_KEY || process.env.ANTHROPIC_API_KEY || '';
const AI_MODEL = process.env.PULSAR_AI_MODEL || 'claude-haiku-4-5-20251001';
const AI_DAILY_LIMIT = Math.max(1, Number(process.env.PULSAR_AI_LIMIT) || 3);
const AI_ENABLED = !!AI_KEY;

const today = () => new Date().toISOString().slice(0, 10);
function usedToday(userId) {
  return db.prepare('SELECT count FROM ai_usage WHERE user_id = ? AND day = ?').get(userId, today())?.count || 0;
}
function bumpUsage(userId) {
  db.prepare(`INSERT INTO ai_usage (user_id, day, count) VALUES (?, ?, 1)
    ON CONFLICT(user_id, day) DO UPDATE SET count = count + 1`).run(userId, today());
}
const remainingFor = (userId) => Math.max(0, AI_DAILY_LIMIT - usedToday(userId));

/** Appel de l'API d'IA (Anthropic). Renvoie le texte, ou lève une erreur. */
async function callAI(system, userText, maxTokens = 700) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': AI_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: AI_MODEL,
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content: userText }],
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`IA indisponible (${res.status}). ${detail.slice(0, 200)}`);
  }
  const data = await res.json();
  return (data.content || []).map((b) => b.text || '').join('').trim();
}

/** Vérifie la config et le quota ; renvoie une réponse d'erreur le cas échéant, sinon null. */
function guard(req, res) {
  if (!AI_ENABLED) { res.status(503).json({ error: "L'assistant IA n'est pas encore activé sur ce serveur." }); return true; }
  if (remainingFor(req.userId) <= 0) { res.status(429).json({ error: `Vous avez atteint votre limite de ${AI_DAILY_LIMIT} actions IA pour aujourd'hui.` }); return true; }
  return false;
}

/** État de l'assistant : activé, modèle, quota restant. */
router.get('/status', (req, res) => {
  res.json({ enabled: AI_ENABLED, limit: AI_DAILY_LIMIT, remaining: AI_ENABLED ? remainingFor(req.userId) : 0, model: AI_MODEL });
});

/** Rattrapage : résume les messages non lus d'un salon. */
router.post('/summarize', async (req, res) => {
  if (guard(req, res)) return;
  const channelId = Number(req.body?.channelId);
  if (!channelId || !canAccessChannel(channelId, req.userId)) return res.status(403).json({ error: 'Accès refusé à ce salon' });

  const lastRead = db.prepare('SELECT last_read_id FROM channel_reads WHERE user_id = ? AND channel_id = ?').get(req.userId, channelId)?.last_read_id || 0;
  const rows = db.prepare(`
    SELECT u.display_name, m.content, m.created_at
    FROM messages m JOIN users u ON u.id = m.user_id
    WHERE m.channel_id = ? AND m.id > ? AND m.deleted = 0 AND m.content <> ''
    ORDER BY m.id ASC LIMIT 60
  `).all(channelId, lastRead);

  if (rows.length === 0) return res.json({ summary: '', empty: true, remaining: remainingFor(req.userId) });

  const transcript = rows.map((m) => `${m.display_name}: ${m.content}`).join('\n').slice(0, 12000);
  const system = "Tu es l'assistant de Pulsar, une messagerie d'équipe professionnelle. On te donne des messages non lus d'un salon. Réponds en français, de façon concise et factuelle, en Markdown léger, avec trois parties : un résumé en 2-3 phrases, une liste « Points clés / décisions », et une liste « Ce qui vous concerne » (actions attendues de la personne). Ne invente rien.";
  try {
    const summary = await callAI(system, `Voici les messages non lus :\n\n${transcript}`);
    bumpUsage(req.userId);
    res.json({ summary, count: rows.length, remaining: remainingFor(req.userId) });
  } catch (e) { res.status(502).json({ error: e.message }); }
});

/** Reformuler : réécrit un message de façon claire et professionnelle. */
router.post('/rewrite', async (req, res) => {
  if (guard(req, res)) return;
  const text = (req.body?.text || '').trim().slice(0, 4000);
  if (text.length < 2) return res.status(400).json({ error: 'Rien à reformuler.' });
  const system = "Tu es l'assistant d'écriture de Pulsar. Reformule le message pour qu'il soit clair, professionnel, poli et sans fautes, en gardant le sens et la langue d'origine. Réponds UNIQUEMENT par le message reformulé, sans guillemets ni commentaire.";
  try {
    const rewrite = await callAI(system, text, 500);
    bumpUsage(req.userId);
    res.json({ rewrite, remaining: remainingFor(req.userId) });
  } catch (e) { res.status(502).json({ error: e.message }); }
});

export default router;
