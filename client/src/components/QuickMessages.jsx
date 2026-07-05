import { useEffect, useState } from 'react';
import { api } from '../api.js';
import Icon from './Icon.jsx';

/** Panneau des messages express : clic = envoi immédiat. Gestion (ajout/suppression) intégrée. */
export default function QuickMessages({ onSelect, onClose }) {
  const [items, setItems] = useState([]);
  const [text, setText] = useState('');
  const [managing, setManaging] = useState(false);

  const load = () => api('/quick').then(({ items }) => setItems(items)).catch(() => {});
  useEffect(() => { load(); }, []);

  async function add(e) {
    e.preventDefault();
    if (!text.trim()) return;
    await api('/quick', { method: 'POST', body: { text: text.trim() } });
    setText('');
    load();
  }
  async function remove(id) { await api(`/quick/${id}`, { method: 'DELETE' }); load(); }

  return (
    <div className="quick-panel">
      <div className="quick-head">
        <span><Icon name="bolt" /> Messages express</span>
        <div>
          <button onClick={() => setManaging((v) => !v)} title="Gérer">{managing ? 'OK' : <Icon name="pen" />}</button>
          <button onClick={onClose} title="Fermer"><Icon name="xmark" /></button>
        </div>
      </div>

      <div className="quick-list">
        {items.length === 0 && <div className="quick-empty">Aucun message express. Ajoutez-en un ci-dessous&nbsp;!</div>}
        {items.map((it) => (
          <div className="quick-item" key={it.id}>
            <button className="quick-text" onClick={() => { onSelect(it.text); onClose(); }}>{it.text}</button>
            {managing && <button className="quick-del" onClick={() => remove(it.id)} title="Supprimer"><Icon name="xmark" /></button>}
          </div>
        ))}
      </div>

      <form className="quick-add" onSubmit={add}>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Nouveau message express…" maxLength={500} />
        <button className="btn" style={{ width: 'auto', padding: '0 14px' }}>Ajouter</button>
      </form>
    </div>
  );
}
