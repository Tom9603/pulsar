// Doit rester aligné avec server/src/permissions.js
export const PERMISSIONS = {
  MANAGE_CHANNELS: 'Gérer les salons',
  MANAGE_ROLES: 'Gérer les rôles',
  KICK_MEMBERS: 'Expulser des membres',
  MANAGE_SERVER: 'Modifier le serveur',
  ASSIGN_TASKS: 'Attribuer des tâches',
};

export const PERMISSION_KEYS = Object.keys(PERMISSIONS);

/** Fabrique un helper `can(permKey)` à partir des droits d'un membre. */
export function makeCan(isOwner, myPermissions = []) {
  const set = new Set(myPermissions);
  return (key) => isOwner || set.has(key);
}
