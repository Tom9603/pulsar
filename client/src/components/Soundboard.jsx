import { useEffect, useState } from 'react';
import { api, uploadFile } from '../api.js';
import { getSocket } from '../socket.js';
import { BUILTIN_SOUNDS, playSound } from '../sounds.js';
import Icon from './Icon.jsx';

const readAsDataURL = (file) =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });

/** Soundboard d'un salon vocal : sons de base + sons persos, joués pour tout le monde. */
export default function Soundboard({ channelId, serverId }) {
  const [custom, setCustom] = useState([]);
  const [busy, setBusy] = useState(false);

  const load = () => api(`/sounds/${serverId}`).then(({ items }) => setCustom(items)).catch(() => {});
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [serverId]);

  function trigger(sound) {
    playSound(sound); // retour immédiat pour soi
    getSocket().emit('sound:play', { channelId, sound }); // + les autres du vocal
  }

  async function onUpload(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > 1024 * 1024) { alert('Son trop lourd (1 Mo max).'); return; }
    setBusy(true);
    try {
      const { url } = await uploadFile(await readAsDataURL(file), file.name);
      await api(`/sounds/${serverId}`, { method: 'POST', body: { name: file.name.replace(/\.[^.]+$/, '').slice(0, 40), url } });
      load();
    } catch (err) { alert(err.message); } finally { setBusy(false); }
  }

  async function remove(id) { await api(`/sounds/${serverId}/${id}`, { method: 'DELETE' }); load(); }

  return (
    <div className="soundboard">
      <div className="sb-title"><Icon name="volume-high" /> Soundboard</div>
      <div className="sb-grid">
        {BUILTIN_SOUNDS.map((s) => (
          <button key={s.id} className="sb-btn" onClick={() => trigger({ id: s.id })} title={s.label}>
            <span className="sb-emoji"><Icon name={s.icon} /></span>
            <span className="sb-name">{s.label}</span>
          </button>
        ))}
        {custom.map((s) => (
          <button key={s.id} className="sb-btn custom" onClick={() => trigger({ url: s.url })} title={s.name}>
            <span className="sb-emoji"><Icon name="music" /></span>
            <span className="sb-name">{s.name}</span>
            <span className="sb-del" onClick={(e) => { e.stopPropagation(); remove(s.id); }} title="Supprimer"><Icon name="xmark" /></span>
          </button>
        ))}
        <label className="sb-btn sb-add" title="Ajouter un son (audio, 1 Mo max)">
          <span className="sb-emoji"><Icon name="plus" /></span>
          <span className="sb-name">{busy ? '…' : 'Ajouter'}</span>
          <input type="file" accept="audio/*" hidden onChange={onUpload} />
        </label>
      </div>
    </div>
  );
}
