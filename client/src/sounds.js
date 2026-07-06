import { mediaUrl } from './api.js';
import { getAudio, applyOutput } from './audio.js';

let ctx = null;
let master = null;
function actx() {
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}
const out = (c) => master || c.destination;

function tone(c, { freq, type = 'sine', dur = 0.2, gain = 0.25, freqEnd, delay = 0 }) {
  const t = c.currentTime + delay;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (freqEnd) o.frequency.exponentialRampToValueAtTime(Math.max(1, freqEnd), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(out(c));
  o.start(t); o.stop(t + dur + 0.03);
}

function noise(c, { dur = 0.15, gain = 0.3, delay = 0, cutoff = 1200 }) {
  const t = c.currentTime + delay;
  const n = Math.floor(c.sampleRate * dur);
  const buffer = c.createBuffer(1, n, c.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < n; i++) data[i] = Math.random() * 2 - 1;
  const src = c.createBufferSource(); src.buffer = buffer;
  const g = c.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = cutoff;
  src.connect(f); f.connect(g); g.connect(out(c));
  src.start(t); src.stop(t + dur);
}

// Sons de base synthétisés (identifiés par un id · tout le monde joue le même).
export const BUILTIN_SOUNDS = [
  { id: 'ding', icon: 'bell', label: 'Ding' },
  { id: 'beep', icon: 'pager', label: 'Beep' },
  { id: 'boop', icon: 'hand-point-down', label: 'Boop' },
  { id: 'tada', icon: 'champagne-glasses', label: 'Tada' },
  { id: 'sad', icon: 'arrow-trend-down', label: 'Sad' },
  { id: 'drum', icon: 'drum', label: 'Drum' },
  { id: 'laser', icon: 'wand-magic-sparkles', label: 'Laser' },
  { id: 'pop', icon: 'circle-dot', label: 'Pop' },
];

export function playBuiltin(id) {
  const c = actx();
  const a = getAudio();
  if (master) master.gain.value = a.deafened ? 0 : a.sbVol;
  switch (id) {
    case 'ding': tone(c, { freq: 880, type: 'sine', dur: 0.5, gain: 0.3 }); break;
    case 'beep': tone(c, { freq: 660, type: 'square', dur: 0.15, gain: 0.2 }); break;
    case 'boop': tone(c, { freq: 200, type: 'sine', dur: 0.15, gain: 0.3 }); break;
    case 'tada': tone(c, { freq: 523, type: 'square', dur: 0.15, gain: 0.2 }); tone(c, { freq: 784, type: 'square', dur: 0.3, gain: 0.2, delay: 0.13 }); break;
    case 'sad': tone(c, { freq: 400, type: 'sawtooth', dur: 0.6, gain: 0.25, freqEnd: 150 }); break;
    case 'drum': noise(c, { dur: 0.14, gain: 0.35, cutoff: 900 }); tone(c, { freq: 120, type: 'sine', dur: 0.2, gain: 0.4, freqEnd: 50 }); break;
    case 'laser': tone(c, { freq: 1200, type: 'square', dur: 0.25, gain: 0.2, freqEnd: 100 }); break;
    case 'pop': tone(c, { freq: 500, type: 'sine', dur: 0.06, gain: 0.35 }); break;
    default: break;
  }
}

/** Joue un son du soundboard (son de base par id, ou fichier par url). */
export function playSound(sound) {
  if (!sound || getAudio().deafened) return;
  if (sound.id) playBuiltin(sound.id);
  else if (sound.url) { const el = new Audio(mediaUrl(sound.url)); applyOutput(el, { base: 'sb' }); el.play().catch(() => {}); }
}
