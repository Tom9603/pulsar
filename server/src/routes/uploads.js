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

const MIME_EXT = {
  'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp',
  'audio/webm': 'webm', 'audio/ogg': 'ogg', 'audio/mp4': 'm4a', 'audio/mpeg': 'mp3', 'audio/wav': 'wav',
  'application/pdf': 'pdf', 'application/zip': 'zip', 'text/plain': 'txt',
};

/** Upload d'un fichier (image, audio, ou n'importe quel document) envoyé en base64. */
router.post('/', authMiddleware, (req, res) => {
  const { dataUrl, name } = req.body || {};
  const match = /^data:([^;]+);base64,(.+)$/.exec(dataUrl || '');
  if (!match) return res.status(400).json({ error: 'Fichier invalide' });

  const mime = match[1];
  const buffer = Buffer.from(match[2], 'base64');
  if (buffer.length > 8 * 1024 * 1024) return res.status(413).json({ error: 'Fichier trop lourd (8 Mo max)' });

  const safeName = (name || '').replace(/[^a-zA-Z0-9._ -]/g, '_').slice(0, 80).trim();
  let ext = safeName.includes('.') ? safeName.split('.').pop().toLowerCase() : (MIME_EXT[mime] || 'bin');
  ext = ext.replace(/[^a-z0-9]/g, '').slice(0, 6) || 'bin';

  const fileName = `${Date.now()}-${randomBytes(4).toString('hex')}.${ext}`;
  fs.writeFileSync(path.join(uploadsDir, fileName), buffer);
  res.json({ url: `/uploads/${fileName}`, name: safeName || fileName });
});

export default router;
