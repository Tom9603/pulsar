import { useEffect, useRef } from 'react';
import { applyOutput, subscribeAudio } from '../audio.js';

/** Lecture d'un flux audio distant en respectant le volume / la sourdine / le périphérique de sortie. */
export default function RemoteAudio({ stream, base = 'out' }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (el && el.srcObject !== stream) { el.srcObject = stream; el.play?.().catch(() => {}); }
    applyOutput(el, { base });
    return subscribeAudio(() => applyOutput(el, { base }));
  }, [stream, base]);
  return <audio ref={ref} autoPlay />;
}
