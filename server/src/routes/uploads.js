import { Router } from 'express';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { authMiddleware } from '../auth.js';

const router = Router();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = process.env.CONCORD_DATA_DIR || path.join(__dirname, '..', '..', 'data');
export const uploadsDir = path.join(dataDir, 'uploads');
fs.mkdirSync(uploadsDir, { recursive: true });

const EXT = {
  'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp',
  'audio/webm': 'webm', 'audio/ogg': 'ogg', 'audio/mp4': 'm4a', 'audio/mpeg': 'mp3', 'audio/wav': 'wav',
};

/** Upload d'une image ou d'un message vocal envoyé en base64 (data URL). Retourne l'URL publique. */
router.post('/', authMiddleware, (req, res) => {
  const dataUrl = req.body?.dataUrl || '';
  const match = /^data:((?:image\/(?:png|jpeg|gif|webp))|(?:audio\/(?:webm|ogg|mp4|mpeg|wav)));base64,(.+)$/.exec(dataUrl);
  if (!match) return res.status(400).json({ error: 'Fichier invalide (image ou audio attendu)' });

  const mime = match[1];
  const buffer = Buffer.from(match[2], 'base64');
  if (buffer.length > 6 * 1024 * 1024) return res.status(413).json({ error: 'Fichier trop lourd (6 Mo max)' });

  const name = `${Date.now()}-${randomBytes(4).toString('hex')}.${EXT[mime]}`;
  fs.writeFileSync(path.join(uploadsDir, name), buffer);
  res.json({ url: `/uploads/${name}` });
});

export default router;
