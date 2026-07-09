import { useEffect, useRef } from 'react';
import { applyOutput, subscribeAudio } from '../audio.js';

/** Lecture d'un flux audio distant : volume global / sourdine / sortie + volume local par participant. */
export default function RemoteAudio({ stream, base = 'out', volume = 1 }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (el && el.srcObject !== stream) { el.srcObject = stream; el.play?.().catch(() => {}); }
    const apply = () => { applyOutput(el, { base }); if (el) el.volume = Math.max(0, Math.min(1, el.volume * volume)); };
    apply();
    return subscribeAudio(apply);
  }, [stream, base, volume]);
  return <audio ref={ref} autoPlay />;
}
