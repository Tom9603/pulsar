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

const EXT = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp' };

/** Upload d'une image envoyée en base64 (data URL). Retourne l'URL publique. */
router.post('/', authMiddleware, (req, res) => {
  const dataUrl = req.body?.dataUrl || '';
  const match = /^data:(image\/(png|jpeg|gif|webp));base64,(.+)$/.exec(dataUrl);
  if (!match) return res.status(400).json({ error: 'Image invalide (png, jpg, gif ou webp attendu)' });

  const mime = match[1];
  const buffer = Buffer.from(match[3], 'base64');
  if (buffer.length > 4 * 1024 * 1024) return res.status(413).json({ error: 'Image trop lourde (4 Mo max)' });

  const name = `${Date.now()}-${randomBytes(4).toString('hex')}.${EXT[mime]}`;
  fs.writeFileSync(path.join(uploadsDir, name), buffer);
  res.json({ url: `/uploads/${name}` });
});

export default router;
