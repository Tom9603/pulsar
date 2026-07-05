import { Router } from 'express';
import { randomBytes } from 'node:crypto';
import db, { transaction } from '../db.js';
import { authMiddleware, publicUser } from '../auth.js';
import {
  hasPermission,
  memberPermissions,
  isOwner,
  sanitizePermissions,
  canAccessChannel,
} from '../permissions.js';
import { getIO } from '../realtime.js';

const router = Router();
router.use(authMiddleware);

const SERVER_COLORS = ['#5865F2', '#EB459E', '#57F287', '#FAA61A', '#ED4245', '#3498DB', '#9B59B6'];
const randomColor = () => SERVER_COLORS[Math.floor(Math.random() * SERVER_COLORS.length)];
const genInvite = () => randomBytes(4).toString('hex');

function isMember(serverId, userId) {
  return !!db.prepare('SELECT 1 FROM server_members WHERE server_id = ? AND user_id = ?').get(serverId, userId);
}

/** Prévient les membres connectés qu'un serveur a changé (rôles, membres…). */
function notifyServerUpdate(serverId) {
  getIO()?.to('server:' + serverId).emit('server:updated', { serverId: Number(serverId) });
}

function parseRole(r) {
  return { ...r, permissions: safeParse(r.permissions) };
}
function safeParse(json) {
  try {
    return JSON.parse(json);
  } catch {
    return [];
  }
}

/** Liste des serveurs dont l'utilisateur est membre. */
router.get('/', (req, res) => {
  const servers = db.prepare(`
    SELECT s.* FROM servers s
    JOIN server_members m ON m.server_id = s.id
    WHERE m.user_id = ?
    ORDER BY m.joined_at ASC
  `).all(req.userId);
  res.json({ servers });
});

/** Création d'un serveur (avec salons par défaut) — le créateur en devient membre & propriétaire. */
router.post('/', (req, res) => {
  const name = (req.body?.name || '').trim();
  if (!name) return res.status(400).json({ error: 'Le nom du serveur est requis' });

  const serverId = transaction(() => {
    const info = db.prepare(
      'INSERT INTO servers (name, icon_color, owner_id, invite_code) VALUES (?, ?, ?, ?)'
    ).run(name, randomColor(), req.userId, genInvite());
    const id = info.lastInsertRowid;
    db.prepare('INSERT INTO server_members (server_id, user_id) VALUES (?, ?)').run(id, req.userId);
    db.prepare('INSERT INTO channels (server_id, name, type, position) VALUES (?, ?, ?, ?)').run(id, 'général', 'text', 0);
    db.prepare('INSERT INTO channels (server_id, name, type, position) VALUES (?, ?, ?, ?)').run(id, 'hors-sujet', 'text', 1);
    db.prepare('INSERT INTO channels (server_id, name, type, position) VALUES (?, ?, ?, ?)').run(id, 'Salon vocal', 'voice', 2);
    return id;
  });

  const server = db.prepare('SELECT * FROM servers WHERE id = ?').get(serverId);
  res.json({ server });
});

/** Rejoindre un serveur via son code d'invitation. */
router.post('/join', (req, res) => {
  const code = (req.body?.invite_code || '').trim().toLowerCase();
  if (!code) return res.status(400).json({ error: 'Code d’invitation requis' });
  const server = db.prepare('SELECT * FROM servers WHERE invite_code = ?').get(code);
  if (!server) return res.status(404).json({ error: 'Invitation invalide ou expirée' });
  if (!isMember(server.id, req.userId)) {
    db.prepare('INSERT INTO server_members (server_id, user_id) VALUES (?, ?)').run(server.id, req.userId);
    notifyServerUpdate(server.id);
  }
  res.json({ server });
});

