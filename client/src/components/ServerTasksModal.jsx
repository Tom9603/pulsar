import { useEffect, useState } from 'react';
import Modal from './Modal.jsx';
import Avatar from './Avatar.jsx';
import Icon from './Icon.jsx';
import { api } from '../api.js';

const STATUS = { todo: { label: 'À faire', color: 'var(--text-muted)' }, doing: { label: 'En cours', color: '#f0b232' }, done: { label: 'Terminé', color: '#4ade80' } };

function dueLabel(epoch) {
  if (!epoch) return null;
  const overdue = epoch * 1000 < Date.now();
  return { txt: new Date(epoch * 1000).toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }), overdue };
}

/** Tableau des tâches d'un serveur (visible par tout membre). Clic = détail. */
export default function ServerTasksModal({ serverId, serverName, onOpenTask, onClose }) {
  const [tasks, setTasks] = useState(null);
  const [filter, setFilter] = useState('open');

  useEffect(() => { api(`/tasks/server/${serverId}`).then(({ tasks }) => setTasks(tasks)).catch(() => setTasks([])); }, [serverId]);

  const shown = (tasks || []).filter((t) => (filter === 'open' ? t.status !== 'done' : filter === 'done' ? t.status === 'done' : true));

  return (
    <Modal onClose={onClose} className="modal-server-tasks">
      <h2><Icon name="list-check" /> Tâches · {serverName}</h2>
      <p className="modal-sub">Toutes les tâches attribuées dans ce serveur.</p>
      <div className="seg" style={{ marginBottom: 12 }}>
        <button className={filter === 'open' ? 'active' : ''} onClick={() => setFilter('open')}>En cours</button>
        <button className={filter === 'done' ? 'active' : ''} onClick={() => setFilter('done')}>Terminées</button>
        <button className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>Toutes</button>
      </div>

      <div className="server-tasks-list">
        {tasks === null && <div className="contact-empty">Chargement…</div>}
        {tasks && shown.length === 0 && <div className="contact-empty">Aucune tâche.</div>}
        {shown.map((t) => {
          const due = dueLabel(t.due_at);
          return (
            <button key={t.id} className={`server-task-row ${t.status === 'done' ? 'is-done' : ''}`} onClick={() => onOpenTask(t)}>
              <span className="st-status" style={{ background: STATUS[t.status]?.color }} title={STATUS[t.status]?.label} />
              <div className="st-main">
                <div className="st-title">{t.title}</div>
                <div className="st-meta">
                  {t.assignee_id ? (
                    <span className="st-assignee"><Avatar user={{ display_name: t.assignee_name, avatar_color: t.assignee_color, avatar_url: t.assignee_avatar }} size={18} /> {t.assignee_name}</span>
                  ) : <span className="st-unassigned">Sans responsable</span>}
                  <span className="st-by">par {t.creator_name}</span>
                  {due && <span className={`st-due ${due.overdue && t.status !== 'done' ? 'overdue' : ''}`}>{due.txt}</span>}
                  {t.channel_name && <span className="st-chan">{t.channel_name}</span>}
                </div>
              </div>
              <span className="st-badge">{STATUS[t.status]?.label}</span>
            </button>
          );
        })}
      </div>

      <div className="modal-actions"><button className="btn" onClick={onClose}>Fermer</button></div>
    </Modal>
  );
}
