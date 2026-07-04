import { useState } from 'react';
import Modal from './Modal.jsx';
import { api, uploadImage } from '../api.js';

const readAsDataURL = (file) =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });

/** Paramètres d'un serveur : nom, icône, catégories de salons. */
export default function ServerSettingsModal({ server, categories, channels = [], onClose, onChanged }) {
  const [name, setName] = useState(server.name);
  const [newCat, setNewCat] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function saveName() {
    setBusy(true); setError('');
    try { await api(`/servers/${server.id}`, { method: 'PATCH', body: { name } }); await onChanged(); }
    catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  async function onIcon(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { setError('Image trop lourde (2 Mo max).'); return; }
    setBusy(true); setError('');
    try {
      const url = await uploadImage(await readAsDataURL(file));
      await api(`/servers/${server.id}`, { method: 'PATCH', body: { icon_url: url } });
      await onChanged();
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  }

  async function addCategory(e) {
    e.preventDefault();
    if (!newCat.trim()) return;
    setBusy(true); setError('');
    try { await api(`/servers/${server.id}/categories`, { method: 'POST', body: { name: newCat.trim() } }); setNewCat(''); await onChanged(); }
    catch (err) { setError(err.message); } finally { setBusy(false); }
  }

  async function delCategory(id) {
    setBusy(true);
    try { await api(`/servers/${server.id}/categories/${id}`, { method: 'DELETE' }); await onChanged(); }
    catch (err) { setError(err.message); } finally { setBusy(false); }
  }

  return (
    <Modal onClose={onClose}>
      <h2>Paramètres du serveur</h2>
      {error && <div className="error-msg">{error}</div>}

      <div className="field">
        <label>Nom du serveur</label>
        <div style={{ display: 'flex', gap: 8 }}>
          <input value={name} onChange={(e) => setName(e.target.value)} />
          <button className="btn" style={{ width: 'auto', padding: '0 16px' }} onClick={saveName} disabled={busy}>OK</button>
        </div>
      </div>

      <div className="field">
        <label>Icône du serveur (image)</label>
        <input type="file" accept="image/*" onChange={onIcon} disabled={busy} />
      </div>

      <div className="field">
        <label>Catégories de salons</label>
        {categories.length === 0 && <p style={{ color: 'var(--text-faint)', fontSize: 13 }}>Aucune catégorie.</p>}
        {categories.map((c) => (
          <div key={c.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 0' }}>
            <span>{c.name}</span>
            <button className="btn btn-ghost" style={{ width: 'auto', padding: '2px 10px', fontSize: 12 }} onClick={() => delCategory(c.id)}>Supprimer</button>
          </div>
        ))}
        <form onSubmit={addCategory} style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <input value={newCat} onChange={(e) => setNewCat(e.target.value)} placeholder="Nouvelle catégorie" />
          <button className="btn" style={{ width: 'auto', padding: '0 16px' }} disabled={busy}>Ajouter</button>
        </form>
      </div>

      {categories.length > 0 && (
        <div className="field">
          <label>Ranger les salons</label>
          {channels.filter((c) => c.type === 'text').map((c) => (
            <div key={c.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '4px 0' }}>
              <span># {c.name}</span>
              <select
                value={c.category_id || ''}
                disabled={busy}
                onChange={async (e) => {
                  setBusy(true);
                  try { await api(`/servers/${server.id}/channels/${c.id}`, { method: 'PATCH', body: { category_id: e.target.value ? Number(e.target.value) : null } }); await onChanged(); }
                  finally { setBusy(false); }
                }}
              >
                <option value="">— sans catégorie —</option>
                {categories.map((cat) => <option key={cat.id} value={cat.id}>{cat.name}</option>)}
              </select>
            </div>
          ))}
        </div>
      )}

      <div className="modal-actions">
        <button className="btn" onClick={onClose}>Fermer</button>
      </div>
    </Modal>
  );
}
