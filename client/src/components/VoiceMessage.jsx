import { useMemo, useRef, useState } from 'react';
import Icon from './Icon.jsx';
import { getAudio } from '../audio.js';

const fmt = (s) => { if (!isFinite(s) || s < 0) return '0:00'; const m = Math.floor(s / 60), ss = Math.floor(s % 60); return `${m}:${String(ss).padStart(2, '0')}`; };

/** Lecteur de message vocal personnalisé (charte Pulsar) : play, ondes, temps. */
export default function VoiceMessage({ src }) {
  const audioRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [dur, setDur] = useState(0);
  const [cur, setCur] = useState(0);

  const heights = useMemo(() => Array.from({ length: 34 }, (_, i) => 5 + ((i * 13) % 17)), []);

  function toggle() { const a = audioRef.current; if (!a) return; if (a.paused) { a.volume = getAudio().outVol; a.play().catch(() => {}); } else a.pause(); }
  function seek(e) { const a = audioRef.current; if (!a || !dur) return; const r = e.currentTarget.getBoundingClientRect(); a.currentTime = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * dur; }

  return (
    <div className={`voice-msg ${playing ? 'playing' : ''}`}>
      <button className="vm-play" onClick={toggle} title={playing ? 'Pause' : 'Lire'}><Icon name={playing ? 'pause' : 'play'} /></button>
      <div className="vm-wave" onClick={seek}>
        {heights.map((h, i) => (
          <span key={i} className={`vm-bar ${i / heights.length <= progress ? 'on' : ''}`} style={{ height: `${h}px` }} />
        ))}
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
