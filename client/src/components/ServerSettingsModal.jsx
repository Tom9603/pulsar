import { useState } from 'react';
import Modal from './Modal.jsx';
import Icon from './Icon.jsx';
import { api, uploadImage, mediaUrl } from '../api.js';

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

  const textChannels = channels.filter((c) => c.type === 'text');

  return (
    <Modal onClose={onClose} className="modal-server-settings">
      <h2>Paramètres du serveur</h2>
      {error && <div className="error-msg">{error}</div>}

      {/* Identité */}
      <section className="ss-section">
        <h3 className="ss-title">Identité</h3>
        <div className="field">
          <label>Nom du serveur</label>
          <div className="ss-inline">
            <input value={name} onChange={(e) => setName(e.target.value)} />
            <button className="btn ss-inline-btn" onClick={saveName} disabled={busy || name.trim() === server.name}>Enregistrer</button>
          </div>
        </div>
        <div className="field">
          <label>Icône du serveur</label>
          <div className="ss-icon-row">
            <span className="ss-icon-preview" style={{ background: server.icon_url ? undefined : server.icon_color }}>
              {server.icon_url ? <img src={mediaUrl(server.icon_url)} alt="" /> : server.name.charAt(0).toUpperCase()}
            </span>
            <label className="btn btn-ghost ss-icon-btn">
              <Icon name="arrow-up-from-bracket" /> Changer l’icône
              <input type="file" accept="image/*" hidden onChange={onIcon} disabled={busy} />
            </label>
          </div>
          <p className="field-hint">Une image carrée fonctionne le mieux (2 Mo max).</p>
        </div>
      </section>

      {/* Catégories */}
      <section className="ss-section">
        <h3 className="ss-title">Catégories</h3>
        <p className="field-hint">Regroupez vos salons par thème pour vous y retrouver.</p>
        {categories.length > 0 && (
          <div className="ss-cats">
            {categories.map((c) => (
              <span key={c.id} className="ss-cat-chip">
                {c.name}
                <button type="button" title="Supprimer la catégorie" onClick={() => delCategory(c.id)} disabled={busy}><Icon name="xmark" /></button>
              </span>
            ))}
          </div>
        )}
        <form onSubmit={addCategory} className="ss-add">
          <input value={newCat} onChange={(e) => setNewCat(e.target.value)} placeholder="Nom d’une nouvelle catégorie" />
          <button className="btn ss-inline-btn" disabled={busy || !newCat.trim()}>Ajouter</button>
        </form>
      </section>

      {/* Rangement des salons */}
      {categories.length > 0 && textChannels.length > 0 && (
        <section className="ss-section">
          <h3 className="ss-title">Ranger les salons</h3>
          <p className="field-hint">Choisissez la catégorie de chaque salon.</p>
          <div className="ss-arrange">
            {textChannels.map((c) => (
              <div key={c.id} className="ss-arrange-row">
                <span className="ss-chan"><Icon name="align-left" /> {c.name}</span>
                <select
                  value={c.category_id || ''}
                  disabled={busy}
                  onChange={async (e) => {
                    setBusy(true);
                    try { await api(`/servers/${server.id}/channels/${c.id}`, { method: 'PATCH', body: { category_id: e.target.value ? Number(e.target.value) : null } }); await onChanged(); }
                    finally { setBusy(false); }
                  }}
                >
                  <option value="">Sans catégorie</option>
                  {categories.map((cat) => <option key={cat.id} value={cat.id}>{cat.name}</option>)}
                </select>
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="modal-actions">
        <button className="btn btn-ghost" onClick={onClose}>Fermer</button>
      </div>
    </Modal>
  );
}