/** Détail d'un serveur : infos + salons + membres (avec rôles) + rôles + mes permissions. */
router.get('/:id', (req, res) => {
  const server = db.prepare('SELECT * FROM servers WHERE id = ?').get(req.params.id);
  if (!server) return res.status(404).json({ error: 'Serveur introuvable' });
  if (!isMember(server.id, req.userId)) return res.status(403).json({ error: 'Vous n’êtes pas membre de ce serveur' });

  const allChannels = db.prepare(
    "SELECT * FROM channels WHERE server_id = ? ORDER BY (type = 'voice') ASC, position ASC, id ASC"
  ).all(server.id);

  // Salons privés (« espaces clients ») : masqués à qui n'y a pas accès.
  const channels = allChannels.filter((c) => !c.private || canAccessChannel(c.id, req.userId));
  for (const c of channels) {
    if (c.private) {
      c.member_ids = db.prepare('SELECT user_id FROM channel_members WHERE channel_id = ?').all(c.id).map((r) => r.user_id);
    }
  }

  // Non-lus + mentions par salon textuel
  const me = db.prepare('SELECT username FROM users WHERE id = ?').get(req.userId);
  const mentionLike = '%@' + me.username + '%';
  for (const c of channels) {
    if (c.type !== 'text') continue;
    const lastRead = db.prepare('SELECT last_read_id FROM channel_reads WHERE user_id = ? AND channel_id = ?')
      .get(req.userId, c.id)?.last_read_id || 0;
    c.unread = !!db.prepare('SELECT 1 FROM messages WHERE channel_id = ? AND id > ? AND user_id != ? LIMIT 1')
      .get(c.id, lastRead, req.userId);
    c.mentions = db.prepare('SELECT COUNT(*) AS n FROM messages WHERE channel_id = ? AND id > ? AND user_id != ? AND content LIKE ?')
      .get(c.id, lastRead, req.userId, mentionLike).n;
  }

  const categories = db.prepare('SELECT * FROM categories WHERE server_id = ? ORDER BY position ASC, id ASC').all(server.id);

  const roles = db.prepare('SELECT * FROM roles WHERE server_id = ? ORDER BY position DESC, id ASC')
    .all(server.id)
    .map(parseRole);

  // rôles par membre
  const rolesByUser = {};
  for (const mr of db.prepare('SELECT user_id, role_id FROM member_roles WHERE server_id = ?').all(server.id)) {
    (rolesByUser[mr.user_id] ||= []).push(mr.role_id);
  }

  const members = db.prepare(`
    SELECT u.* FROM users u
    JOIN server_members m ON m.user_id = u.id
    WHERE m.server_id = ?
    ORDER BY u.display_name COLLATE NOCASE ASC
  `).all(server.id).map((u) => ({ ...publicUser(u), role_ids: rolesByUser[u.id] || [] }));

  res.json({
    server,
    channels,
    categories,
    roles,
    members,
    is_owner: server.owner_id === req.userId,
    my_permissions: Array.from(memberPermissions(server.id, req.userId)),
  });
});

/** Recherche de messages dans les salons d'un serveur. */
router.get('/:id/search', (req, res) => {
  const server = db.prepare('SELECT * FROM servers WHERE id = ?').get(req.params.id);
  if (!server) return res.status(404).json({ error: 'Serveur introuvable' });
  if (!isMember(server.id, req.userId)) return res.status(403).json({ error: 'Non membre' });
  const q = (req.query.q || '').toString().trim();
  if (q.length < 2) return res.json({ results: [] });

  const results = db.prepare(`
    SELECT m.id, m.content, m.created_at, m.channel_id, c.name AS channel_name,
           u.display_name, u.avatar_color, u.avatar_url, u.username
    FROM messages m
    JOIN channels c ON c.id = m.channel_id
    JOIN users u ON u.id = m.user_id
    WHERE c.server_id = ? AND m.content LIKE ?
    ORDER BY m.id DESC LIMIT 50
  `).all(server.id, '%' + q + '%');
  res.json({ results });
});

/** Renommer le serveur / changer son icône (permission « Modifier le serveur »). */
router.patch('/:id', (req, res) => {
  const server = db.prepare('SELECT * FROM servers WHERE id = ?').get(req.params.id);
  if (!server) return res.status(404).json({ error: 'Serveur introuvable' });
  if (!hasPermission(server.id, req.userId, 'MANAGE_SERVER')) {
    return res.status(403).json({ error: 'Permission « Modifier le serveur » requise' });
  }
  const name = (req.body?.name ?? '').toString().trim() || server.name;
  const iconUrl = req.body?.icon_url === undefined ? server.icon_url : (req.body.icon_url || null);
  db.prepare('UPDATE servers SET name = ?, icon_url = ? WHERE id = ?').run(name, iconUrl, server.id);
  notifyServerUpdate(server.id);
  res.json({ server: db.prepare('SELECT * FROM servers WHERE id = ?').get(server.id) });
});

