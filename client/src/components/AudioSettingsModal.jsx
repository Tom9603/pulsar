import { useEffect, useRef, useState } from 'react';
import Modal from './Modal.jsx';
import Icon from './Icon.jsx';
import { useAudio, setAudio, resetAudio, listAudioDevices } from '../audio.js';
import { playSound } from '../sounds.js';

const supportsSink = typeof HTMLMediaElement !== 'undefined' && 'setSinkId' in HTMLMediaElement.prototype;

function Slider({ icon, label, value, onChange }) {
  return (
    <div className="am-slider">
      <label><Icon name={icon} /> {label}<span className="am-val">{Math.round(value * 100)}%</span></label>
      <input type="range" min="0" max="1" step="0.01" value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </div>
  );
}

/** Sur-modale : tous les réglages audio (entrée / sortie), tests et réinitialisation. */
export default function AudioSettingsModal({ onClose }) {
  const a = useAudio();
  const [devices, setDevices] = useState({ inputs: [], outputs: [] });
  const [testing, setTesting] = useState(false);
  const [level, setLevel] = useState(0);
  const streamRef = useRef(null);
  const ctxRef = useRef(null);
  const rafRef = useRef(null);

  useEffect(() => { listAudioDevices().then(setDevices); }, []);

  function stopMic() {
    cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    ctxRef.current?.close().catch(() => {});
    streamRef.current = null; ctxRef.current = null;
    setTesting(false); setLevel(0);
  }
  useEffect(() => () => stopMic(), []);

  async function startMic() {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: a.inDevice ? { deviceId: { exact: a.inDevice } } : true });
      streamRef.current = s;
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      ctxRef.current = ctx;
      const src = ctx.createMediaStreamSource(s);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      src.connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (const v of data) { const x = (v - 128) / 128; sum += x * x; }
        setLevel(Math.min(1, Math.sqrt(sum / data.length) * 3 * a.inVol));
        rafRef.current = requestAnimationFrame(tick);
      };
      tick(); setTesting(true);
    } catch { setTesting(false); }
  }

  return (
    <Modal onClose={() => { stopMic(); onClose(); }} className="modal-audio">
      <h2><Icon name="sliders" /> Paramètres audio</h2>

      <div className="settings-two">
        <div className="field">
          <label>Périphérique d’entrée (micro)</label>
          <select value={a.inDevice} onChange={(e) => setAudio({ inDevice: e.target.value })}>
            <option value="">Par défaut du système</option>
            {devices.inputs.map((d) => <option key={d.deviceId} value={d.deviceId}>{d.label || 'Microphone'}</option>)}
          </select>
        </div>
        <div className="field">
          <label>Périphérique de sortie (son)</label>
          <select value={a.outDevice} onChange={(e) => setAudio({ outDevice: e.target.value })} disabled={!supportsSink}>
            <option value="">Par défaut du système</option>
            {devices.outputs.map((d) => <option key={d.deviceId} value={d.deviceId}>{d.label || 'Sortie'}</option>)}
          </select>
        </div>
      </div>

      <div className="field">
        <Slider icon="microphone" label="Volume d’entrée" value={a.inVol} onChange={(v) => setAudio({ inVol: v })} />
        <Slider icon="volume-high" label="Volume de sortie" value={a.outVol} onChange={(v) => setAudio({ outVol: v })} />
        <Slider icon="music" label="Volume soundboard" value={a.sbVol} onChange={(v) => setAudio({ sbVol: v })} />
      </div>

      <div className="field">
        <label>Tests</label>
        <div className="audio-tests">
          <button className="btn btn-ghost" style={{ width: 'auto', padding: '8px 14px' }} onClick={() => playSound({ id: 'ding' })}>
            <Icon name="volume-high" /> Tester la sortie
          </button>
          <button className="btn btn-ghost" style={{ width: 'auto', padding: '8px 14px' }} onClick={() => (testing ? stopMic() : startMic())}>
            <Icon name={testing ? 'stop' : 'microphone'} /> {testing ? 'Arrêter le test micro' : 'Tester le micro'}
          </button>
        </div>
        {testing && <div className="mic-meter"><div className="mic-meter-fill" style={{ width: `${Math.round(level * 100)}%` }} /></div>}
      </div>

      <div className="modal-actions">
        <button className="btn btn-ghost" onClick={() => resetAudio()}><Icon name="rotate-left" /> Réinitialiser les paramètres audio</button>
        <button className="btn" onClick={() => { stopMic(); onClose(); }}>Terminé</button>
      </div>
    </Modal>
  );
}
