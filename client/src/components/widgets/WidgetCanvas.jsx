import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import Icon from '../Icon.jsx';
import { WIDGETS, SIZE_LABELS, sizeKey } from './registry.jsx';

const GAP = 14;
const CELL_H = 132;

/** Deux widgets se chevauchent-ils ? */
function overlaps(a, b) {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

/** La place visée est-elle libre (hors du widget qu'on déplace) ? */
export function fits(layout, item, x, y, cols) {
  if (x < 0 || y < 0 || x + item.w > cols) return false;
  const probe = { x, y, w: item.w, h: item.h };
  return !layout.some((o) => o.id !== item.id && overlaps(probe, o));
}

/** Première place libre pour un widget de cette taille. */
export function firstFreeSpot(layout, w, h, cols) {
  for (let y = 0; y < 60; y++) {
    for (let x = 0; x + w <= cols; x++) {
      const probe = { id: '__new__', x, y, w, h };
      if (!layout.some((o) => overlaps(probe, o))) return { x, y };
    }
  }
  return { x: 0, y: 0 };
}

/** Ramène une disposition dans les clous : largeurs bornées, plus de chevauchement. */
export function normalize(layout, cols) {
  const out = [];
  for (const raw of layout) {
    const def = WIDGETS[raw.type];
    if (!def) continue;
    const item = { ...raw, w: Math.min(raw.w, cols), h: raw.h };
    if (!fits(out, item, item.x, item.y, cols)) {
      const spot = firstFreeSpot(out, item.w, item.h, cols);
      item.x = spot.x; item.y = spot.y;
    }
    out.push(item);
  }
  return out;
}

export default function WidgetCanvas({ layout, editing, cols, ctx, onChange, onConfigure }) {
  const gridRef = useRef(null);
  const [cellW, setCellW] = useState(0);
  const [drag, setDrag] = useState(null); // { id, dx, dy, tx, ty, valid }
  const dragRef = useRef(null);

  // Mesure la largeur d'une case pour convertir les pixels en cases.
  useLayoutEffect(() => {
    const el = gridRef.current;
    if (!el) return;
    const measure = () => setCellW((el.clientWidth - GAP * (cols - 1)) / cols);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [cols]);

  const rows = useMemo(() => {
    const used = layout.reduce((m, w) => Math.max(m, w.y + w.h), 0);
    return Math.max(used + (editing ? 2 : 0), 4);
  }, [layout, editing]);

  const pxToCell = useCallback((px, py) => ({
    x: Math.round(px / (cellW + GAP)),
    y: Math.round(py / (CELL_H + GAP)),
  }), [cellW]);

  // --- Déplacement ---------------------------------------------------
  const onPointerDown = (e, item) => {
    if (!editing || e.button !== 0) return;
    if (e.target.closest('.wg-tools')) return; // les commandes ne déclenchent pas un glisser
    const grid = gridRef.current.getBoundingClientRect();
    const originX = item.x * (cellW + GAP);
    const originY = item.y * (CELL_H + GAP);
    dragRef.current = {
      id: item.id,
      item,
      startX: e.clientX,
      startY: e.clientY,
      grabX: e.clientX - grid.left - originX, // où l'on tient le widget
      grabY: e.clientY - grid.top - originY,
      grid,
    };
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* pointeur déjà relâché */ }
    setDrag({ id: item.id, dx: 0, dy: 0, tx: item.x, ty: item.y, valid: true });
  };

  const onPointerMove = (e) => {
    const d = dragRef.current;
    if (!d) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    const px = e.clientX - d.grid.left - d.grabX;
    const py = e.clientY - d.grid.top - d.grabY;
    const cell = pxToCell(px, py);
    const tx = Math.max(0, Math.min(cols - d.item.w, cell.x));
    const ty = Math.max(0, cell.y);
    const valid = fits(layout, d.item, tx, ty, cols);
    setDrag({ id: d.id, dx, dy, tx, ty, valid });
  };

  const endDrag = (e) => {
    const d = dragRef.current;
    if (!d) return;
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* déjà relâché */ }
    const cur = drag;
    dragRef.current = null;
    setDrag(null);
    if (cur && cur.valid && (cur.tx !== d.item.x || cur.ty !== d.item.y)) {
      onChange(layout.map((w) => (w.id === d.id ? { ...w, x: cur.tx, y: cur.ty } : w)));
    }
  };

  // Éclairage de la grille : on suit le curseur pour ne révéler que ses abords.
  const onGridMove = (e) => {
    const el = gridRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty('--mx', `${e.clientX - r.left}px`);
    el.style.setProperty('--my', `${e.clientY - r.top}px`);
  };

  // Échap annule le déplacement en cours.
  useEffect(() => {
    if (!drag) return;
    const onKey = (ev) => { if (ev.key === 'Escape') { dragRef.current = null; setDrag(null); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [drag]);

  const remove = (id) => onChange(layout.filter((w) => w.id !== id));

  const resize = (item, w, h) => {
    const next = { ...item, w: Math.min(w, cols), h };
    const others = layout.filter((o) => o.id !== item.id);
    if (!fits(others, next, next.x, next.y, cols)) {
      const spot = firstFreeSpot(others, next.w, next.h, cols);
      next.x = spot.x; next.y = spot.y;
    }
    onChange(layout.map((o) => (o.id === item.id ? next : o)));
  };

  const style = {
    gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
    gridAutoRows: `${CELL_H}px`,
    gap: `${GAP}px`,
  };
  // En édition, on réserve deux lignes vides en bas : il faut de la place
  // libre pour poser un widget ailleurs.
  const gridStyle = editing ? { ...style, gridTemplateRows: `repeat(${rows}, ${CELL_H}px)` } : style;

  return (
    <div
      ref={gridRef}
      className={`wg-grid ${editing ? 'editing' : ''} ${drag ? 'dragging' : ''}`}
      style={gridStyle}
      onPointerMove={onGridMove}
    >
      {/* Quadrillage : invisible au repos, révélé autour du curseur. */}
      {editing && (
        <div className="wg-cells" aria-hidden="true" style={{ ...style, gridTemplateRows: `repeat(${rows}, ${CELL_H}px)` }}>
          {Array.from({ length: cols * rows }, (_, i) => <span key={i} className="wg-cell" />)}
        </div>
      )}

      {/* Empreinte : la place que prendrait le widget une fois lâché. */}
      {drag && (
        <div
          className={`wg-drop ${drag.valid ? '' : 'invalid'}`}
          style={{
            gridColumn: `${drag.tx + 1} / span ${layout.find((w) => w.id === drag.id)?.w || 1}`,
            gridRow: `${drag.ty + 1} / span ${layout.find((w) => w.id === drag.id)?.h || 1}`,
          }}
        />
      )}

      {layout.map((item) => {
        const def = WIDGETS[item.type];
        if (!def) return null;
        const Render = def.render;
        const moving = drag?.id === item.id;
        return (
          <div
            key={item.id}
            className={`wg-item ${editing ? 'editable' : ''} ${moving ? 'moving' : ''}`}
            style={{
              gridColumn: `${item.x + 1} / span ${item.w}`,
              gridRow: `${item.y + 1} / span ${item.h}`,
              transform: moving ? `translate(${drag.dx}px, ${drag.dy}px)` : undefined,
            }}
            onPointerDown={(e) => onPointerDown(e, item)}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
          >
            <div className="wg-body">
              <Render ctx={ctx} config={item.config} w={item.w} h={item.h} />
            </div>

            {editing && (
              <div className="wg-tools">
                <span className="wg-tools-name"><Icon name={def.icon} /> {def.name}</span>
                <span className="wg-sizes">
                  {def.sizes.filter(([w]) => w <= cols).map(([w, h]) => (
                    <button
                      key={sizeKey(w, h)}
                      className={item.w === w && item.h === h ? 'active' : ''}
                      title={SIZE_LABELS[sizeKey(w, h)] || `${w} sur ${h}`}
                      onClick={() => resize(item, w, h)}
                    >{SIZE_LABELS[sizeKey(w, h)] || `${w}×${h}`}</button>
                  ))}
                </span>
                {def.configurable && (
                  <button className="wg-tool" title="Configurer ce widget" onClick={() => onConfigure(item)}><Icon name="sliders" /></button>
                )}
                <button className="wg-tool danger" title="Retirer ce widget" onClick={() => remove(item.id)}><Icon name="xmark" /></button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
