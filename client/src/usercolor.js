// Couleur déterministe par utilisateur (façon Snapchat) pour distinguer les gens
// dans les serveurs et les messages privés : le blanc a tendance à se mélanger.
// La même personne garde toujours la même couleur (dérivée de son identifiant).

// Teintes entrelacées : deux identifiants voisins tombent sur des couleurs contrastées.
const PALETTE = [
  '#f97583', '#56b3fa', '#f2c94c', '#b18cff', '#5fd0a8', '#fca66b',
  '#7aa2ff', '#e07fd6', '#a3d95b', '#4ecdc4', '#ff8fab', '#f0b45e',
  '#67c9e8', '#c9a2ff', '#9ad86b', '#ffa5c0',
];

export function userColor(key) {
  const s = String(key ?? '');
  if (!s) return PALETTE[0];
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}
