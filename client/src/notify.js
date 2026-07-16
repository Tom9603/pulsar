// Notifications bureau + petit son (nouveaux DM, mentions).
import { getAudio } from './audio.js';

let audioCtx = null;

// Préférences (persistées) : son et notifications bureau activés par défaut.
export const isSoundEnabled = () => localStorage.getItem('pulsar_sound') !== 'off';
export const setSoundEnabled = (on) => localStorage.setItem('pulsar_sound', on ? 'on' : 'off');
export const isDesktopEnabled = () => localStorage.getItem('pulsar_desktop') !== 'off';
export const setDesktopEnabled = (on) => localStorage.setItem('pulsar_desktop', on ? 'on' : 'off');

// --- Heures calmes : plages où l'on ne veut ni son ni notification ---
export const isQuietEnabled = () => localStorage.getItem('pulsar_quiet') === 'on';
export const setQuietEnabled = (on) => localStorage.setItem('pulsar_quiet', on ? 'on' : 'off');
export const getQuietFrom = () => localStorage.getItem('pulsar_quiet_from') || '19:00';
export const setQuietFrom = (v) => localStorage.setItem('pulsar_quiet_from', v);
export const getQuietTo = () => localStorage.getItem('pulsar_quiet_to') || '09:00';
export const setQuietTo = (v) => localStorage.setItem('pulsar_quiet_to', v);
export const isQuietWeekend = () => localStorage.getItem('pulsar_quiet_weekend') === 'on';
export const setQuietWeekend = (on) => localStorage.setItem('pulsar_quiet_weekend', on ? 'on' : 'off');

const toMin = (hhmm) => { const [h, m] = String(hhmm).split(':'); return (parseInt(h, 10) || 0) * 60 + (parseInt(m, 10) || 0); };

/** Sommes-nous actuellement en « heures calmes » ? (gère les plages qui passent minuit) */
export function isQuietNow(now = new Date()) {
  if (!isQuietEnabled()) return false;
  const day = now.getDay(); // 0 = dimanche … 6 = samedi
  if (isQuietWeekend() && (day === 0 || day === 6)) return true;
  const from = toMin(getQuietFrom());
  const to = toMin(getQuietTo());
  if (from === to) return false; // plage vide
  const cur = now.getHours() * 60 + now.getMinutes();
  return from < to ? (cur >= from && cur < to) : (cur >= from || cur < to);
}

/** Demande l'autorisation d'afficher des notifications (au démarrage). */
export function initNotifications() {
  if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
    Notification.requestPermission().catch(() => {});
  }
}

/** Petit « ping » sonore (généré, aucun fichier requis). */
export function playPing() {
  if (!isSoundEnabled() || isQuietNow() || getAudio().deafened) return;
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.connect(g);
    g.connect(audioCtx.destination);
    o.type = 'sine';
    o.frequency.value = 880;
    const t = audioCtx.currentTime;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.15, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    o.start(t);
    o.stop(t + 0.3);
  } catch {
    /* audio indisponible : on ignore */
  }
}

/** Notification système (si autorisée). onClick ramène la fenêtre au premier plan. */
export function desktopNotify(title, body, onClick) {
  if (!isDesktopEnabled() || isQuietNow()) return;
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  try {
    const n = new Notification(title, { body, silent: true });
    if (onClick) {
      n.onclick = () => {
        window.focus?.();
        onClick();
      };
    }
  } catch {
    /* ignore */
  }
}
