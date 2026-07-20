import { useEffect, useState } from 'react';
import Modal from './Modal.jsx';
import ConfirmModal from './ConfirmModal.jsx';
import { api } from '../api.js';
import Icon from './Icon.jsx';
import { PERMISSIONS, PERMISSION_KEYS, PERMISSION_META } from '../permissions.js';

const COLORS = ['#99aab5', '#5865F2', '#EB459E', '#57F287', '#FAA61A', '#ED4245', '#3498DB', '#9B59B6', '#14b8a6', '#e67e22'];

/** Gestion des rôles d'un serveur : créer, modifier (nom, couleur, permissions), supprimer. */
export default function RolesModal({ serverId, roles, onClose, onChanged }) {
  const [selectedId, setSelectedId] = useState(roles[0]?.id ?? null);
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirmDel, setConfirmDel] = useState(false);

  const selected = roles.find((r) => r.id === selectedId) || null;

  useEffect(() => {
    setForm(selected ? { name: selected.name, color: selected.color, permissions: [...selected.permissions] } : null);
  }, [selectedId, selected?.name, selected?.color, JSON.stringify(selected?.permissions)]);

  async function createRole() {
    setBusy(true); setError('');
    try {
      const { role } = await api(`/servers/${serverId}/roles`, {
        method: 'POST',
        body: { name: 'Nouveau rôle', color: '#99aab5', permissions: [] },
      });
      await onChanged();
      setSelectedId(role.id);
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  async function save() {
    if (!form) return;
    setBusy(true); setError('');
    try {
      await api(`/servers/${serverId}/roles/${selectedId}`, { method: 'PATCH', body: form });
      await onChanged();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  async function doRemove() {
    setBusy(true); setError('');
    try {
      await api(`/servers/${serverId}/roles/${selectedId}`, { method: 'DELETE' });
      await onChanged();
      setSelectedId(null);
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  function togglePerm(key) {
    setForm((f) => ({
      ...f,
      permissions: f.permissions.includes(key) ? f.permissions.filter((p) => p !== key) : [...f.permissions, key],
    }));
  }

  return (
    <Modal onClose={onClose} className="modal-roles">
      <h2>Rôles du serveur</h2>
      <p className="modal-sub">Créez des rôles et cochez les permissions à accorder aux membres qui les portent.</p>
      {error && <div className="error-msg">{error}</div>}

      <div className="roles-layout">
        {/* Liste des rôles */}
        <div className="roles-list">
          <button className="btn roles-create" onClick={createRole} disabled={busy}>
            <Icon name="plus" /> Créer un rôle
          </button>
          <div className="roles-list-items">
            {roles.map((r) => (
              <button key={r.id} className={`role-item ${r.id === selectedId ? 'active' : ''}`} onClick={() => setSelectedId(r.id)}>
                <span className="role-dot" style={{ background: r.color }} />
                <span className="role-item-name">{r.name}</span>
              </button>
            ))}
            {roles.length === 0 && <p className="roles-empty">Aucun rôle pour l’instant.</p>}
          </div>
        </div>

        {/* Éditeur */}
        <div className="roles-editor">
          {form ? (
            <>
              <div className="field">
                <label>Nom du rôle</label>
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div className="field">
                <label>Couleur</label>
                <div className="color-swatches">
                  {COLORS.map((c) => (
                    <button type="button" key={c} className={`color-swatch ${c === form.color ? 'selected' : ''}`} style={{ background: c }} title="Choisir cette couleur" onClick={() => setForm({ ...form, color: c })} />
                  ))}
                </div>
              </div>
              <div className="field">
                <label>Permissions</label>
                <div className="perm-list">
                  {PERMISSION_KEYS.map((key) => {
                    const on = form.permissions.includes(key);
                    return (
                      <label key={key} className={`perm-row ${on ? 'on' : ''}`}>
                        <span className="perm-ico"><Icon name={PERMISSION_META[key]?.icon || 'circle-check'} /></span>
                        <span className="perm-text">
                          <span className="perm-name">{PERMISSIONS[key]}</span>
                          <span className="perm-desc">{PERMISSION_META[key]?.desc}</span>
                        </span>
                        <input type="checkbox" className="perm-check" checked={on} onChange={() => togglePerm(key)} />
                      </label>
                    );
                  })}
                </div>
              </div>
              <div className="roles-editor-actions">
                <button className="btn btn-danger" onClick={() => setConfirmDel(true)} disabled={busy}>Supprimer le rôle</button>
                <button className="btn" onClick={save} disabled={busy}>Enregistrer</button>
              </div>
            </>
          ) : (
            <p className="roles-hint">Sélectionnez un rôle à gauche, ou créez-en un nouveau.</p>
          )}
        </div>
      </div>

      <div className="modal-actions">
        <button className="btn btn-ghost" onClick={onClose}>Fermer</button>
      </div>

      {confirmDel && selected && (
        <ConfirmModal
          title="Supprimer le rôle"
          message={`Le rôle « ${selected.name} » sera retiré de tous les membres qui le portent.`}
          confirmLabel="Supprimer" danger
          onConfirm={doRemove}
          onClose={() => setConfirmDel(false)}
        />
      )}
    </Modal>
  );
}
