import { useEffect, useState } from 'react';
import Modal from './Modal.jsx';
import { api } from '../api.js';

const PRIORITIES = [
  { value: 'low', label: 'Basse' },
  { value: 'normal', label: 'Normale' },
  { value: 'high', label: 'Haute' },
];

export function toLocalInput(epoch) {
  if (!epoch) return '';
  const d = new Date(epoch * 1000);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function fromLocalInput(str) {
  if (!str) return null;
  const t = new Date(str).getTime();
  return Number.isFinite(t) ? Math.floor(t / 1000) : null;
}

/**
 * Créer ou modifier une tâche.
 * - `task` : tâche existante à éditer.
 * - `prefill` : valeurs de départ (ex. depuis un message : title, server_id, channel_id, source_label…).
 */
export default function TaskModal({ task, prefill, servers = [], members: initialMembers, currentUser, onClose, onSaved }) {
  const base = task || prefill || {};
  const [title, setTitle] = useState(base.title || '');
  const [description, setDescription] = useState(base.description || '');
  const [serverId, setServerId] = useState(base.server_id || '');
  const [assigneeId, setAssigneeId] = useState(base.assignee_id || (task ? '' : currentUser.id));
  const [priority, setPriority] = useState(base.priority || 'normal');
  const [due, setDue] = useState(toLocalInput(base.due_at));
  const [members, setMembers] = useState(initialMembers || []);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // Charge les membres du serveur choisi (pour désigner un responsable).
  useEffect(() => {
    if (!serverId) { setMembers([]); return; }
    let cancelled = false;
    api(`/servers/${serverId}`).then(({ members }) => { if (!cancelled) setMembers(members); }).catch(() => {});
    return () => { cancelled = true; };
  }, [serverId]);

  async function submit() {
    const t = title.trim();
    if (!t) { setError('Un intitulé est requis.'); return; }
    setBusy(true); setError('');
    const body = {
      title: t,
      description,
      priority,
      due_at: fromLocalInput(due),
      assignee_id: assigneeId || null,
    };
    if (!task) {
      body.server_id = serverId || null;
      body.channel_id = base.channel_id || null;
      body.source_message_id = base.source_message_id || null;
      body.source_label = base.source_label || null;
    }
    try {
      if (task) await api(`/tasks/${task.id}`, { method: 'PATCH', body });
      else await api('/tasks', { method: 'POST', body });
      onSaved?.();
      onClose();
    } catch (e) { setError(e.message); setBusy(false); }
  }

  const assigneeOptions = serverId
    ? members
    : [{ id: currentUser.id, display_name: currentUser.display_name + ' (moi)' }];

  return (
    <Modal onClose={onClose}>
      <h2>{task ? 'Modifier la tâche' : 'Nouvelle tâche'}</h2>
      {base.source_label && !task && (
        <p className="modal-sub">Depuis {base.source_label}</p>
      )}
      {error && <div className="error-msg">{error}</div>}

      <div className="field">
        <label>Intitulé</label>
        <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Que faut-il faire ?" />
      </div>

      <div className="field">
        <label>Détails (optionnel)</label>
        <textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Précisions, contexte…" />
      </div>

      <div className="task-grid">
        {!task && (
          <div className="field">
            <label>Rattacher à</label>
            <select value={serverId} onChange={(e) => { setServerId(e.target.value); setAssigneeId(''); }}>
              <option value="">Tâche personnelle</option>
              {servers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
        )}
        <div className="field">
          <label>Responsable</label>
          <select value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)}>
            <option value="">Personne</option>
            {assigneeOptions.map((m) => <option key={m.id} value={m.id}>{m.display_name}</option>)}
          </select>
        </div>
        <div className="field">
          <label>Priorité</label>
          <select value={priority} onChange={(e) => setPriority(e.target.value)}>
            {PRIORITIES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
        </div>
        <div className="field">
          <label>Échéance (date &amp; heure)</label>
          <input type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} />
        </div>
      </div>

      <div className="modal-actions">
        <button className="btn btn-ghost" onClick={onClose}>Annuler</button>
        <button className="btn" onClick={submit} disabled={busy}>{busy ? 'Enregistrement…' : (task ? 'Enregistrer' : 'Créer la tâche')}</button>
      </div>
    </Modal>
  );
}
