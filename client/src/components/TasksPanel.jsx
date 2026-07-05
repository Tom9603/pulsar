import Avatar from './Avatar.jsx';

const GROUPS = [
  { key: 'todo', label: '🗂 À faire' },
  { key: 'doing', label: '⏳ En cours' },
  { key: 'done', label: '✓ Terminé' },
];
const PRIO = { high: { dot: '#ef4444', label: 'Haute' }, normal: { dot: '#3b82f6', label: 'Normale' }, low: { dot: '#6b7280', label: 'Basse' } };

function dueLabel(epoch) {
  if (!epoch) return null;
  const d = new Date(epoch * 1000);
  const overdue = epoch * 1000 < Date.now();
  const txt = d.toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  return { txt: `${overdue ? '⚠ ' : '📅 '}${txt}`, overdue };
}

/** Liste des tâches (assignées à moi ou créées par moi), regroupées par statut. */
export default function TasksPanel({ tasks, currentUser, filter, onFilter, onToggle, onSetStatus, onEdit, onDelete, onNew }) {
  const shown = filter === 'mine' ? tasks.filter((t) => t.assignee_id === currentUser.id) : tasks;
  const openCount = tasks.filter((t) => t.status !== 'done' && t.assignee_id === currentUser.id).length;

  return (
    <div className="tasks-panel">
      <div className="tasks-bar">
        <div className="seg">
          <button className={filter === 'mine' ? 'active' : ''} onClick={() => onFilter('mine')}>Qui m’est assigné{openCount ? ` · ${openCount}` : ''}</button>
          <button className={filter === 'all' ? 'active' : ''} onClick={() => onFilter('all')}>Tout</button>
        </div>
        <button className="btn" style={{ width: 'auto', padding: '7px 14px', fontSize: 13 }} onClick={onNew}>＋ Nouvelle tâche</button>
      </div>

      {shown.length === 0 && (
        <p className="tasks-empty">
          Aucune tâche ici. Créez-en une, ou transformez un message en tâche via l’icône ✔️.
        </p>
      )}

      {GROUPS.map(({ key, label }) => {
        const group = shown.filter((t) => t.status === key);
        if (group.length === 0) return null;
        return (
          <section className="tasks-group" key={key}>
            <h3>{label} <span className="tasks-count">{group.length}</span></h3>
            {group.map((t) => {
              const due = dueLabel(t.due_at);
              const prio = PRIO[t.priority] || PRIO.normal;
              return (
                <div className={`task-item ${t.status === 'done' ? 'is-done' : ''}`} key={t.id}>
                  <button className={`task-check ${t.status === 'done' ? 'on' : ''}`} title="Terminer" onClick={() => onToggle(t)}>
                    {t.status === 'done' ? '✓' : ''}
                  </button>
                  <div className="task-main">
                    <div className="task-title">
                      <span className="task-prio" style={{ background: prio.dot }} title={`Priorité ${prio.label.toLowerCase()}`} />
                      {t.title}
                    </div>
                    <div className="task-meta">
                      {t.assignee_id ? (
                        <span className="task-assignee">
                          <Avatar user={{ display_name: t.assignee_name, avatar_color: t.assignee_color, avatar_url: t.assignee_avatar }} size={18} />
                          {t.assignee_name}
                        </span>
                      ) : <span className="task-unassigned">Sans responsable</span>}
                      {due && <span className={`task-due ${due.overdue && t.status !== 'done' ? 'overdue' : ''}`}>{due.txt}</span>}
                      {t.server_name && <span className="task-src">{t.channel_name ? `#${t.channel_name}` : t.server_name}</span>}
                    </div>
                  </div>
                  <div className="task-actions">
                    <select value={t.status} onChange={(e) => onSetStatus(t, e.target.value)} title="Statut">
                      <option value="todo">À faire</option>
                      <option value="doing">En cours</option>
                      <option value="done">Terminé</option>
                    </select>
                    <button title="Modifier" onClick={() => onEdit(t)}>✏️</button>
                    <button title="Supprimer" onClick={() => onDelete(t)}>🗑️</button>
                  </div>
                </div>
              );
            })}
          </section>
        );
      })}
    </div>
  );
}
