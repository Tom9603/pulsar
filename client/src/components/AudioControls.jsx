import { useEffect, useRef, useState } from 'react';
import Icon from './Icon.jsx';
import AudioSettingsModal from './AudioSettingsModal.jsx';
import { useAudio, setAudio, listAudioDevices } from '../audio.js';

const supportsSink = typeof HTMLMediaElement !== 'undefined' && 'setSinkId' in HTMLMediaElement.prototype;

function Slider({ icon, label, value, onChange }) {
  return (
    <div className="am-slider">
      <label><Icon name={icon} /> {label}<span className="am-val">{Math.round(value * 100)}%</span></label>
      <input type="range" min="0" max="1" step="0.01" value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </div>
  );
}

/** Boutons audio (mute, coupe-son) + menu rapide (périphériques, volumes) près du profil. */
export default function AudioControls() {
  const a = useAudio();
  const [menuOpen, setMenuOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [devices, setDevices] = useState({ inputs: [], outputs: [] });
  const ref = useRef(null);

  useEffect(() => {
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setMenuOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  async function toggleMenu() {
    const opening = !menuOpen;
    setMenuOpen(opening);
    if (opening) setDevices(await listAudioDevices());
  }

  return (
    <div className="audio-controls" ref={ref}>
      <button className={`topbar-icon ${a.micMuted ? 'danger' : ''}`} title={a.micMuted ? 'Réactiver le micro' : 'Couper le micro (partout)'} onClick={() => setAudio({ micMuted: !a.micMuted })}>
        <Icon name={a.micMuted ? 'microphone-slash' : 'microphone'} />
      </button>
      <button className={`topbar-icon ${a.deafened ? 'danger' : ''}`} title={a.deafened ? 'Réactiver le son' : 'Couper tous les sons'} onClick={() => setAudio({ deafened: !a.deafened })}>
        <Icon name={a.deafened ? 'volume-xmark' : 'volume-high'} />
      </button>
      <button className={`topbar-icon ${menuOpen ? 'active' : ''}`} title="Réglages audio" onClick={toggleMenu}>
        <Icon name="bars" />
      </button>

      {menuOpen && (
        <div className="audio-menu">
          <div className="am-section">
            <label>Périphérique d’entrée (micro)</label>
            <select value={a.inDevice} onChange={(e) => setAudio({ inDevice: e.target.value })}>
              <option value="">Par défaut du système</option>
              {devices.inputs.map((d) => <option key={d.deviceId} value={d.deviceId}>{d.label || 'Microphone'}</option>)}
            </select>
          </div>
          <div className="am-section">
            <label>Périphérique de sortie (son)</label>
            <select value={a.outDevice} onChange={(e) => setAudio({ outDevice: e.target.value })} disabled={!supportsSink}>
              <option value="">Par défaut du système</option>
              {devices.outputs.map((d) => <option key={d.deviceId} value={d.deviceId}>{d.label || 'Sortie'}</option>)}
            </select>
            {!supportsSink && <span className="am-hint">Le choix de sortie n’est pas pris en charge par ce navigateur.</span>}
          </div>
          <div className="am-sep" />
          <Slider icon="microphone" label="Volume d’entrée" value={a.inVol} onChange={(v) => setAudio({ inVol: v })} />
          <Slider icon="volume-high" label="Volume de sortie" value={a.outVol} onChange={(v) => setAudio({ outVol: v })} />
          <Slider icon="music" label="Volume soundboard" value={a.sbVol} onChange={(v) => setAudio({ sbVol: v })} />
          <div className="am-sep" />
          <button className="am-more" onClick={() => { setMenuOpen(false); setSettingsOpen(true); }}>
            <Icon name="gear" /> Davantage de paramètres audio
          </button>
        </div>
      )}

      {settingsOpen && <AudioSettingsModal onClose={() => setSettingsOpen(false)} />}
    </div>
  );
}
