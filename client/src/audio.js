import { useState, useEffect } from 'react';

// Préférences audio globales (persistées), partagées dans toute l'app.
const KEY = 'pulsar.audio';
const defaults = {
  micMuted: false,     // couper mon micro de partout
  deafened: false,     // couper tous les sons entrants
  outVol: 1,           // volume de sortie (voix des autres)
  sbVol: 0.8,          // volume de la soundboard
  inVol: 1,            // volume d'entrée (mon micro)
  inDevice: '',        // périphérique d'entrée choisi (deviceId)
  outDevice: '',       // périphérique de sortie choisi (deviceId)
};

let state = { ...defaults };
try { state = { ...defaults, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { /* ignore */ }

const subs = new Set();

export function getAudio() { return state; }
export function setAudio(patch) {
  state = { ...state, ...patch };
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* ignore */ }
  subs.forEach((fn) => fn(state));
}
export function resetAudio() { setAudio({ ...defaults }); }
export function subscribeAudio(fn) { subs.add(fn); return () => subs.delete(fn); }

/** Hook React : renvoie l'état audio courant et se met à jour à chaque changement. */
export function useAudio() {
  const [s, setS] = useState(state);
  useEffect(() => subscribeAudio(setS), []);
  return s;
}

/** Applique volume / sourdine / périphérique de sortie à un élément <audio>. */
export function applyOutput(el, { base = 'out' } = {}) {
  if (!el) return;
  const a = state;
  const vol = base === 'sb' ? a.sbVol : a.outVol;
  el.volume = a.deafened ? 0 : Math.max(0, Math.min(1, vol));
  if (a.outDevice && typeof el.setSinkId === 'function') el.setSinkId(a.outDevice).catch(() => {});
}

/** Liste les périphériques audio (entrée / sortie). Demande l'autorisation micro si besoin. */
export async function listAudioDevices() {
  try {
    // Sans autorisation, les labels sont vides ; on tente une permission silencieuse.
    if (navigator.mediaDevices?.getUserMedia) {
      try { const s = await navigator.mediaDevices.getUserMedia({ audio: true }); s.getTracks().forEach((t) => t.stop()); } catch { /* refus : labels vides */ }
    }
    const devices = await navigator.mediaDevices.enumerateDevices();
    return {
      inputs: devices.filter((d) => d.kind === 'audioinput'),
      outputs: devices.filter((d) => d.kind === 'audiooutput'),
    };
  } catch {
    return { inputs: [], outputs: [] };
  }
}
