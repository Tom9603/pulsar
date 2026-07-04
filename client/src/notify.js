// Notifications bureau + petit son (nouveaux DM, mentions).

let audioCtx = null;

/** Demande l'autorisation d'afficher des notifications (au démarrage). */
export function initNotifications() {
  if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
    Notification.requestPermission().catch(() => {});
  }
}

/** Petit « ping » sonore (généré, aucun fichier requis). */
export function playPing() {
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
