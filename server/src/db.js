import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = process.env.PULSAR_DATA_DIR || process.env.CONCORD_DATA_DIR || path.join(__dirname, '..', 'data');
fs.mkdirSync(dataDir, { recursive: true });

// Migration du nom de fichier historique (concord.db → pulsar.db) sans perte de données.
const dbPath = path.join(dataDir, 'pulsar.db');
const legacyPath = path.join(dataDir, 'concord.db');
if (!fs.existsSync(dbPath) && fs.existsSync(legacyPath)) {
  for (const suffix of ['', '-wal', '-shm']) {
    if (fs.existsSync(legacyPath + suffix)) fs.renameSync(legacyPath + suffix, dbPath + suffix);
  }
}

const db = new DatabaseSync(dbPath);
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

  CREATE TABLE IF NOT EXISTS categories (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    server_id  INTEGER NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
    name       TEXT NOT NULL,
    position   INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS channel_reads (
    user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    channel_id   INTEGER NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    last_read_id INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, channel_id)
  );

  CREATE TABLE IF NOT EXISTS friendships (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    requester_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    addressee_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status       TEXT NOT NULL DEFAULT 'pending',
    created_at   TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (requester_id, addressee_id)
  );

  CREATE TABLE IF NOT EXISTS blocks (
    blocker_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    blocked_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    PRIMARY KEY (blocker_id, blocked_id)
  );

  CREATE TABLE IF NOT EXISTS saved_messages (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content        TEXT DEFAULT '',
    attachment_url TEXT,
    author_name    TEXT,
    source         TEXT,
    remind_at      INTEGER,
    notified       INTEGER NOT NULL DEFAULT 0,
    created_at     TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS quick_messages (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    text       TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS sounds (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    server_id  INTEGER NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
    name       TEXT NOT NULL,
    url        TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS tasks (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    server_id         INTEGER REFERENCES servers(id) ON DELETE CASCADE,
    channel_id        INTEGER REFERENCES channels(id) ON DELETE SET NULL,
    creator_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    assignee_id       INTEGER REFERENCES users(id) ON DELETE SET NULL,
    title             TEXT NOT NULL,
    description       TEXT DEFAULT '',
    status            TEXT NOT NULL DEFAULT 'todo',
    priority          TEXT NOT NULL DEFAULT 'normal',
    due_at            INTEGER,
    source_message_id INTEGER,
    source_label      TEXT,
    created_at        TEXT NOT NULL DEFAULT (datetime('now')),
    done_at           TEXT
  );

  CREATE TABLE IF NOT EXISTS channel_members (
    channel_id INTEGER NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    PRIMARY KEY (channel_id, user_id)
  );

  CREATE INDEX IF NOT EXISTS idx_messages_channel ON messages(channel_id, id);
  CREATE INDEX IF NOT EXISTS idx_members_user ON server_members(user_id);
  CREATE INDEX IF NOT EXISTS idx_member_roles ON member_roles(server_id, user_id);
  CREATE INDEX IF NOT EXISTS idx_dm_pair ON dm_messages(sender_id, recipient_id, id);
  CREATE INDEX IF NOT EXISTS idx_reactions ON message_reactions(message_id);
  CREATE INDEX IF NOT EXISTS idx_friendships ON friendships(addressee_id, status);
  CREATE INDEX IF NOT EXISTS idx_tasks_assignee ON tasks(assignee_id, status);
  CREATE INDEX IF NOT EXISTS idx_tasks_server ON tasks(server_id);
  CREATE INDEX IF NOT EXISTS idx_channel_members ON channel_members(channel_id);
`);

// --- Migrations légères : ajoute les colonnes manquantes aux bases déjà créées ---
function columnsOf(table) {
  return new Set(db.prepare(`SELECT name FROM pragma_table_info('${table}')`).all().map((r) => r.name));
}
function ensure(table, col, def) {
  if (!columnsOf(table).has(col)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`);
}
ensure('messages', 'edited', 'INTEGER NOT NULL DEFAULT 0');
ensure('messages', 'attachment_url', 'TEXT');
ensure('messages', 'attachment_name', 'TEXT');
ensure('messages', 'reply_to_id', 'INTEGER');
ensure('messages', 'pinned', 'INTEGER NOT NULL DEFAULT 0');
ensure('dm_messages', 'attachment_url', 'TEXT');
ensure('dm_messages', 'attachment_name', 'TEXT');
ensure('channels', 'category_id', 'INTEGER');
ensure('channels', 'client_label', 'TEXT');            // projet / client rattaché au salon
ensure('channels', 'private', 'INTEGER NOT NULL DEFAULT 0'); // salon restreint (espace client)
ensure('servers', 'icon_url', 'TEXT');

// Fiche professionnelle enrichie (profil)
ensure('users', 'headline', 'TEXT');      // poste / intitulé ("Développeuse web", "Gérant")
ensure('users', 'company', 'TEXT');       // entreprise
ensure('users', 'location', 'TEXT');      // localisation
ensure('users', 'website', 'TEXT');       // site / lien
ensure('users', 'email_pro', 'TEXT');     // email professionnel affiché
ensure('users', 'phone', 'TEXT');         // téléphone
ensure('users', 'skills', 'TEXT');        // compétences (séparées par des virgules)
ensure('users', 'cv_url', 'TEXT');        // CV joint (fichier)
ensure('users', 'cv_name', 'TEXT');       // nom du fichier CV
ensure('users', 'cv_summary', 'TEXT');    // résumé du CV en bref

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
