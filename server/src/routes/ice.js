import { Router } from 'express';

const router = Router();

/**
 * Renvoie la configuration ICE (STUN/TURN) pour le vocal WebRTC.
 *
 * - STUN Google : suffit sur un même réseau.
 * - TURN : nécessaire pour relayer l'audio entre réseaux différents.
 *   Configure ton propre serveur (coturn) via les variables d'environnement
 *   TURN_URL / TURN_USERNAME / TURN_CREDENTIAL.
 *   À défaut, on inclut un TURN public gratuit (best-effort, pour tester).
 */
router.get('/', (req, res) => {
  const iceServers = [{ urls: 'stun:stun.l.google.com:19302' }];

  if (process.env.TURN_URL) {
    iceServers.push({
      urls: process.env.TURN_URL.split(','),
      username: process.env.TURN_USERNAME || '',
      credential: process.env.TURN_CREDENTIAL || '',
    });
  } else {
    // TURN public gratuit (OpenRelay / Metered) — best-effort, limité, pour les tests.
    iceServers.push(
      { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
      { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
      { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' },
    );
  }

  res.json({ iceServers });
});

export default router;
