import { useRef, useState } from 'react';
import { uploadImage } from '../api.js';

const blobToDataURL = (blob) =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(blob);
  });

/** Enregistre un message vocal et l'envoie (via onSend(url)). */
export default function VoiceRecorder({ onSend, disabled }) {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [busy, setBusy] = useState(false);
  const recorder = useRef(null);
  const chunks = useRef([]);
  const stream = useRef(null);
  const timer = useRef(null);
  const cancelled = useRef(false);

  async function start() {
    if (disabled || busy) return;
    let s;
    try {
      s = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      alert('Micro inaccessible : autorise le microphone pour un message vocal.');
      return;
    }
    stream.current = s;
    chunks.current = [];
    cancelled.current = false;
    const mime = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : '';
    const mr = new MediaRecorder(s, mime ? { mimeType: mime } : undefined);
    recorder.current = mr;
    mr.ondataavailable = (e) => { if (e.data.size) chunks.current.push(e.data); };
    mr.onstop = async () => {
      stream.current?.getTracks().forEach((t) => t.stop());
      clearInterval(timer.current);
      if (cancelled.current || chunks.current.length === 0) {
        setRecording(false);
        setSeconds(0);
        return;
      }
      setBusy(true);
      try {
        const type = (mr.mimeType || 'audio/webm').split(';')[0]; // sans ;codecs=…
        const blob = new Blob(chunks.current, { type });
        const url = await uploadImage(await blobToDataURL(blob));
        await onSend(url);
      } catch (err) {
        alert(err.message);
      } finally {
        setBusy(false);
        setRecording(false);
        setSeconds(0);
      }
    };
    mr.start();
    setRecording(true);
    setSeconds(0);
    timer.current = setInterval(() => setSeconds((n) => n + 1), 1000);
  }

  const stopSend = () => { if (recorder.current && recording) { cancelled.current = false; recorder.current.stop(); } };
  const cancel = () => { if (recorder.current && recording) { cancelled.current = true; recorder.current.stop(); } };

  if (busy) return <span className="composer-attach" title="Envoi…">⏳</span>;
  if (!recording) {
    return (
      <button type="button" className="composer-attach" title="Message vocal" onClick={start} disabled={disabled}>🎤</button>
    );
  }
  const mm = String(Math.floor(seconds / 60)).padStart(2, '0');
  const ss = String(seconds % 60).padStart(2, '0');
  return (
    <div className="voice-recorder">
      <span className="rec-dot" />
      <span className="rec-time">{mm}:{ss}</span>
      <button type="button" title="Annuler" onClick={cancel}>✕</button>
      <button type="button" className="rec-send" title="Envoyer" onClick={stopSend}>➤</button>
    </div>
  );
}
