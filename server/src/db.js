import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = process.env.CONCORD_DATA_DIR || path.join(__dirname, '..', 'data');
fs.mkdirSync(dataDir, { recursive: true });

const db = new DatabaseSync(path.join(dataDir, 'concord.db'));
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    username      TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    display_name  TEXT NOT NULL,
    avatar_color  TEXT NOT NULL DEFAULT '#5865F2',
    avatar_url    TEXT,
    about         TEXT DEFAULT '',
    status        TEXT DEFAULT 'online',
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS servers (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT NOT NULL,
    icon_color  TEXT NOT NULL DEFAULT '#5865F2',
    owner_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    invite_code TEXT UNIQUE NOT NULL,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS server_members (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    server_id INTEGER NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
    user_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    joined_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(server_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS channels (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    server_id  INTEGER NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
    name       TEXT NOT NULL,
    type       TEXT NOT NULL DEFAULT 'text',
    position   INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS messages (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    channel_id INTEGER NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content    TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS roles (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    server_id   INTEGER NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    color       TEXT NOT NULL DEFAULT '#99aab5',
    permissions TEXT NOT NULL DEFAULT '[]',
    position    INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS member_roles (
    server_id INTEGER NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
    user_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role_id   INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    PRIMARY KEY (server_id, user_id, role_id)
  );

  CREATE TABLE IF NOT EXISTS dm_messages (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    sender_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    recipient_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content      TEXT NOT NULL,
    created_at   TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS message_reactions (
    message_id INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    emoji      TEXT NOT NULL,
    PRIMARY KEY (message_id, user_id, emoji)
  );

  CREATE INDEX IF NOT EXISTS idx_messages_channel ON messages(channel_id, id);
  CREATE INDEX IF NOT EXISTS idx_members_user ON server_members(user_id);
  CREATE INDEX IF NOT EXISTS idx_member_roles ON member_roles(server_id, user_id);
  CREATE INDEX IF NOT EXISTS idx_dm_pair ON dm_messages(sender_id, recipient_id, id);
  CREATE INDEX IF NOT EXISTS idx_reactions ON message_reactions(message_id);
`);

// --- Migrations légères : ajoute les colonnes manquantes aux bases déjà créées ---
function columnsOf(table) {
  return new Set(db.prepare(`SELECT name FROM pragma_table_info('${table}')`).all().map((r) => r.name));
}
const msgCols = columnsOf('messages');
if (!msgCols.has('edited')) db.exec('ALTER TABLE messages ADD COLUMN edited INTEGER NOT NULL DEFAULT 0');
if (!msgCols.has('attachment_url')) db.exec('ALTER TABLE messages ADD COLUMN attachment_url TEXT');
const dmCols = columnsOf('dm_messages');
if (!dmCols.has('attachment_url')) db.exec('ALTER TABLE dm_messages ADD COLUMN attachment_url TEXT');

/** Exécute une fonction dans une transaction (node:sqlite n'a pas de wrapper natif). */
export function transaction(fn) {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

export default db;
