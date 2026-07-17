import { getServerUrl } from './config.js';

let token = localStorage.getItem('token') || null;

export function setToken(t) {
  token = t;
  if (t) localStorage.setItem('token', t);
  else localStorage.removeItem('token');
}

export function getToken() {
  return token;
}

/** Petit wrapper fetch qui ajoute le jeton et gère les erreurs JSON. */
export async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(getServerUrl() + '/api' + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    // On garde la réponse complète : certains appelants ont besoin du détail
    // (compte à confirmer, délai avant nouvelle tentative...).
    const err = new Error(data.error || 'Erreur serveur');
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

/** Envoie une image (data URL base64) au serveur, renvoie son chemin public (/uploads/...). */
export async function uploadImage(dataUrl) {
  const { url } = await api('/uploads', { method: 'POST', body: { dataUrl } });
  return url;
}

/** Envoie un fichier quelconque (avec son nom), renvoie { url, name }. */
export async function uploadFile(dataUrl, name) {
  return api('/uploads', { method: 'POST', body: { dataUrl, name } });
}

/**
 * Télécharge un fichier servi par l'API (route authentifiée).
 * Un simple lien ne conviendrait pas : le jeton voyage dans un en-tête, pas
 * dans l'URL, justement pour ne pas laisser de trace dans l'historique.
 */
export async function downloadFile(path, fallbackName) {
  const res = await fetch(getServerUrl() + '/api' + path, {
    headers: token ? { Authorization: 'Bearer ' + token } : {},
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Téléchargement impossible');
  }
  const disposition = res.headers.get('Content-Disposition') || '';
  const named = /filename="([^"]+)"/.exec(disposition);
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement('a');
  a.href = url;
  a.download = named ? named[1] : fallbackName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Transforme un chemin serveur (/uploads/...) en URL complète affichable. */
export function mediaUrl(path) {
  if (!path) return '';
  return path.startsWith('http') ? path : getServerUrl() + path;
}

/** La pièce jointe est-elle un fichier audio (message vocal) ? */
export function isAudio(url) {
  return /\.(webm|ogg|mp3|m4a|mp4|mpeg|wav)$/i.test(url || '');
}
