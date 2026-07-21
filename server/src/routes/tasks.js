import { Router } from 'express';
import db from '../db.js';
import { authMiddleware, publicUser } from '../auth.js';
import { hasPermission, isOwner } from '../permissions.js';
import { getIO } from '../realtime.js';

const router = Router();
router.use(authMiddleware);

const STATUSES = ['todo', 'doing', 'done'];
const PRIORITIES = ['low', 'normal', 'high'];

/** Tâche enrichie : responsable, créateur, serveur, salon. */
function taskRow(id) {
  const t = db.prepare(`
    SELECT t.*,
           cu.display_name AS creator_name,
           au.display_name AS assignee_name, au.avatar_color AS assignee_color, au.avatar_url AS assignee_avatar,
           s.name AS server_name, s.icon_url AS server_icon, s.icon_color AS server_color,
           c.name AS channel_name
    FROM tasks t
    JOIN users cu ON cu.id = t.creator_id
    LEFT JOIN users au ON au.id = t.assignee_id
    LEFT JOIN servers s ON s.id = t.server_id
    LEFT JOIN channels c ON c.id = t.channel_id
    WHERE t.id = ?
  `).get(id);
  return t || null;
}

const isMember = (serverId, userId) =>
  !!db.prepare('SELECT 1 FROM server_members WHERE server_id = ? AND user_id = ?').get(serverId, userId);

/** Le créateur peut-il attribuer une tâche à `targetId` ? (soi-même toujours ; sinon rôle « Attribuer des tâches »). */
function canAssignTo(creatorId, targetId, serverId) {
  if (!targetId || targetId === creatorId) return true;
  if (serverId) {
    return isMember(serverId, targetId) && (isOwner(serverId, creatorId) || hasPermission(serverId, creatorId, 'ASSIGN_TASKS'));
  }
  // Tâche hors serveur (ex. depuis un message privé) : autorisé si on partage un serveur où j'ai le droit d'attribuer.
  const shared = db.prepare(`
    SELECT a.server_id FROM server_members a
    JOIN server_members b ON a.server_id = b.server_id
    WHERE a.user_id = ? AND b.user_id = ?
  `).all(creatorId, targetId);
  return shared.some((r) => isOwner(r.server_id, creatorId) || hasPermission(r.server_id, creatorId, 'ASSIGN_TASKS'));
}

/** Puis-je attribuer une tâche à cet utilisateur (contexte hors serveur, ex. DM) ? */
const canAssignRoute = (req, res) => res.json({ can_assign: canAssignTo(req.userId, Number(req.params.userId), null) });

/** Peut-on voir / toucher cette tâche ? Créateur, responsable, ou gestionnaire du serveur. */
function canTouch(task, userId) {
  if (task.creator_id === userId || task.assignee_id === userId) return true;
  if (task.server_id && (isOwner(task.server_id, userId) || hasPermission(task.server_id, userId, 'MANAGE_CHANNELS'))) return true;
  return false;
}

/** Prévient les personnes concernées (créateur, responsable, serveur) qu'une tâche a changé. */
function emitTask(task, type) {
  const io = getIO();
  if (!io || !task) return;
  const targets = new Set();
  if (task.creator_id) targets.add('user:' + task.creator_id);
  if (task.assignee_id) targets.add('user:' + task.assignee_id);
  if (task.server_id) targets.add('server:' + task.server_id);
  for (const room of targets) io.to(room).emit('task:changed', { type, task });
}

/** Mes tâches : celles que l'on m'a assignées, celles que j'ai créées. */
router.get('/', (req, res) => {
  const tasks = db.prepare(`
    SELECT t.*,
           cu.display_name AS creator_name,
           au.display_name AS assignee_name, au.avatar_color AS assignee_color, au.avatar_url AS assignee_avatar,
           s.name AS server_name, s.icon_url AS server_icon, s.icon_color AS server_color,
           c.name AS channel_name
    FROM tasks t
    JOIN users cu ON cu.id = t.creator_id
    LEFT JOIN users au ON au.id = t.assignee_id
    LEFT JOIN servers s ON s.id = t.server_id
    LEFT JOIN channels c ON c.id = t.channel_id
    WHERE t.assignee_id = ? OR t.creator_id = ?
    ORDER BY (t.status = 'done') ASC,
             (t.due_at IS NULL) ASC, t.due_at ASC,
             t.id DESC
  `).all(req.userId, req.userId);
  res.json({ tasks });
});

/** Tâches d'un serveur (tableau d'équipe). */
router.get('/server/:serverId', (req, res) => {
  if (!isMember(req.params.serverId, req.userId)) return res.status(403).json({ error: 'Non membre' });
  const tasks = db.prepare(`
    SELECT t.*,
           cu.display_name AS creator_name,
           au.display_name AS assignee_name, au.avatar_color AS assignee_color, au.avatar_url AS assignee_avatar,
           c.name AS channel_name
    FROM tasks t
    JOIN users cu ON cu.id = t.creator_id
    LEFT JOIN users au ON au.id = t.assignee_id
    LEFT JOIN channels c ON c.id = t.channel_id
    WHERE t.server_id = ?
    ORDER BY (t.status = 'done') ASC, (t.due_at IS NULL) ASC, t.due_at ASC, t.id DESC
  `).all(req.params.serverId);
  res.json({ tasks });
});

