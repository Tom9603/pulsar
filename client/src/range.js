// Curseurs façon iOS : la piste se remplit jusqu'à la pastille.
// Les navigateurs Webkit n'ont pas de « partie remplie » native, on la
// dessine donc avec un dégradé piloté par une variable CSS.

function paint(el) {
  const min = Number(el.min || 0);
  const max = Number(el.max || 100);
  const span = max - min || 1;
  const pct = ((Number(el.value) - min) / span) * 100;
  el.style.setProperty('--fill-pct', `${Math.max(0, Math.min(100, pct))}%`);
}

function paintAll(root = document) {
  for (const el of root.querySelectorAll?.('input[type="range"]') || []) paint(el);
}

export function startRangePainting() {
  document.addEventListener('input', (e) => {
    if (e.target instanceof HTMLInputElement && e.target.type === 'range') paint(e.target);
  }, true);

  // Les curseurs apparaissent et disparaissent avec les fenêtres : on repeint
  // ceux qui arrivent dans la page.
  const obs = new MutationObserver((records) => {
    for (const r of records) {
      for (const node of r.addedNodes) {
        if (!(node instanceof HTMLElement)) continue;
        if (node.matches?.('input[type="range"]')) paint(node);
        else paintAll(node);
      }
    }
  });
  obs.observe(document.body, { childList: true, subtree: true });

  paintAll();
}
