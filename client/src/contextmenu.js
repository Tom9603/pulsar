// Menu contextuel personnalisé (remplace le clic droit du navigateur/OS), à la charte Pulsar.
let state = { open: false, x: 0, y: 0, items: [] };
const subs = new Set();

export function getMenu() { return state; }
export function subscribeMenu(fn) { subs.add(fn); return () => subs.delete(fn); }
function emit() { subs.forEach((fn) => fn(state)); }

export function openMenu(x, y, items) {
  const clean = (items || []).filter(Boolean);
  if (!clean.length) return;
  state = { open: true, x, y, items: clean };
  emit();
}
export function closeMenu() {
  if (!state.open) return;
  state = { ...state, open: false };
  emit();
}

/**
 * Fabrique un gestionnaire onContextMenu qui ouvre le menu de l'app.
 * `items` peut être un tableau ou une fonction () => tableau.
 * Chaque item : { label, icon?, onClick?, danger? } ou { sep: true }.
 */
export function ctx(items) {
  return (e) => {
    const list = typeof items === 'function' ? items() : items;
    const clean = (list || []).filter(Boolean);
    if (!clean.length) return;
    e.preventDefault();
    e.stopPropagation();
    openMenu(e.clientX, e.clientY, clean);
  };
}
