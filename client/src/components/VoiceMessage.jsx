import { useMemo, useRef, useState } from 'react';
import Icon from './Icon.jsx';
import { getAudio } from '../audio.js';

const fmt = (s) => { if (!isFinite(s) || s < 0) return '0:00'; const m = Math.floor(s / 60), ss = Math.floor(s % 60); return `${m}:${String(ss).padStart(2, '0')}`; };

/** Onde d'aspect naturel, unique et stable pour un message donné (dérivée de src).
 *  Bruit lissé + enveloppe (plus bas aux extrémités) pour éviter le rendu « fake » régulier. */
function waveform(src, n = 44) {
  let seed = 0x811c9dc5;
  for (let i = 0; i < src.length; i++) { seed ^= src.charCodeAt(i); seed = Math.imul(seed, 0x01000193) >>> 0; }
  const rand = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  const raw = Array.from({ length: n }, () => rand());
  const smooth = raw.map((v, i) => ((raw[i - 1] ?? v) + v * 2 + (raw[i + 1] ?? v)) / 4);
  return smooth.map((v, i) => {
    const env = Math.sin((i / (n - 1)) * Math.PI); // enveloppe : voix qui monte puis retombe
    return Math.max(2, Math.round(3 + v * 16 * (0.4 + 0.6 * env)));
  });
}

/** Lecteur de message vocal personnalisé (charte Pulsar) : play, onde naturelle, temps. */
export default function VoiceMessage({ src }) {
  const audioRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [dur, setDur] = useState(0);
  const [cur, setCur] = useState(0);

  const heights = useMemo(() => waveform(src || ''), [src]);

  function toggle() { const a = audioRef.current; if (!a) return; if (a.paused) { a.volume = getAudio().outVol; a.play().catch(() => {}); } else a.pause(); }
  function seek(e) { const a = audioRef.current; if (!a || !dur) return; const r = e.currentTarget.getBoundingClientRect(); a.currentTime = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * dur; }

  return (
    <div className={`voice-msg ${playing ? 'playing' : ''}`}>
      <button className="vm-play" onClick={toggle} title={playing ? 'Pause' : 'Lire'}><Icon name={playing ? 'pause' : 'play'} /></button>
      <div className="vm-wave" onClick={seek}>
        {heights.map((h, i) => {
          const frac = i / heights.length;
          const played = frac <= progress;
          const head = playing && played && (i + 1) / heights.length > progress;
          return <span key={i} className={`vm-bar ${played ? 'on' : ''} ${head ? 'head' : ''}`} style={{ height: `${h}px` }} />;
        })}
      </div>
      <span className="vm-time">{fmt(cur || (playing ? 0 : dur))}</span>
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onLoadedMetadata={(e) => setDur(e.target.duration)}
        onTimeUpdate={(e) => { setCur(e.target.currentTime); setProgress(e.target.duration ? e.target.currentTime / e.target.duration : 0); }}
        onEnded={() => { setPlaying(false); setProgress(0); setCur(0); }}
      />
    </div>
  );
}