// ---- Catégories de salons ----
function requireManageChannels(req, res, next) {
  const server = db.prepare('SELECT * FROM servers WHERE id = ?').get(req.params.id);
  if (!server) return res.status(404).json({ error: 'Serveur introuvable' });
  if (!hasPermission(server.id, req.userId, 'MANAGE_CHANNELS')) {
    return res.status(403).json({ error: 'Permission « Gérer les salons » requise' });
  }
  req.server = server;
  next();
}

router.post('/:id/categories', requireManageChannels, (req, res) => {
  const name = (req.body?.name || '').trim();
  if (!name) return res.status(400).json({ error: 'Nom de catégorie requis' });
  const row = db.prepare('SELECT MAX(position) AS m FROM categories WHERE server_id = ?').get(req.server.id);
  db.prepare('INSERT INTO categories (server_id, name, position) VALUES (?, ?, ?)').run(req.server.id, name, (row.m ?? 0) + 1);
  notifyServerUpdate(req.server.id);
  res.json({ ok: true });
});

router.delete('/:id/categories/:categoryId', requireManageChannels, (req, res) => {
  db.prepare('UPDATE channels SET category_id = NULL WHERE category_id = ?').run(req.params.categoryId);
  db.prepare('DELETE FROM categories WHERE id = ? AND server_id = ?').run(req.params.categoryId, req.server.id);
  notifyServerUpdate(req.server.id);
  res.json({ ok: true });
});

/** Modifier un salon : catégorie, nom, étiquette projet/client, accès privé. */
router.patch('/:id/channels/:channelId', requireManageChannels, (req, res) => {
  const channel = db.prepare('SELECT * FROM channels WHERE id = ? AND server_id = ?').get(req.params.channelId, req.server.id);
  if (!channel) return res.status(404).json({ error: 'Salon introuvable' });
  const catId = req.body?.category_id === undefined ? channel.category_id : (req.body.category_id || null);
  const name = (req.body?.name ?? '').toString().trim() || channel.name;
  const clientLabel = req.body?.client_label === undefined
    ? channel.client_label
    : ((req.body.client_label || '').toString().trim().slice(0, 80) || null);
  const isPrivate = req.body?.private === undefined ? channel.private : (req.body.private ? 1 : 0);
  db.prepare('UPDATE channels SET category_id = ?, name = ?, client_label = ?, private = ? WHERE id = ?')
    .run(catId, name, clientLabel, isPrivate, channel.id);
  // Passage en privé : garantir que le gestionnaire courant reste membre.
  if (isPrivate && !channel.private) {
    db.prepare('INSERT OR IGNORE INTO channel_members (channel_id, user_id) VALUES (?, ?)').run(channel.id, req.userId);
  }
  notifyServerUpdate(req.server.id);
  res.json({ ok: true });
});

/** Inviter un membre dans un espace privé (salon client). */
router.post('/:id/channels/:channelId/members', requireManageChannels, (req, res) => {
  const channel = db.prepare('SELECT * FROM channels WHERE id = ? AND server_id = ?').get(req.params.channelId, req.server.id);
  if (!channel) return res.status(404).json({ error: 'Salon introuvable' });
  const targetId = Number(req.body?.userId);
  if (!isMember(req.server.id, targetId)) return res.status(400).json({ error: 'Cette personne n’est pas membre du serveur' });
  db.prepare('INSERT OR IGNORE INTO channel_members (channel_id, user_id) VALUES (?, ?)').run(channel.id, targetId);
  notifyServerUpdate(req.server.id);
  res.json({ ok: true });
});

/** Retirer un membre d'un espace privé. */
router.delete('/:id/channels/:channelId/members/:userId', requireManageChannels, (req, res) => {
  const channel = db.prepare('SELECT * FROM channels WHERE id = ? AND server_id = ?').get(req.params.channelId, req.server.id);
  if (!channel) return res.status(404).json({ error: 'Salon introuvable' });
  db.prepare('DELETE FROM channel_members WHERE channel_id = ? AND user_id = ?').run(channel.id, Number(req.params.userId));
  notifyServerUpdate(req.server.id);
  res.json({ ok: true });
});

