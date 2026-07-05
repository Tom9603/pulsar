# Pulsar

**Pulsar** est une messagerie d'équipe en temps réel pensée pour les **professionnels**
(TPE, PME, ESN, indépendants) : serveurs, salons textuels & vocaux, appels, et surtout
de quoi **travailler** — transformer un message en tâche, regrouper ce qui attend une action,
inviter un client sur un espace dédié, et présenter une vraie fiche professionnelle.

L'esprit reste celui d'un Discord, en plus pro. La base est une application web, empaquetable
en **vraie application téléchargeable** (`.exe` / `.dmg` / `.AppImage`) via Electron.

## Stack

| Partie   | Techno |
|----------|--------|
| Frontend | React + Vite (Font Awesome pour les icônes) |
| Backend  | Node.js + Express + Socket.IO |
| Base     | SQLite (module `node:sqlite` natif — zéro installation) |
| Auth     | JWT + mots de passe hashés (scrypt natif) |
| Temps réel | WebSocket via Socket.IO |

Aucune dépendance native à compiler : SQLite et le chiffrement utilisent des modules intégrés à Node.

## Fonctionnalités

- **Comptes** : inscription / connexion, session persistante
- **Serveurs** : création, code d'invitation, rôles & permissions, catégories, renommage, icône
- **Salons** : textuels et vocaux ; **espaces clients privés** (accès restreint) + étiquette projet/client
- **Chat** : temps réel, Markdown, réponses, modification / suppression, réactions, mentions @,
  messages épinglés, images / GIF (Tenor) / messages vocaux / fichiers
- **Tâches** : transformer n'importe quel message en **tâche** (responsable, échéance date+heure, priorité, statut)
- **Centre « À faire »** : un seul endroit pour les tâches assignées + les rappels en attente d'action
- **Rappels** : garder un message et se le faire rappeler à une **date et une heure précises**
- **Vocal** : audio réel WebRTC (mesh P2P), micro coupé/actif, détection de la parole (STUN + TURN configurable)
- **Messages privés** : texte, images, GIF, vocal, fichiers, et **appel vocal 1-à-1**
- **Contacts** : demandes, acceptation, blocage, bibliothèque de contacts
- **Profil pro** : fiche (poste, entreprise, coordonnées, compétences), **CV joint** + résumé
- **Notifications** : cloche in-app + son + notifications bureau (messages, mentions, tâches, rappels)
- **Navigation** : bouton retour, profils consultables en fenêtre au clic sur un nom
- **App desktop** (Windows / macOS / Linux) avec mise à jour automatique (Windows)

### Fonctionnalités signature

- **Regarder / écouter ensemble** : un lien YouTube ou un fichier vidéo/audio → lecture **synchronisée** pour tout le salon
- **Messages express** : bibliothèque de messages tout prêts, envoi en 1 clic
- **Soundboard** : sons de base + sons téléchargeables, joués pour tout le salon vocal
- **Tableau blanc partagé** : dessiner / écrire à plusieurs en temps réel

## Démarrage

Prérequis : **Node.js ≥ 24** (pour le module `node:sqlite`).

```bash
# À la racine du projet
npm run install:all   # installe racine + serveur + client
npm run dev           # lance le serveur (3001) ET le client (5173)
```

Puis ouvrez **http://localhost:5173**.

> Pour tester le temps réel : ouvrez un second onglet en navigation privée,
> créez un autre compte, rejoignez le même serveur avec le code d'invitation.

## Structure

```
pulsar/
├── server/                 # API Express + Socket.IO
│   └── src/
│       ├── index.js        # point d'entrée
│       ├── db.js           # schéma SQLite (+ migrations)
│       ├── auth.js         # JWT + hash mots de passe
│       ├── permissions.js  # rôles, permissions, accès aux salons privés
│       ├── socket.js       # temps réel (messages, présence, vocal WebRTC, DM, tâches)
│       └── routes/         # auth, users, servers, channels, dms, tasks, saved…
├── client/                 # Interface React (Vite)
│   └── src/
│       ├── pages/          # Login, Register, AppLayout
│       ├── components/     # ChatView, TasksPanel, ActionCenter, ProfileModal…
│       ├── hooks/          # useVoice / useCall (WebRTC)
│       └── context/        # AuthContext
├── desktop/                # App Electron (main.js, preload.js)
├── electron-builder.yml    # Config de packaging (Win/Mac/Linux)
└── .github/workflows/      # CI : construit & publie les versions
```

## Application desktop (Electron)

Pulsar peut être empaquetée en **vraie application téléchargeable** (Windows `.exe`,
macOS `.dmg`, Linux `.AppImage`), avec **mise à jour automatique**.

> ⚠️ L'app desktop est le **client**. Le **serveur** (`server/`) doit tourner séparément
> sur une machine accessible. L'écran de connexion permet d'indiquer l'adresse du serveur.

```bash
npm run desktop:dev      # serveur + client + fenêtre Electron (développement)
npm run desktop:build    # construit l'installateur pour votre système
```

### Publier une nouvelle version

1. Incrémentez la version dans [`package.json`](package.json).
2. Publiez :
   ```bash
   git add -A && git commit -m "vX.Y.Z"
   git tag vX.Y.Z
   git push && git push --tags
   ```
3. GitHub Actions construit les installateurs Windows/Mac/Linux et les met en ligne.

## Configuration du serveur (variables d'environnement)

| Variable | Rôle |
|----------|------|
| `PORT` | Port d'écoute (défaut 3001) |
| `JWT_SECRET` | Secret de signature des jetons (**à définir en production**) |
| `PULSAR_DATA_DIR` | Dossier de la base SQLite + fichiers uploadés |
| `TURN_URL` / `TURN_USERNAME` / `TURN_CREDENTIAL` | Serveur TURN pour le vocal |

### Vocal entre réseaux différents (TURN)

Sur un même réseau, le STUN suffit. Entre réseaux différents, il faut un **serveur TURN**
([coturn](https://github.com/coturn/coturn) par exemple) :

```bash
turnserver -a -u pulsar:motdepasse -r pulsar --no-tls
```

Puis côté serveur Pulsar :

```bash
TURN_URL="turn:IP_DU_SERVEUR:3478" TURN_USERNAME=pulsar TURN_CREDENTIAL=motdepasse npm start
```

## Note de sécurité

Le secret JWT par défaut est un secret de développement. En production, définissez
`JWT_SECRET` dans l'environnement du serveur.