router.get('/can-assign/:userId', canAssignRoute);

/** Créer une tâche (éventuellement depuis un message). */
router.post('/', (req, res) => {
  const b = req.body || {};
  const title = (b.title || '').toString().trim().slice(0, 200);
  if (!title) return res.status(400).json({ error: 'Un intitulé est requis' });

  const description = (b.description || '').toString().slice(0, 2000);
  const priority = PRIORITIES.includes(b.priority) ? b.priority : 'normal';
  const dueAt = Number.isFinite(b.due_at) && b.due_at > 0 ? Math.floor(b.due_at) : null;

  let serverId = null;
  let channelId = null;
  if (b.server_id) {
    if (!isMember(b.server_id, req.userId)) return res.status(403).json({ error: 'Non membre de ce serveur' });
    serverId = Number(b.server_id);
    if (b.channel_id) {
      const ch = db.prepare('SELECT id FROM channels WHERE id = ? AND server_id = ?').get(b.channel_id, serverId);
      if (ch) channelId = ch.id;
    }
  }

  let assigneeId = null;
  if (b.assignee_id) {
    const target = Number(b.assignee_id);
    if (canAssignTo(req.userId, target, serverId)) assigneeId = target;
    else return res.status(403).json({ error: 'Vous n’avez pas le droit d’attribuer une tâche à cette personne (rôle « Attribuer des tâches » requis).' });
  }

  const info = db.prepare(`
    INSERT INTO tasks (server_id, channel_id, creator_id, assignee_id, title, description, priority, due_at, source_message_id, source_label)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(serverId, channelId, req.userId, assigneeId, title, description, priority, dueAt,
    b.source_message_id || null, (b.source_label || '').toString().slice(0, 120) || null);

  const task = taskRow(info.lastInsertRowid);
  emitTask(task, 'created');
  res.json({ task });
});

/** Modifier une tâche (statut, responsable, échéance, priorité, intitulé, description). */
router.patch('/:id', (req, res) => {
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
  if (!task) return res.status(404).json({ error: 'Tâche introuvable' });
  if (!canTouch(task, req.userId)) return res.status(403).json({ error: 'Action non autorisée' });

  const b = req.body || {};
  const title = b.title === undefined ? task.title : (b.title.toString().trim().slice(0, 200) || task.title);
  const description = b.description === undefined ? task.description : b.description.toString().slice(0, 2000);
  const priority = PRIORITIES.includes(b.priority) ? b.priority : task.priority;
  const status = STATUSES.includes(b.status) ? b.status : task.status;
  const dueAt = b.due_at === undefined ? task.due_at : (Number.isFinite(b.due_at) && b.due_at > 0 ? Math.floor(b.due_at) : null);

  let assigneeId = task.assignee_id;
  if (b.assignee_id !== undefined) {
    if (!b.assignee_id) assigneeId = null;
    else {
      const target = Number(b.assignee_id);
      if (canAssignTo(req.userId, target, task.server_id)) assigneeId = target;
      else return res.status(403).json({ error: 'Vous n’avez pas le droit d’attribuer cette tâche à cette personne.' });
    }
  }

  const doneAt = status === 'done' ? (task.done_at || new Date().toISOString()) : null;
  // Si on repousse l'échéance, on réarme la notification pour la nouvelle date.
  const dueNotified = dueAt !== task.due_at ? 0 : task.due_notified;

  db.prepare(`
    UPDATE tasks SET title = ?, description = ?, priority = ?, status = ?, due_at = ?, assignee_id = ?, done_at = ?, due_notified = ?
    WHERE id = ?
  `).run(title, description, priority, status, dueAt, assigneeId, doneAt, dueNotified, task.id);

  const updated = taskRow(task.id);
  emitTask({ ...updated, creator_id: task.creator_id, assignee_id: task.assignee_id, server_id: task.server_id }, 'updated'); // prévient aussi l'ancien responsable
  emitTask(updated, 'updated');
  res.json({ task: updated });
});

/** Supprimer une tâche (créateur ou gestionnaire du serveur). */
router.delete('/:id', (req, res) => {
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
  if (!task) return res.status(404).json({ error: 'Tâche introuvable' });
  const allowed = task.creator_id === req.userId ||
    (task.server_id && (isOwner(task.server_id, req.userId) || hasPermission(task.server_id, req.userId, 'MANAGE_CHANNELS')));
  if (!allowed) return res.status(403).json({ error: 'Action non autorisée' });
  db.prepare('DELETE FROM tasks WHERE id = ?').run(task.id);
  emitTask(task, 'deleted');
  res.json({ ok: true });
});

export default router;
