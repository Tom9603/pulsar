import { useState } from 'react';
import TasksPanel from './TasksPanel.jsx';
import SavedPanel from './SavedPanel.jsx';

/** Centre « À faire » : un seul endroit pour les tâches et les rappels en attente d'action. */
export default function ActionCenter({ currentUser, tasks, taskFilter, onTaskFilter, onToggleTask, onSetTaskStatus, onEditTask, onDeleteTask, onNewTask }) {
  const [tab, setTab] = useState('tasks');
  const openTasks = tasks.filter((t) => t.status !== 'done' && t.assignee_id === currentUser.id).length;

  return (
    <div className="main-content">
      <div className="content-header">
        <span>✅ À faire</span>
        <div className="ac-tabs">
          <button className={tab === 'tasks' ? 'active' : ''} onClick={() => setTab('tasks')}>
            Tâches{openTasks ? <span className="ac-badge">{openTasks}</span> : null}
          </button>
          <button className={tab === 'reminders' ? 'active' : ''} onClick={() => setTab('reminders')}>Rappels</button>
        </div>
      </div>
      {tab === 'tasks' ? (
        <div className="ac-body">
          <TasksPanel
            tasks={tasks} currentUser={currentUser} filter={taskFilter} onFilter={onTaskFilter}
            onToggle={onToggleTask} onSetStatus={onSetTaskStatus} onEdit={onEditTask} onDelete={onDeleteTask} onNew={onNewTask}
          />
        </div>
      ) : (
        <SavedPanel currentUser={currentUser} embedded />
      )}
    </div>
  );
}
