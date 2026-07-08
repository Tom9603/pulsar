import { useEffect, useState } from 'react';
import Modal from './Modal.jsx';
import ConfirmModal from './ConfirmModal.jsx';
import { api } from '../api.js';
import { PERMISSIONS, PERMISSION_KEYS } from '../permissions.js';

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
    <Modal onClose={onClose}>
      <h2>Rôles du serveur</h2>
      <p className="modal-sub">Créez des rôles et cochez les permissions à accorder aux membres qui les portent.</p>
      {error && <div className="error-msg">{error}</div>}

      <div style={{ display: 'flex', gap: 16 }}>
        {/* Liste des rôles */}
        <div style={{ width: 150, flexShrink: 0 }}>
          <button className="btn" style={{ padding: '8px', fontSize: 13, marginBottom: 8 }} onClick={createRole} disabled={busy}>
            + Créer un rôle
          </button>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {roles.map((r) => (
              <div
                key={r.id}
                onClick={() => setSelectedId(r.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '8px', borderRadius: 4, cursor: 'pointer',
                  background: r.id === selectedId ? 'var(--bg-active)' : 'transparent',
                }}
              >
                <span style={{ width: 12, height: 12, borderRadius: '50%', background: r.color }} />
                <span style={{ fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</span>
              </div>
            ))}
            {roles.length === 0 && <p style={{ color: 'var(--text-faint)', fontSize: 13 }}>Aucun rôle.</p>}
          </div>
        </div>

        {/* Éditeur */}
        <div style={{ flex: 1, minWidth: 0 }}>
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
                    <div key={c} className={`color-swatch ${c === form.color ? 'selected' : ''}`} style={{ background: c }} onClick={() => setForm({ ...form, color: c })} />
                  ))}
                </div>
              </div>
              <div className="field">
                <label>Permissions</label>
                {PERMISSION_KEYS.map((key) => (
                  <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', cursor: 'pointer', textTransform: 'none', fontWeight: 400, color: 'var(--text)' }}>
                    <input type="checkbox" checked={form.permissions.includes(key)} onChange={() => togglePerm(key)} />
                    {PERMISSIONS[key]}
                  </label>
                ))}
              </div>
              <div className="modal-actions" style={{ marginTop: 12 }}>
                <button className="btn btn-danger" style={{ width: 'auto', padding: '8px 16px' }} onClick={() => setConfirmDel(true)} disabled={busy}>Supprimer</button>
                <button className="btn" style={{ width: 'auto', padding: '8px 16px' }} onClick={save} disabled={busy}>Enregistrer</button>
              </div>
            </>
          ) : (
            <p style={{ color: 'var(--text-muted)' }}>Sélectionnez un rôle ou créez-en un nouveau.</p>
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
