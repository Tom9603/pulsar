// Doit rester aligné avec server/src/permissions.js
export const PERMISSIONS = {
  MANAGE_CHANNELS: 'Gérer les salons',
  MANAGE_ROLES: 'Gérer les rôles',
  KICK_MEMBERS: 'Expulser des membres',
  MANAGE_SERVER: 'Modifier le serveur',
  ASSIGN_TASKS: 'Attribuer des tâches',
};

export const PERMISSION_KEYS = Object.keys(PERMISSIONS);

// Icône + description : chaque permission ouvre de vraies actions (appliquées côté serveur).
export const PERMISSION_META = {
  MANAGE_CHANNELS: { icon: 'rectangle-list', desc: 'Créer, renommer et supprimer les salons, et modérer les messages des autres.' },
  MANAGE_ROLES: { icon: 'user-shield', desc: 'Créer des rôles et les attribuer aux membres.' },
  KICK_MEMBERS: { icon: 'user-slash', desc: 'Retirer des membres du serveur.' },
  MANAGE_SERVER: { icon: 'sliders', desc: 'Modifier le nom, l’icône et les réglages du serveur.' },
  ASSIGN_TASKS: { icon: 'list-check', desc: 'Attribuer des tâches aux autres membres.' },
};

/** Fabrique un helper `can(permKey)` à partir des droits d'un membre. */
export function makeCan(isOwner, myPermissions = []) {
  const set = new Set(myPermissions);
  return (key) => isOwner || set.has(key);
}
