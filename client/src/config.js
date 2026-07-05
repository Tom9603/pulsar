// Détermine l'adresse du serveur backend selon le contexte.
//
// - En développement (Vite), on laisse les URLs relatives : le proxy de Vite
//   redirige /api et /socket.io vers http://localhost:3001.
// - En app packagée (Electron), il n'y a plus de proxy : on cible le serveur
//   configuré par l'utilisateur (par défaut http://localhost:3001), stocké localement.

const DEV = import.meta.env.DEV;
const KEY = 'pulsar.serverUrl';

// Migration de l'ancienne clé (concord.serverUrl → pulsar.serverUrl).
if (typeof localStorage !== 'undefined' && !localStorage.getItem(KEY) && localStorage.getItem('concord.serverUrl')) {
  localStorage.setItem(KEY, localStorage.getItem('concord.serverUrl'));
  localStorage.removeItem('concord.serverUrl');
}

export const IS_DESKTOP = typeof window !== 'undefined' && !!window.electron?.isDesktop;

export function getServerUrl() {
  // App desktop (Electron) : serveur configurable (défaut localhost).
  if (IS_DESKTOP) return localStorage.getItem(KEY) || 'http://localhost:3001';
  // App web : même origine (dev via proxy Vite ; prod servie par le backend/tunnel).
  return '';
}

export function setServerUrl(url) {
  const clean = (url || '').trim().replace(/\/+$/, '');
  if (clean) localStorage.setItem(KEY, clean);
  else localStorage.removeItem(KEY);
}
