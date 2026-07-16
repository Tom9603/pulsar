# Mettre Pulsar en ligne (Hetzner + IONOS)

Objectif : Pulsar accessible 24h/24 sur `https://join-pulsar.com`.
Suivez les étapes dans l'ordre. Les blocs `comme ceci` sont à copier-coller dans le terminal du serveur.

---

## 1. Créer le serveur (console Hetzner)

Bouton **CREATE SERVER**, puis :

| Réglage | Choix |
|---|---|
| Location | **Falkenstein** ou **Nuremberg** (Allemagne, proche de la France) |
| Image | **Ubuntu 24.04** |
| Type | **Shared vCPU · x86** → **CX22** (2 vCPU, 4 Go, 40 Go) |
| Networking | IPv4 + IPv6 (laisser coché) |
| SSH Keys | ajoutez votre clé (recommandé). Sinon, Hetzner envoie un mot de passe root par email |
| Name | `pulsar` |

Créez, puis notez l'**adresse IPv4** affichée (par exemple `91.99.x.x`).

---

## 2. Pointer le domaine (IONOS)

Dans IONOS → **Domaines & SSL** → `join-pulsar.com` → **Modifier les paramètres DNS** :

| Type | Nom | Valeur |
|---|---|---|
| A | `@` | l'IPv4 du serveur |
| A | `www` | l'IPv4 du serveur |

Comptez de quelques minutes à 1 heure pour la propagation.

---

## 3. Se connecter au serveur

```bash
ssh root@VOTRE_IP
```

---

## 4. Installer ce qu'il faut (Node 24, Caddy, Git)

```bash
apt update && apt upgrade -y

# Node 24 (obligatoire : Pulsar utilise la base SQLite intégrée à Node)
curl -fsSL https://deb.nodesource.com/setup_24.x | bash -
apt install -y nodejs git

# Caddy : HTTPS automatique
apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list
apt update && apt install -y caddy

node -v   # doit afficher v24.x
```

---

## 5. Créer l'utilisateur et les dossiers

```bash
adduser --system --group --home /opt/pulsar pulsar
mkdir -p /var/lib/pulsar
chown -R pulsar:pulsar /opt/pulsar /var/lib/pulsar
```

---

## 6. Récupérer le code et le construire

```bash
cd /opt
rm -rf pulsar/.git 2>/dev/null
git clone https://github.com/Tom9603/pulsar.git /opt/pulsar-src
cp -r /opt/pulsar-src/. /opt/pulsar/
rm -rf /opt/pulsar-src
cd /opt/pulsar

npm run install:all
npm run build:client

chown -R pulsar:pulsar /opt/pulsar
```

---

## 7. Configurer (fichier .env)

```bash
# Génère une phrase secrète aléatoire pour signer les connexions
JWT=$(node -e "console.log(require('crypto').randomBytes(48).toString('hex'))")

cat > /opt/pulsar/server/.env <<EOF
PORT=3001
JWT_SECRET=$JWT
PULSAR_DATA_DIR=/var/lib/pulsar
PULSAR_PUBLIC_URL=https://join-pulsar.com

# Assistant IA (optionnel) : collez votre clé Anthropic pour l'activer
PULSAR_AI_KEY=
PULSAR_AI_LIMIT=3

# Emails d'activation (optionnel) : sans ça, les comptes sont activés directement
# PULSAR_SMTP_HOST=
# PULSAR_SMTP_PORT=587
# PULSAR_SMTP_USER=
# PULSAR_SMTP_PASS=
# PULSAR_MAIL_FROM=Pulsar <noreply@join-pulsar.com>
EOF

chown pulsar:pulsar /opt/pulsar/server/.env
chmod 600 /opt/pulsar/server/.env
```

---

## 8. Lancer Pulsar en permanence

```bash
cp /opt/pulsar/deploy/pulsar.service /etc/systemd/system/pulsar.service
systemctl daemon-reload
systemctl enable --now pulsar
systemctl status pulsar --no-pager   # doit afficher « active (running) »
```

---

## 9. Activer le HTTPS

```bash
cp /opt/pulsar/deploy/Caddyfile /etc/caddy/Caddyfile
systemctl reload caddy
```

Caddy obtient le certificat tout seul. Le HTTPS est **indispensable** : sans lui, le micro, la caméra et le partage d'écran sont bloqués par les navigateurs.

---

## 10. Pare-feu

```bash
ufw allow OpenSSH
ufw allow 80
ufw allow 443
ufw --force enable
```

---

## 11. Vérifier

Ouvrez **https://join-pulsar.com** : l'écran de connexion Pulsar doit apparaître, avec le cadenas.

En cas de souci :
```bash
journalctl -u pulsar -n 50 --no-pager    # journal de Pulsar
journalctl -u caddy -n 50 --no-pager     # journal du HTTPS
```

---

## Mettre à jour plus tard

```bash
cd /opt/pulsar
git pull
npm run install:all
npm run build:client
chown -R pulsar:pulsar /opt/pulsar
systemctl restart pulsar
```

---

## Plus tard : les appels derrière un réseau d'entreprise

Les appels et le partage d'écran fonctionnent en direct entre les participants. Derrière certains réseaux
d'entreprise très fermés, il faut un relais (serveur TURN, par exemple `coturn`), à configurer via
`TURN_URL`, `TURN_USERNAME` et `TURN_CREDENTIAL` dans le `.env`. À voir seulement si vous constatez
des appels qui ne s'établissent pas.
