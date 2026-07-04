# Concord

Un clone de Discord centré sur les **fonctionnalités de base** : serveurs, salons textuels & vocaux,
messagerie en temps réel et personnalisation de profil. Pas de boutique, pas de superflu.

> Pensé pour devenir une **vraie application téléchargeable** (.exe / .dmg) via Electron par la suite —
> la base est une app web, exactement comme le vrai client Discord.

## 🧱 Stack

| Partie   | Techno |
|----------|--------|
| Frontend | React + Vite |
| Backend  | Node.js + Express + Socket.IO |
| Base     | SQLite (module `node:sqlite` natif — zéro installation) |
| Auth     | JWT + mots de passe hashés (scrypt natif) |
| Temps réel | WebSocket via Socket.IO |

Aucune dépendance native à compiler : SQLite et le chiffrement utilisent des modules intégrés à Node.

## ✅ Fonctionnalités

- **Comptes** : inscription / connexion, session persistante
- **Serveurs** : création, code d’invitation, rejoindre, quitter, supprimer
- **Salons** : textuels et vocaux, création / suppression
- **Chat textuel** : messages temps réel, historique, indicateur « écrit… »,
  **modifier / supprimer**, **réactions emoji**, **mentions @**, **images**,
  **GIF** (recherche Tenor) et **messages vocaux** (enregistrement)
- **Vocal** : **audio réel WebRTC** (mesh P2P), micro coupé/actif, détection de la parole,
  connexion persistante entre salons (STUN + TURN configurable)
- **Messages privés** (DM) en temps réel : texte, images, GIF, vocal, et **appel vocal 1-à-1**
- **Rôles & permissions** par serveur (gérer salons/rôles, expulser…)
- **Notifications** bureau + son (nouveaux DM, mentions)
- **Présence** : membres en ligne / hors ligne en direct
- **Profil** : nom affiché, couleur ou image d’avatar, statut, bio
- **App desktop** (Windows / macOS / Linux) avec mise à jour automatique

## 🚀 Démarrage

Prérequis : **Node.js ≥ 24** (pour le module `node:sqlite`).

```bash
# À la racine du projet
npm run install:all   # installe racine + serveur + client
npm run dev           # lance le serveur (3001) ET le client (5173)
```

Puis ouvre **http://localhost:5173**.

> Pour tester le temps réel : ouvre un second onglet en navigation privée,
> crée un autre compte, rejoins le même serveur avec le code d’invitation.

### Lancer séparément

```bash
npm --prefix server run dev   # backend seul
npm --prefix client run dev   # frontend seul
```

## 📁 Structure

```
concord/
├── server/                 # API Express + Socket.IO (le "cerveau")
│   └── src/
│       ├── index.js        # point d'entrée
│       ├── db.js           # schéma SQLite
│       ├── auth.js         # JWT + hash mots de passe
│       ├── permissions.js  # rôles & permissions
│       ├── socket.js       # temps réel (messages, présence, vocal WebRTC, DM)
│       └── routes/         # auth, users, servers, channels, dms
├── client/                 # Interface React (Vite)
│   └── src/
│       ├── pages/          # Login, Register, AppLayout
│       ├── components/     # ServerRail, ChatView, VoiceView, Dm*, Roles*…
│       ├── hooks/          # useVoice (WebRTC)
│       └── context/        # AuthContext
├── desktop/                # App Electron (main.js, preload.js)
├── electron-builder.yml    # Config de packaging (Win/Mac/Linux)
└── .github/workflows/      # CI : construit & publie les versions
```

## 🖥️ Application desktop (Electron)

Concord peut être empaquetée en **vraie application téléchargeable** (Windows `.exe`,
macOS `.dmg`, Linux `.AppImage`), avec **mise à jour automatique**.

> ⚠️ L'app desktop est le **client**. Le **serveur** (`server/`) doit tourner
> séparément sur une machine accessible (celle d'un « host » ou un hébergement).
> Dans l'app, l'écran de connexion permet d'indiquer l'adresse du serveur.

```bash
npm run desktop:dev      # lance serveur + client + fenêtre Electron (développement)
npm run desktop:build    # construit l'installateur pour TON système (dans desktop/release/)
```

### Publier une nouvelle version (mise à jour automatique)

La publication passe par **GitHub Releases** + **GitHub Actions** :

1. Dans [`electron-builder.yml`](electron-builder.yml), remplace `VOTRE-PSEUDO-GITHUB`
   par ton pseudo GitHub.
2. Incrémente la version dans [`package.json`](package.json) (ex. `0.1.0` → `0.1.1`).
3. Publie :
   ```bash
   git add -A && git commit -m "v0.1.1"
   git tag v0.1.1
   git push && git push --tags
   ```
4. GitHub Actions construit alors les installateurs Windows/Mac/Linux et les met en ligne.
   Les apps déjà installées se mettent à jour **toutes seules** au prochain lancement.

> Les changements **côté serveur** (nouvelles fonctions, corrections) ne nécessitent
> PAS de nouvelle version de l'app : il suffit de redéployer le serveur.

## ⚙️ Configuration du serveur (variables d’environnement)

| Variable | Rôle |
|----------|------|
| `PORT` | Port d’écoute (défaut 3001) |
| `JWT_SECRET` | Secret de signature des jetons (**à définir en production**) |
| `CONCORD_DATA_DIR` | Dossier de la base SQLite + images uploadées |
| `TURN_URL` / `TURN_USERNAME` / `TURN_CREDENTIAL` | Ton serveur TURN pour le vocal |

### Vocal entre réseaux différents (TURN)

Sur un même réseau Wi-Fi, le STUN suffit. Pour que le vocal marche entre des réseaux
différents (chacun chez soi), il faut un **serveur TURN**. Le plus simple est
[coturn](https://github.com/coturn/coturn) sur un petit serveur :

```bash
# exemple minimal
turnserver -a -u concord:motdepasse -r concord --no-tls
```

Puis côté serveur Concord :

```bash
TURN_URL="turn:IP_DU_SERVEUR:3478" TURN_USERNAME=concord TURN_CREDENTIAL=motdepasse npm start
```

> Sans config, un TURN public gratuit (best-effort) est utilisé pour les tests.

## 🗺️ Prochaines étapes suggérées

1. **Hébergement du serveur** (pour jouer à plusieurs hors du réseau local)
2. **Serveur TURN** dédié pour un vocal fiable (voir ci-dessus)
3. **Signature de code** (certificats payants) pour supprimer les avertissements Windows/Mac
4. **Partage d’écran / vidéo** dans les salons vocaux
5. **Applications mobiles** (iOS / Android) — voir la note ci-dessous

## 🔐 Note de sécurité

Le secret JWT par défaut est un secret de développement. En production, définis
`JWT_SECRET` dans l’environnement du serveur.
