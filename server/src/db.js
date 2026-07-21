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

  CREATE TABLE IF NOT EXISTS reports (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    reporter_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    target_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reason      TEXT,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS feedback (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type        TEXT NOT NULL DEFAULT 'suggestion',
    subject     TEXT,
    message     TEXT NOT NULL,
    area        TEXT,
    screenshots TEXT DEFAULT '[]',
    handled     INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Journal des actions d'administration (qui a fait quoi, quand). Traçabilité.
  CREATE TABLE IF NOT EXISTS admin_log (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    admin_id   INTEGER REFERENCES users(id) ON DELETE SET NULL,
    action     TEXT NOT NULL,
    target      TEXT,
    detail     TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS dm_reactions (
    message_id INTEGER NOT NULL REFERENCES dm_messages(id) ON DELETE CASCADE,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    emoji      TEXT NOT NULL,
    PRIMARY KEY (message_id, user_id, emoji)
  );

  -- Conversation privée « supprimée » côté d'un utilisateur : masquée jusqu'au
  -- prochain message (on stocke le dernier message vu au moment de la suppression).
  CREATE TABLE IF NOT EXISTS dm_hidden (
    user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    peer_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    hidden_msg_id INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, peer_id)
  );

  CREATE TABLE IF NOT EXISTS polls (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    channel_id INTEGER NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    creator_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    question   TEXT NOT NULL,
    options    TEXT NOT NULL,            -- tableau JSON de libellés
    multi      INTEGER NOT NULL DEFAULT 0,
    closes_at  INTEGER,                  -- epoch secondes, optionnel
    result_notified INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS poll_votes (
    poll_id      INTEGER NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
    user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    option_index INTEGER NOT NULL,
    PRIMARY KEY (poll_id, user_id, option_index)
  );

  CREATE TABLE IF NOT EXISTS ai_usage (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    day     TEXT NOT NULL,            -- AAAA-MM-JJ (quota IA par jour)
    count   INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, day)
  );

  CREATE TABLE IF NOT EXISTS scheduled_messages (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    channel_id   INTEGER REFERENCES channels(id) ON DELETE CASCADE,   -- message de salon
    recipient_id INTEGER REFERENCES users(id) ON DELETE CASCADE,      -- message privé
    content      TEXT NOT NULL,
    send_at      INTEGER NOT NULL,                                    -- horodatage unix (secondes)
    created_at   TEXT NOT NULL DEFAULT (datetime('now')),
    sent         INTEGER NOT NULL DEFAULT 0                           -- 0 = en attente, 1 = envoyé
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id         TEXT PRIMARY KEY,          -- identifiant de session (aléatoire), porté par le jeton
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    user_agent TEXT,                      -- appareil / navigateur (pour l'affichage)
    created_at INTEGER NOT NULL,          -- unix (secondes)
    last_seen  INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
  CREATE INDEX IF NOT EXISTS idx_scheduled_due ON scheduled_messages(sent, send_at);
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
ensure('messages', 'deleted', 'INTEGER NOT NULL DEFAULT 0'); // suppression douce (pierre tombale)
ensure('messages', 'poll_id', 'INTEGER'); // message porteur d'un sondage
// Fils de discussion : si renseigné, le message est une réponse rattachée au
// message d'origine et n'apparaît donc pas dans le flux principal du salon.
ensure('messages', 'thread_parent_id', 'INTEGER');
ensure('users', 'email', 'TEXT');                              // email (activation, récupération)
ensure('users', 'verified', 'INTEGER NOT NULL DEFAULT 1');    // compte activé (1 par défaut : comptes existants OK)
ensure('users', 'verify_token', 'TEXT');                      // jeton d'activation par email (héritage)
ensure('users', 'verify_code', 'TEXT');                       // code d'activation à 5 chiffres envoyé par email
ensure('users', 'verify_expires', 'INTEGER');                 // fin de validité du code (timestamp ms)
ensure('users', 'verify_tries', 'INTEGER NOT NULL DEFAULT 0');// essais ratés sur le code en cours
ensure('users', 'verify_sent_at', 'INTEGER');                 // dernier envoi (anti-renvoi en rafale)
ensure('users', 'reset_token', 'TEXT');                       // jeton « mot de passe oublié »
ensure('users', 'reset_expires', 'INTEGER');                  // fin de validité du jeton (timestamp ms)
// Preuve d'acceptation des conditions (RGPD) : quand, et quelle version.
ensure('users', 'tos_accepted_at', 'INTEGER');
ensure('users', 'tos_version', 'INTEGER');
// Administration de la plateforme. Ces deux drapeaux ne se posent JAMAIS depuis
// l'application : « platform_admin » via un script serveur uniquement, pour que
// personne ne puisse s'auto-promouvoir.
ensure('users', 'platform_admin', 'INTEGER NOT NULL DEFAULT 0');
ensure('users', 'suspended', 'INTEGER NOT NULL DEFAULT 0'); // compte suspendu par un administrateur
ensure('users', 'suspended_reason', 'TEXT');               // motif affiché à la connexion

// Modération : on enrichit la table « reports » (qui servait déjà à signaler un
// profil) pour couvrir aussi les messages, avec une copie du contenu incriminé
// afin que l'administrateur juge sans ouvrir les conversations privées.
ensure('reports', 'target_type', "TEXT NOT NULL DEFAULT 'user'"); // 'message' | 'dm' | 'user'
ensure('reports', 'content_excerpt', 'TEXT');                     // copie du contenu signalé
ensure('reports', 'context_label', 'TEXT');                      // ex. « salon Général · Studio »
ensure('reports', 'status', "TEXT NOT NULL DEFAULT 'open'");      // 'open' | 'resolved' | 'dismissed'
ensure('reports', 'handled_by', 'INTEGER');                      // administrateur qui a traité
ensure('feedback', 'handled', 'INTEGER NOT NULL DEFAULT 0');     // retour traité (au cas où table ancienne)
ensure('users', 'privacy_dm', "TEXT NOT NULL DEFAULT 'everyone'");     // qui peut m'écrire : 'everyone' | 'friends'
ensure('users', 'privacy_friend', "TEXT NOT NULL DEFAULT 'everyone'"); // qui peut m'ajouter : 'everyone' | 'none'
ensure('users', 'hide_presence', 'INTEGER NOT NULL DEFAULT 0');        // apparaître hors ligne (masquer le statut en ligne)
ensure('users', 'custom_status', 'TEXT');                             // statut personnalisé (texte libre)
ensure('users', 'custom_status_emoji', 'TEXT');                       // emoji du statut personnalisé
ensure('users', 'custom_status_until', 'INTEGER');                    // expiration automatique (unix, secondes) ou NULL
ensure('dm_messages', 'attachment_url', 'TEXT');
ensure('dm_messages', 'attachment_name', 'TEXT');
ensure('dm_messages', 'reply_to_id', 'INTEGER');
ensure('dm_messages', 'edited', 'INTEGER NOT NULL DEFAULT 0');
ensure('dm_messages', 'deleted', 'INTEGER NOT NULL DEFAULT 0');
ensure('dm_messages', 'pinned', 'INTEGER NOT NULL DEFAULT 0');
ensure('saved_messages', 'source_message_id', 'INTEGER'); // message d'origine (surlignage perso)
ensure('channels', 'category_id', 'INTEGER');
ensure('channels', 'client_label', 'TEXT');            // projet / client rattaché au salon
ensure('channels', 'private', 'INTEGER NOT NULL DEFAULT 0'); // salon restreint (espace client)
ensure('servers', 'icon_url', 'TEXT');
ensure('server_members', 'archived', 'INTEGER NOT NULL DEFAULT 0'); // serveur archivé pour CE membre (vue perso)
ensure('server_members', 'hidden', 'INTEGER NOT NULL DEFAULT 0');   // serveur caché pour CE membre (vue perso)

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
ensure('friendships', 'message', 'TEXT'); // message d'accompagnement d'une demande de contact
ensure('users', 'pronouns', 'TEXT');      // pronoms (inclusivité)
ensure('users', 'banner_url', 'TEXT');    // bannière (image/gif) derrière l'avatar
ensure('users', 'banner_color', 'TEXT');  // bannière (couleur unie) si pas d'image
ensure('users', 'socials', 'TEXT');       // réseaux (JSON : { linkedin, instagram, ... })
ensure('users', 'setup_completed', 'INTEGER NOT NULL DEFAULT 1'); // perso de 1re connexion faite (1 par défaut : comptes existants OK ; nouveaux comptes mis à 0)
ensure('users', 'deactivated', 'INTEGER NOT NULL DEFAULT 0');     // compte désactivé temporairement par son titulaire (réactivé à la reconnexion)
ensure('tasks', 'due_notified', 'INTEGER NOT NULL DEFAULT 0'); // échéance déjà notifiée (une seule fois)

// Index dépendant d'une colonne ajoutée par « ensure » : il doit venir après.
db.exec('CREATE INDEX IF NOT EXISTS idx_messages_thread ON messages(thread_parent_id, id);');

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
