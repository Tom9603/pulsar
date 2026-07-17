import 'dotenv/config'; // charge le fichier server/.env (clés, réglages) avant tout le reste
import express from 'express';
import cors from 'cors';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Server } from 'socket.io';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

import './db.js';
import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import serverRoutes from './routes/servers.js';
import channelRoutes from './routes/channels.js';
import dmRoutes from './routes/dms.js';
import uploadRoutes, { uploadsDir } from './routes/uploads.js';
import iceRoutes from './routes/ice.js';
import gifRoutes from './routes/gifs.js';
import friendRoutes from './routes/friends.js';
import savedRoutes from './routes/saved.js';
import quickRoutes from './routes/quick.js';
import soundRoutes from './routes/sounds.js';
import taskRoutes from './routes/tasks.js';
import feedbackRoutes from './routes/feedback.js';
import pollRoutes from './routes/polls.js';
import aiRoutes from './routes/ai.js';
import scheduledRoutes from './routes/scheduled.js';
import sessionRoutes from './routes/sessions.js';
import searchRoutes from './routes/search.js';
import privacyRoutes from './routes/privacy.js';
import adminRoutes from './routes/admin.js';
import reportRoutes from './routes/reports.js';
import { setupSocket } from './socket.js';
import { setIO } from './realtime.js';

const app = express();
app.use(cors());
app.use(express.json({ limit: '12mb' })); // marge pour avatars + images + messages vocaux en base64

// Version applicative (racine du dépôt) : le client web l'interroge pour repérer les mises à jour.
let APP_VERSION = '0.0.0';
try {
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'package.json'), 'utf8'));
  APP_VERSION = pkg.version || APP_VERSION;
} catch { /* repli défensif */ }

app.get('/api/health', (req, res) => res.json({ ok: true }));
app.get('/api/version', (req, res) => res.json({ version: APP_VERSION }));
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/servers', serverRoutes);
app.use('/api/channels', channelRoutes);
app.use('/api/dms', dmRoutes);
app.use('/api/uploads', uploadRoutes);
app.use('/api/ice', iceRoutes);
app.use('/api/gifs', gifRoutes);
app.use('/api/friends', friendRoutes);
app.use('/api/saved', savedRoutes);
app.use('/api/quick', quickRoutes);
app.use('/api/sounds', soundRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/feedback', feedbackRoutes);
app.use('/api/polls', pollRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/scheduled', scheduledRoutes);
app.use('/api/sessions', sessionRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/privacy', privacyRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/reports', reportRoutes);

// Fichiers uploadés : nosniff + téléchargement forcé pour tout ce qui n'est pas média (anti-XSS).
app.use(
  '/uploads',
  (req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (!/\.(png|jpe?g|gif|webp|webm|ogg|mp3|m4a|mp4|wav)$/i.test(req.path)) {
      res.setHeader('Content-Disposition', 'attachment');
    }
    next();
  },
  express.static(uploadsDir),
);

// Sert l'app web compilée (si présente) → un seul lien à partager via un tunnel.
const clientDist = path.join(__dirname, '..', '..', 'client', 'dist');
if (fs.existsSync(path.join(clientDist, 'index.html'))) {
  app.use(express.static(clientDist));
  console.log('✦ App web servie depuis client/dist');
}

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });
setIO(io);
setupSocket(io);

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`✦ Serveur Pulsar démarré sur http://localhost:${PORT}`);
});
