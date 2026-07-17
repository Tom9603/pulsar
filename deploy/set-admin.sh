#!/usr/bin/env bash
#
# Donne (ou retire) le droit d'administration de la plateforme à un compte.
#
# Ce droit ne peut être posé QUE par ce script, sur le serveur : il n'existe
# aucun moyen de se promouvoir administrateur depuis l'application. C'est
# volontaire, pour qu'un compte ordinaire ne puisse jamais s'octroyer ce pouvoir.
#
# Usage :
#   bash /opt/pulsar/deploy/set-admin.sh <nom_utilisateur_ou_email>
#   bash /opt/pulsar/deploy/set-admin.sh <nom_utilisateur_ou_email> --retirer
#
set -euo pipefail

DB=${PULSAR_DB:-/var/lib/pulsar/pulsar.db}
WHO=${1:-}
MODE=${2:-}

if [ -z "$WHO" ]; then
  echo "Usage : bash set-admin.sh <nom_utilisateur_ou_email> [--retirer]" >&2
  exit 1
fi
if [ ! -f "$DB" ]; then
  echo "Base introuvable : $DB" >&2
  exit 1
fi

VALUE=1
LABEL="administrateur"
if [ "$MODE" = "--retirer" ]; then VALUE=0; LABEL="compte ordinaire"; fi

# On passe par Node (même moteur SQLite que l'app) plutôt que par la commande
# sqlite3, qui n'est pas toujours installée.
node -e "
const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('$DB');
const who = '$WHO'.toLowerCase();
const u = db.prepare('SELECT id, username, platform_admin FROM users WHERE lower(username) = ? OR lower(email) = ?').get(who, who);
if (!u) { console.error('Aucun compte pour : $WHO'); process.exit(1); }
db.prepare('UPDATE users SET platform_admin = ? WHERE id = ?').run($VALUE, u.id);
console.log('Compte « ' + u.username + ' » est desormais : $LABEL.');
"

systemctl restart pulsar >/dev/null 2>&1 || true
echo "Pulsar redemarre. Reconnectez-vous pour que le changement prenne effet."
