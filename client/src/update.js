// Détection et pilotage des mises à jour de Pulsar.
//
// - Web : on compare la version compilée dans le client à celle servie par le
//   serveur (/api/version). Si elles diffèrent, une nouvelle version est en ligne
//   et un simple rechargement l'applique.
// - Desktop (Electron) : on écoute electron-updater (disponible, progression,
//   téléchargée) et on déclenche le téléchargement puis le redémarrage.

import { useEffect, useState } from 'react';
import { getServerUrl, IS_DESKTOP } from './config.js';

// Version injectée au build (voir vite.config.js). Repli défensif hors build.
const APP_VERSION = (typeof __APP_VERSION__ !== 'undefined' && __APP_VERSION__) || '0.0.0';

let state = {
  isDesktop: IS_DESKTOP,
  currentVersion: APP_VERSION,
  available: false, // une nouvelle version existe
  version: '', // son numéro
  phase: 'idle', // idle | available | downloading | downloaded | error
  progress: 0, // pourcentage de téléchargement (desktop)
  open: false, // modale d'invitation ouverte
  dismissed: false, // « Plus tard » a été choisi (le rappel reste)
};

const subs = new Set();
const emit = () => subs.forEach((fn) => fn(state));
const set = (patch) => { state = { ...state, ...patch }; emit(); };

export const getUpdate = () => state;
export function subscribeUpdate(fn) { subs.add(fn); return () => subs.delete(fn); }

export function useUpdate() {
  const [snap, setSnap] = useState(getUpdate());
  useEffect(() => subscribeUpdate(setSnap), []);
  return snap;
}

const DISMISS_KEY = 'pulsar.updateDismissed';

// Compare deux versions « x.y.z » : vrai si `remote` est STRICTEMENT plus récente que `local`.
function isNewer(remote, local) {
  const A = String(remote).split('.').map((n) => parseInt(n, 10) || 0);
  const B = String(local).split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(A.length, B.length); i++) {
    const x = A[i] || 0, y = B[i] || 0;
    if (x !== y) return x > y;
  }
  return false;
}

function wasDismissed(version) {
  try { return !!version && localStorage.getItem(DISMISS_KEY) === version; } catch { return false; }
}

function markAvailable(version) {
  const v = version || '';
  if (state.available) { if (v) set({ version: v }); return; }
  // Si « Plus tard » a déjà été choisi pour CETTE version, on n'ouvre pas la modale
  // (le rappel en haut à droite reste dispo). Une version plus récente la rouvrira.
  const dismissed = wasDismissed(v);
  set({ available: true, version: v, phase: 'available', open: !dismissed, dismissed });
}

/** Rouvre la modale depuis le rappel « Mettre à jour ». */
export function openUpdate() { set({ open: true }); }

/** « Plus tard » : ferme la modale, mémorise le choix pour cette version, garde le rappel. */
export function dismissUpdate() {
  try { if (state.version) localStorage.setItem(DISMISS_KEY, state.version); } catch { /* ignore */ }
  set({ open: false, dismissed: true });
}

/** Lance la mise à jour (télécharge sur desktop, recharge sur le web). */
export function beginUpdate() {
  if (state.isDesktop && window.electron?.downloadUpdate) {
    set({ open: false, phase: 'downloading', progress: 0 });
    window.electron.downloadUpdate();
  } else {
    // Web : la nouvelle version est déjà en ligne, on recharge en contournant le cache.
    set({ open: false, phase: 'downloading', progress: 100 });
    setTimeout(() => {
      const u = new URL(window.location.href);
      u.searchParams.set('_v', Date.now().toString(36));
      window.location.replace(u.toString());
    }, 500);
  }
}

let started = false;
/** À appeler une fois au démarrage de l'app. */
export function startUpdateWatch() {
  if (started) return;
  started = true;

  if (state.isDesktop && window.electron) {
    window.electron.onUpdateAvailable?.((info) => markAvailable(info?.version));
    window.electron.onUpdateProgress?.((p) => set({ phase: 'downloading', progress: Math.max(0, Math.min(100, Math.round(p?.percent || 0))) }));
    window.electron.onUpdateDownloaded?.((info) => {
      set({ phase: 'downloaded', progress: 100, version: info?.version || state.version });
      // Redémarrage automatique pour installer.
      setTimeout(() => window.electron.installUpdate?.(), 1800);
    });
    return;
  }

  // Web : interroge le serveur et compare les versions.
  const check = async () => {
    try {
      const res = await fetch(`${getServerUrl()}/api/version`, { cache: 'no-store' });
      if (!res.ok) return;
      const { version } = await res.json();
      // On ne propose que si le serveur est PLUS RÉCENT (évite une « rétrogradation »
      // qui bouclerait : un rechargement ne changerait pas la version en local).
      if (isNewer(version, state.currentVersion)) markAvailable(version);
    } catch { /* hors-ligne : on réessaiera plus tard */ }
  };
  check();
  setInterval(check, 5 * 60 * 1000);
}