/** Création d'un salon (propriétaire ou permission « Gérer les salons »). */
router.post('/:id/channels', (req, res) => {
  const server = db.prepare('SELECT * FROM servers WHERE id = ?').get(req.params.id);
  if (!server) return res.status(404).json({ error: 'Serveur introuvable' });
  if (!hasPermission(server.id, req.userId, 'MANAGE_CHANNELS')) {
    return res.status(403).json({ error: 'Permission « Gérer les salons » requise' });
  }

  const name = (req.body?.name || '').trim();
  const type = req.body?.type === 'voice' ? 'voice' : 'text';
  if (!name) return res.status(400).json({ error: 'Le nom du salon est requis' });

  const isPrivate = req.body?.private ? 1 : 0;
  const clientLabel = (req.body?.client_label || '').toString().trim().slice(0, 80) || null;

  const row = db.prepare('SELECT MAX(position) AS max FROM channels WHERE server_id = ?').get(server.id);
  const info = db.prepare(
    'INSERT INTO channels (server_id, name, type, position, private, client_label) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(server.id, name, type, (row.max ?? 0) + 1, isPrivate, clientLabel);

  // Membres invités dans l'espace privé (le créateur est ajouté d'office).
  if (isPrivate) {
    const ids = new Set([req.userId, ...(Array.isArray(req.body?.member_ids) ? req.body.member_ids.map(Number) : [])]);
    const add = db.prepare('INSERT OR IGNORE INTO channel_members (channel_id, user_id) VALUES (?, ?)');
    for (const uid of ids) if (isMember(server.id, uid)) add.run(info.lastInsertRowid, uid);
  }

  const channel = db.prepare('SELECT * FROM channels WHERE id = ?').get(info.lastInsertRowid);
  notifyServerUpdate(server.id);
  res.json({ channel });
});

/** Suppression d'un serveur (réservé au propriétaire). */
router.delete('/:id', (req, res) => {
  const server = db.prepare('SELECT * FROM servers WHERE id = ?').get(req.params.id);
  if (!server) return res.status(404).json({ error: 'Serveur introuvable' });
  if (server.owner_id !== req.userId) return res.status(403).json({ error: 'Action réservée au propriétaire du serveur' });
  db.prepare('DELETE FROM servers WHERE id = ?').run(server.id);
  res.json({ ok: true });
});

/** Quitter un serveur (le propriétaire ne peut pas, il doit le supprimer). */
router.post('/:id/leave', (req, res) => {
  const server = db.prepare('SELECT * FROM servers WHERE id = ?').get(req.params.id);
  if (!server) return res.status(404).json({ error: 'Serveur introuvable' });
  if (server.owner_id === req.userId) return res.status(400).json({ error: 'Le propriétaire doit supprimer le serveur' });
  db.prepare('DELETE FROM server_members WHERE server_id = ? AND user_id = ?').run(server.id, req.userId);
  notifyServerUpdate(server.id);
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Rôles
// ---------------------------------------------------------------------------

function requireManageRoles(req, res, next) {
  const server = db.prepare('SELECT * FROM servers WHERE id = ?').get(req.params.id);
  if (!server) return res.status(404).json({ error: 'Serveur introuvable' });
  if (!hasPermission(server.id, req.userId, 'MANAGE_ROLES')) {
    return res.status(403).json({ error: 'Permission « Gérer les rôles » requise' });
  }
  req.server = server;
  next();
}

/** Créer un rôle. */
router.post('/:id/roles', requireManageRoles, (req, res) => {
  const name = (req.body?.name || '').trim();
  if (!name) return res.status(400).json({ error: 'Le nom du rôle est requis' });
  const color = /^#[0-9a-fA-F]{6}$/.test(req.body?.color || '') ? req.body.color : '#99aab5';
  const permissions = JSON.stringify(sanitizePermissions(req.body?.permissions));

  const row = db.prepare('SELECT MAX(position) AS max FROM roles WHERE server_id = ?').get(req.server.id);
  const info = db.prepare(
    'INSERT INTO roles (server_id, name, color, permissions, position) VALUES (?, ?, ?, ?, ?)'
  ).run(req.server.id, name, color, permissions, (row.max ?? 0) + 1);

  const role = parseRole(db.prepare('SELECT * FROM roles WHERE id = ?').get(info.lastInsertRowid));
  notifyServerUpdate(req.server.id);
  res.json({ role });
});

/** Modifier un rôle. */
router.patch('/:id/roles/:roleId', requireManageRoles, (req, res) => {
  const role = db.prepare('SELECT * FROM roles WHERE id = ? AND server_id = ?').get(req.params.roleId, req.server.id);
  if (!role) return res.status(404).json({ error: 'Rôle introuvable' });

  const name = (req.body?.name ?? role.name).toString().trim() || role.name;
  const color = /^#[0-9a-fA-F]{6}$/.test(req.body?.color || '') ? req.body.color : role.color;
  const permissions = req.body?.permissions === undefined
    ? role.permissions
    : JSON.stringify(sanitizePermissions(req.body.permissions));

  db.prepare('UPDATE roles SET name = ?, color = ?, permissions = ? WHERE id = ?')
    .run(name, color, permissions, role.id);

  notifyServerUpdate(req.server.id);
  res.json({ role: parseRole(db.prepare('SELECT * FROM roles WHERE id = ?').get(role.id)) });
});

/** Supprimer un rôle. */
router.delete('/:id/roles/:roleId', requireManageRoles, (req, res) => {
  const role = db.prepare('SELECT * FROM roles WHERE id = ? AND server_id = ?').get(req.params.roleId, req.server.id);
  if (!role) return res.status(404).json({ error: 'Rôle introuvable' });
  db.prepare('DELETE FROM roles WHERE id = ?').run(role.id);
  notifyServerUpdate(req.server.id);
  res.json({ ok: true });
});

/** Attribuer un rôle à un membre. */
router.post('/:id/members/:userId/roles', requireManageRoles, (req, res) => {
  const targetId = Number(req.params.userId);
  if (!isMember(req.server.id, targetId)) return res.status(404).json({ error: 'Membre introuvable' });
  const role = db.prepare('SELECT * FROM roles WHERE id = ? AND server_id = ?').get(req.body?.roleId, req.server.id);
  if (!role) return res.status(404).json({ error: 'Rôle introuvable' });

  db.prepare('INSERT OR IGNORE INTO member_roles (server_id, user_id, role_id) VALUES (?, ?, ?)')
    .run(req.server.id, targetId, role.id);
  notifyServerUpdate(req.server.id);
  res.json({ ok: true });
});

/** Retirer un rôle à un membre. */
router.delete('/:id/members/:userId/roles/:roleId', requireManageRoles, (req, res) => {
  db.prepare('DELETE FROM member_roles WHERE server_id = ? AND user_id = ? AND role_id = ?')
    .run(req.server.id, Number(req.params.userId), Number(req.params.roleId));
  notifyServerUpdate(req.server.id);
  res.json({ ok: true });
});

/** Expulser un membre (permission « Expulser des membres »). */
router.delete('/:id/members/:userId', (req, res) => {
  const server = db.prepare('SELECT * FROM servers WHERE id = ?').get(req.params.id);
  if (!server) return res.status(404).json({ error: 'Serveur introuvable' });
  if (!hasPermission(server.id, req.userId, 'KICK_MEMBERS')) {
    return res.status(403).json({ error: 'Permission « Expulser des membres » requise' });
  }
  const targetId = Number(req.params.userId);
  if (targetId === server.owner_id) return res.status(400).json({ error: 'Impossible d’expulser le propriétaire' });
  if (targetId === req.userId) return res.status(400).json({ error: 'Utilise « Quitter le serveur »' });

  db.prepare('DELETE FROM server_members WHERE server_id = ? AND user_id = ?').run(server.id, targetId);
  db.prepare('DELETE FROM member_roles WHERE server_id = ? AND user_id = ?').run(server.id, targetId);
  getIO()?.to('user:' + targetId).emit('server:kicked', { serverId: server.id });
  notifyServerUpdate(server.id);
  res.json({ ok: true });
});

export default router;
