#!/usr/bin/env bash
#
# Publie Pulsar en une seule commande : construit l'application, l'enregistre
# sur GitHub, puis la met à jour sur le serveur join-pulsar.com.
#
# Usage :
#   bash deploy/publish.sh "Description de ce que vous avez changé"
#
# À lancer depuis le dossier du projet (~/Desktop/Projets/concord).
#
set -euo pipefail

# --- Réglages (à ne pas modifier normalement) ---
SERVER="root@167.233.98.220"
APP_DIR="/opt/pulsar"

# Couleurs pour que les étapes soient lisibles.
b() { printf "\n\033[1;35m▶ %s\033[0m\n" "$1"; }
ok() { printf "\033[1;32m✓ %s\033[0m\n" "$1"; }
ko() { printf "\033[1;31m✗ %s\033[0m\n" "$1" >&2; }

MESSAGE=${1:-}
if [ -z "$MESSAGE" ]; then
  ko "Il manque la description. Exemple :"
  echo '   bash deploy/publish.sh "Correction du bouton de connexion"'
  exit 1
fi

# On doit être à la racine du projet (présence de package.json + dossier client).
if [ ! -f package.json ] || [ ! -d client ]; then
  ko "Lancez cette commande depuis le dossier du projet (~/Desktop/Projets/concord)."
  exit 1
fi

# --- 1. Sécurité : jamais de secret publié ---
b "Vérification de sécurité"
if git status --porcelain | grep -qE '(^|\s)server/\.env$'; then
  ko "Le fichier des secrets (server/.env) est sur le point d'être publié. Arrêt."
  echo "   Prévenez votre développeur : ce fichier ne doit JAMAIS partir sur GitHub."
  exit 1
fi
ok "Aucun secret dans les fichiers à publier"

# --- 2. Construction de l'application ---
b "Construction de l'application (peut prendre une minute)"
( cd client && npm run build >/tmp/pulsar-build.log 2>&1 ) || { ko "La construction a échoué. Détails :"; tail -20 /tmp/pulsar-build.log; exit 1; }
ok "Application construite"

# --- 3. Enregistrement sur GitHub ---
b "Enregistrement des changements"
git add -A
if git diff --cached --quiet; then
  echo "   (aucun changement à enregistrer, on passe directement au déploiement)"
else
  git commit -q -m "$MESSAGE"
  ok "Changements enregistrés : $MESSAGE"
fi

b "Envoi sur GitHub"
git push -q origin main || { ko "L'envoi sur GitHub a échoué (connexion ? droits ?)."; exit 1; }
ok "Envoyé sur GitHub"

# --- 4. Mise à jour du serveur ---
b "Mise à jour de join-pulsar.com (le site reste en ligne pendant l'opération)"
ssh -o ConnectTimeout=20 "$SERVER" "cd $APP_DIR && git pull -q && npm run build:client >/tmp/pulsar-srv-build.log 2>&1 && chown -R pulsar:pulsar $APP_DIR && systemctl restart pulsar" \
  || { ko "La mise à jour du serveur a échoué. Le site tourne encore sur l'ancienne version."; exit 1; }
ok "Serveur mis à jour et redémarré"

# --- 5. Vérification que le site répond ---
b "Vérification finale"
sleep 3
CODE=$(curl -s -o /dev/null -w "%{http_code}" https://join-pulsar.com || echo "000")
if [ "$CODE" = "200" ]; then
  VER=$(curl -s https://join-pulsar.com/api/version 2>/dev/null || echo "?")
  ok "En ligne : https://join-pulsar.com répond (version $VER)"
  printf "\n\033[1;32m✦ Publication terminée avec succès.\033[0m\n\n"
else
  ko "Le site ne répond pas correctement (code $CODE). Vérifiez dans quelques secondes."
  echo "   S'il reste muet : ssh $SERVER 'journalctl -u pulsar -n 30 --no-pager'"
  exit 1
fi
