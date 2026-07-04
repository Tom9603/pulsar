import { Router } from 'express';
import { authMiddleware } from '../auth.js';

const router = Router();
router.use(authMiddleware);

// Clé Tenor : celle de test publique par défaut (fonctionne, mais partagée).
// Mets ta propre clé gratuite via TENOR_API_KEY pour un usage fiable.
const KEY = process.env.TENOR_API_KEY || 'LIVDSRZULELA';
const BASE = 'https://g.tenor.com/v1';

/** Recherche de GIF (ou tendances si pas de recherche) via Tenor. */
router.get('/', async (req, res) => {
  const q = (req.query.q || '').toString().trim();
  const limit = Math.min(parseInt(req.query.limit, 10) || 24, 50);
  const url = q
    ? `${BASE}/search?q=${encodeURIComponent(q)}&key=${KEY}&limit=${limit}&contentfilter=medium&locale=fr_FR`
    : `${BASE}/trending?key=${KEY}&limit=${limit}&contentfilter=medium&locale=fr_FR`;

  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
    const data = await r.json();
    const results = (data.results || [])
      .map((g) => {
        const m = g.media?.[0] || {};
        const preview = m.tinygif?.url || m.nanogif?.url || m.gif?.url;
        const full = m.mediumgif?.url || m.gif?.url || preview;
        return { id: g.id, preview, url: full, desc: g.content_description || '' };
      })
      .filter((x) => x.preview && x.url);
    res.json({ results });
  } catch {
    res.json({ results: [], error: 'GIF indisponibles pour le moment' });
  }
});

export default router;
