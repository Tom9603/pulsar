#!/usr/bin/env bash
#
# Active les emails automatiques de Pulsar (code de confirmation à
# l'inscription, lien « mot de passe oublié », notification de changement).
#
# La clé SMTP est saisie à l'aveugle : elle n'apparaît pas à l'écran, ne passe
# pas par la ligne de commande, et ne finit donc ni dans l'historique du shell
# ni dans les journaux.
#
# Usage (sur le serveur, en root) :  bash /opt/pulsar/deploy/set-smtp.sh
#
set -euo pipefail

ENV_FILE=/opt/pulsar/server/.env

# Valeurs Brevo du compte Pulsar. Modifiables si vous changez de prestataire.
SMTP_HOST=${SMTP_HOST:-smtp-relay.brevo.com}
SMTP_PORT=${SMTP_PORT:-587}
SMTP_USER=${SMTP_USER:-b25a56001@smtp-brevo.com}
MAIL_FROM=${MAIL_FROM:-Pulsar <no-reply@join-pulsar.com>}

if [ ! -f "$ENV_FILE" ]; then
  echo "Fichier introuvable : $ENV_FILE" >&2
  exit 1
fi

echo "Configuration de l'envoi d'emails pour Pulsar"
echo "  Serveur     : $SMTP_HOST:$SMTP_PORT"
echo "  Identifiant : $SMTP_USER"
echo "  Expéditeur  : $MAIL_FROM"
echo ""
echo "Collez votre clé SMTP Brevo puis appuyez sur Entrée."
echo "(Elle ne s'affichera pas : c'est normal, tapez ou collez à l'aveugle.)"
printf "Cle SMTP : "
read -rs SMTP_PASS
echo ""

if [ -z "$SMTP_PASS" ]; then
  echo "Aucune clé saisie. Rien n'a été modifié." >&2
  exit 1
fi

# Copie de sécurité avant toute modification.
cp "$ENV_FILE" "$ENV_FILE.bak.$(date +%s)"

# Retire les anciennes lignes SMTP s'il y en avait, pour qu'un second passage
# remplace la configuration au lieu de l'empiler.
# On filtre avec grep plutôt qu'avec « sed -i » : ce dernier ne s'utilise pas
# de la même façon selon les systèmes, et échouait silencieusement.
TMP=$(mktemp)
grep -vE '^(PULSAR_SMTP_(HOST|PORT|USER|PASS)=|PULSAR_MAIL_FROM=|# Emails automatiques \(Brevo\))' "$ENV_FILE" > "$TMP" || true
mv "$TMP" "$ENV_FILE"

{
  echo ""
  echo "# Emails automatiques (Brevo). Configuré le $(date '+%d/%m/%Y a %H:%M')."
  echo "PULSAR_SMTP_HOST=$SMTP_HOST"
  echo "PULSAR_SMTP_PORT=$SMTP_PORT"
  echo "PULSAR_SMTP_USER=$SMTP_USER"
  echo "PULSAR_SMTP_PASS=$SMTP_PASS"
  echo "PULSAR_MAIL_FROM=$MAIL_FROM"
} >> "$ENV_FILE"

chown pulsar:pulsar "$ENV_FILE"
chmod 600 "$ENV_FILE"

systemctl restart pulsar
sleep 3

if systemctl is-active --quiet pulsar; then
  echo ""
  echo "Termine. Pulsar a redemarre et les emails sont actifs."
  echo "Verification : la cle enregistree fait ${#SMTP_PASS} caracteres."
  echo ""
  echo "Testez en creant un compte sur https://join-pulsar.com :"
  echo "vous devez recevoir un code a 5 chiffres."
  echo "En cas de souci :  journalctl -u pulsar -n 30 --no-pager"
else
  echo "ATTENTION : Pulsar n'a pas redemarre correctement." >&2
  echo "Regardez :  journalctl -u pulsar -n 30 --no-pager" >&2
  exit 1
fi
