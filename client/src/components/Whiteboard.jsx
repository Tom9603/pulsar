import { useEffect, useRef, useState, useCallback } from 'react';
import { getSocket } from '../socket.js';
import { uploadImage } from '../api.js';
import Icon from './Icon.jsx';

// Le tableau raisonne dans un espace fixe (rendu responsive par le CSS) et
// stocke des coordonnées normalisées (0..1) pour rester net à toute taille.
const W = 1000, H = 600;
const BG = '#1b1e27';
const COLORS = ['#ffffff', '#14b8a6', '#ED4245', '#FAA61A', '#57F287', '#3498DB', '#EB459E', '#111111'];
const TOOLS = [
  { id: 'select', icon: 'arrow-pointer', title: 'Sélectionner et déplacer' },
  { id: 'pen', icon: 'pen', title: 'Stylo' },
  { id: 'line', icon: 'minus', title: 'Ligne' },
  { id: 'arrow', icon: 'arrow-right', title: 'Flèche' },
  { id: 'rect', icon: 'vector-square', title: 'Rectangle' },
  { id: 'ellipse', icon: 'circle', reg: true, title: 'Cercle' },
  { id: 'text', icon: 'font', title: 'Texte' },
];
const DRAW_TOOLS = new Set(['pen', 'line', 'arrow', 'rect', 'ellipse']);
const fontFor = (el) => `600 ${Math.max(14, el.size * 6)}px system-ui, -apple-system, sans-serif`;
let idSeq = 0;
const newId = () => `${Date.now().toString(36)}-${(idSeq++).toString(36)}`;

/**
 * Tableau blanc partagé façon Draw.io : chaque forme est un OBJET (pas des
 * pixels), donc on peut la sélectionner, la déplacer, la supprimer, et annuler.
 * La synchro temps réel envoie l'état complet à chaque changement (simple et
 * toujours cohérent) ; le stylo se termine à la levée du curseur.
 */
export default function Whiteboard({ channelId, dmUserId, onClose, onPublish }) {
  const isDm = dmUserId != null;
  const EV = isDm
    ? { get: 'dmboard:get', init: 'dmboard:init', set: 'dmboard:set' }
    : { get: 'board:get', init: 'board:init', set: 'board:set' };
  const key = isDm ? { dmUserId } : { channelId };
  const matches = (p) => (isDm ? p.dmUserId === dmUserId : p.channelId === channelId);

  const canvasRef = useRef(null);
  const ctxRef = useRef(null);
  const textInputRef = useRef(null);

  // Modèle : source de vérité dans une ref (dessin impératif), l'état ne sert
  // qu'à rafraîchir la barre d'outils. Historique annuler / refaire par instantanés.
  const elements = useRef([]);
  const past = useRef([]);
  const future = useRef([]);
  const draft = useRef(null);      // forme en cours de tracé
  const op = useRef(null);         // interaction en cours (tracé ou déplacement)
  const selectedIdRef = useRef(null);

  const [selectedId, setSelectedId] = useState(null);
  const [histVer, setHistVer] = useState(0);
  const bumpHist = () => setHistVer((v) => v + 1);
  const [color, setColor] = useState('#14b8a6');
  const [size, setSize] = useState(4);
  const [tool, setTool] = useState('pen');
  const [textBox, setTextBox] = useState(null);
  const [textVal, setTextVal] = useState('');
  const [busy, setBusy] = useState(false);

  const select = useCallback((id) => { selectedIdRef.current = id; setSelectedId(id); }, []);

  // --- Dessin d'un élément ---------------------------------------------------
  function drawArrow(ctx, x0, y0, x1, y1, s) {
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
    const ang = Math.atan2(y1 - y0, x1 - x0);
    const len = Math.max(12, s * 3.5);
    ctx.beginPath();
    ctx.moveTo(x1, y1); ctx.lineTo(x1 - len * Math.cos(ang - Math.PI / 6), y1 - len * Math.sin(ang - Math.PI / 6));
    ctx.moveTo(x1, y1); ctx.lineTo(x1 - len * Math.cos(ang + Math.PI / 6), y1 - len * Math.sin(ang + Math.PI / 6));
    ctx.stroke();
  }
  function drawElement(ctx, el) {
    ctx.strokeStyle = el.color; ctx.fillStyle = el.color; ctx.lineWidth = el.size;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    if (el.type === 'pen') {
      if (!el.pts || el.pts.length === 0) return;
      ctx.beginPath(); ctx.moveTo(el.pts[0][0] * W, el.pts[0][1] * H);
      for (let i = 1; i < el.pts.length; i++) ctx.lineTo(el.pts[i][0] * W, el.pts[i][1] * H);
      if (el.pts.length === 1) ctx.lineTo(el.pts[0][0] * W + 0.1, el.pts[0][1] * H);
      ctx.stroke();
    } else if (el.type === 'rect') {
      ctx.strokeRect(el.x * W, el.y * H, el.w * W, el.h * H);
    } else if (el.type === 'ellipse') {
      ctx.beginPath();
      ctx.ellipse((el.x + el.w / 2) * W, (el.y + el.h / 2) * H, Math.abs(el.w / 2) * W, Math.abs(el.h / 2) * H, 0, 0, Math.PI * 2);
      ctx.stroke();
    } else if (el.type === 'arrow') {
      drawArrow(ctx, el.x0 * W, el.y0 * H, el.x1 * W, el.y1 * H, el.size);
    } else if (el.type === 'line') {
      ctx.beginPath(); ctx.moveTo(el.x0 * W, el.y0 * H); ctx.lineTo(el.x1 * W, el.y1 * H); ctx.stroke();
    } else if (el.type === 'text') {
      ctx.font = fontFor(el); ctx.textBaseline = 'top'; ctx.fillText(el.text, el.x * W, el.y * H);
    }
  }

  // Cadre de sélection autour d'un élément.
  function drawSelection(ctx, el) {
    const b = bbox(el);
    const x = b.x * W - 6, y = b.y * H - 6, w = b.w * W + 12, h = b.h * H + 12;
    ctx.save();
    ctx.strokeStyle = '#8b5cf6'; ctx.lineWidth = 1.5; ctx.setLineDash([6, 4]);
    ctx.strokeRect(x, y, w, h);
    ctx.setLineDash([]); ctx.fillStyle = '#8b5cf6';
    for (const [cx, cy] of [[x, y], [x + w, y], [x, y + h], [x + w, y + h]]) {
      ctx.beginPath(); ctx.arc(cx, cy, 3.5, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  const redraw = useCallback(() => {
    const ctx = ctxRef.current; if (!ctx) return;
    ctx.fillStyle = BG; ctx.fillRect(0, 0, W, H);
    for (const el of elements.current) drawElement(ctx, el);
    if (draft.current) drawElement(ctx, draft.current);
    const sel = elements.current.find((e) => e.id === selectedIdRef.current);
    if (sel) drawSelection(ctx, sel);
  }, []);

  // --- Géométrie : boîte englobante, test de survol, translation ------------
  function bbox(el) {
    if (el.type === 'pen') {
      const xs = el.pts.map((p) => p[0]), ys = el.pts.map((p) => p[1]);
      const x = Math.min(...xs), y = Math.min(...ys);
      return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
    }
    if (el.type === 'line' || el.type === 'arrow') {
      const x = Math.min(el.x0, el.x1), y = Math.min(el.y0, el.y1);
      return { x, y, w: Math.abs(el.x1 - el.x0), h: Math.abs(el.y1 - el.y0) };
    }
    if (el.type === 'text') {
      const ctx = ctxRef.current; ctx.font = fontFor(el);
      const w = ctx.measureText(el.text).width / W;
      return { x: el.x, y: el.y, w, h: Math.max(14, el.size * 6) / H };
    }
    // rect / ellipse : on normalise pour gérer les largeurs/hauteurs négatives
    const x = Math.min(el.x, el.x + el.w), y = Math.min(el.y, el.y + el.h);
    return { x, y, w: Math.abs(el.w), h: Math.abs(el.h) };
  }
  function hitTest(pt) {
    const padX = 8 / W, padY = 8 / H;
    for (let i = elements.current.length - 1; i >= 0; i--) {
      const b = bbox(elements.current[i]);
      if (pt.x >= b.x - padX && pt.x <= b.x + b.w + padX && pt.y >= b.y - padY && pt.y <= b.y + b.h + padY) {
        return elements.current[i];
      }
    }
    return null;
  }
  function translate(el, dx, dy) {
    if (el.type === 'pen') return { ...el, pts: el.pts.map(([x, y]) => [x + dx, y + dy]) };
    if (el.type === 'line' || el.type === 'arrow') return { ...el, x0: el.x0 + dx, y0: el.y0 + dy, x1: el.x1 + dx, y1: el.y1 + dy };
    return { ...el, x: el.x + dx, y: el.y + dy };
  }

  // --- Historique et synchro -------------------------------------------------
  const emitBoard = useCallback((els) => { getSocket().emit(EV.set, { ...key, elements: els }); }, [channelId, dmUserId]); // eslint-disable-line react-hooks/exhaustive-deps
  // Applique un nouvel état : empile l'ancien pour « annuler », vide « refaire ».
  const commit = useCallback((next, prev) => {
    past.current.push(prev);
    if (past.current.length > 60) past.current.shift();
    future.current = [];
    elements.current = next;
    redraw(); bumpHist(); emitBoard(next);
  }, [redraw, emitBoard]);

  function undo() {
    if (!past.current.length) return;
    future.current.push(elements.current);
    elements.current = past.current.pop();
    select(null); redraw(); bumpHist(); emitBoard(elements.current);
  }
  function redo() {
    if (!future.current.length) return;
    past.current.push(elements.current);
    elements.current = future.current.pop();
    select(null); redraw(); bumpHist(); emitBoard(elements.current);
  }
  function deleteSelected() {
    const id = selectedIdRef.current; if (!id) return;
    const prev = elements.current;
    if (!prev.some((e) => e.id === id)) return;
    select(null);
    commit(prev.filter((e) => e.id !== id), prev);
  }
  const clearAll = () => { if (elements.current.length) { select(null); commit([], elements.current); } };

  // --- Connexion temps réel --------------------------------------------------
  useEffect(() => {
    ctxRef.current = canvasRef.current.getContext('2d');
    redraw();
    const socket = getSocket();
    socket.emit(EV.get, key);
    const onInit = (p) => {
      if (!matches(p)) return;
      elements.current = Array.isArray(p.elements) ? p.elements : [];
      if (!elements.current.some((e) => e.id === selectedIdRef.current)) select(null);
      redraw();
    };
    socket.on(EV.init, onInit);
    return () => { socket.off(EV.init, onInit); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelId, dmUserId]);

  // Raccourcis clavier : annuler / refaire / supprimer.
  useEffect(() => {
    const onKey = (e) => {
      if (textBox) return; // saisie de texte en cours : on laisse le champ tranquille
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); }
      else if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); }
      else if ((e.key === 'Delete' || e.key === 'Backspace') && selectedIdRef.current) { e.preventDefault(); deleteSelected(); }
      else if (e.key === 'Escape') { if (selectedIdRef.current) select(null); redraw(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [textBox]);

  // --- Pointeur --------------------------------------------------------------
  function pos(e) {
    const rect = canvasRef.current.getBoundingClientRect();
    const p = e.touches ? e.touches[0] : e;
    return { x: (p.clientX - rect.left) / rect.width, y: (p.clientY - rect.top) / rect.height };
  }
  function draftFrom(a, b) {
    if (tool === 'line' || tool === 'arrow') return { id: newId(), type: tool, x0: a.x, y0: a.y, x1: b.x, y1: b.y, color, size };
    const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
    return { id: newId(), type: tool, x, y, w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y), color, size };
  }

  function down(e) {
    const p = pos(e);
    if (tool === 'text') {
      if (e.cancelable) e.preventDefault(); // évite que le canevas vole le focus au champ
      const rect = canvasRef.current.getBoundingClientRect();
      const src = e.touches ? e.touches[0] : e;
      setTextVal('');
      setTextBox({ x: p.x, y: p.y, left: src.clientX - rect.left, top: src.clientY - rect.top, opened: Date.now() });
      return;
    }
    if (tool === 'select') {
      const hit = hitTest(p);
      select(hit ? hit.id : null);
      op.current = hit ? { kind: 'move', id: hit.id, orig: hit, start: p, prev: elements.current, moved: false } : null;
      redraw();
      return;
    }
    if (tool === 'pen') {
      op.current = { kind: 'draw', prev: elements.current };
      draft.current = { id: newId(), type: 'pen', pts: [[p.x, p.y]], color, size };
      redraw();
      return;
    }
    if (DRAW_TOOLS.has(tool)) {
      op.current = { kind: 'draw', prev: elements.current, start: p };
      draft.current = draftFrom(p, p);
      redraw();
    }
  }
  function move(e) {
    if (!op.current) return;
    e.preventDefault();
    const p = pos(e);
    if (op.current.kind === 'move') {
      const dx = p.x - op.current.start.x, dy = p.y - op.current.start.y;
      if (Math.abs(dx) > 0.0005 || Math.abs(dy) > 0.0005) op.current.moved = true;
      const moved = translate(op.current.orig, dx, dy);
      elements.current = elements.current.map((el) => (el.id === op.current.id ? moved : el));
      redraw();
      return;
    }
    // tracé
    if (tool === 'pen') { draft.current.pts.push([p.x, p.y]); }
    else { draft.current = draftFrom(op.current.start, p); }
    redraw();
  }
  function up() {
    const o = op.current; op.current = null;
    if (!o) return;
    if (o.kind === 'move') {
      if (o.moved) commit(elements.current, o.prev);
      return;
    }
    // fin de tracé : on garde la forme si elle n'est pas minuscule
    const d = draft.current; draft.current = null;
    if (!d) return;
    const b = bbox(d);
    const tiny = d.type === 'pen' ? d.pts.length < 2 : (b.w < 0.004 && b.h < 0.004);
    if (tiny && d.type !== 'pen') { redraw(); return; }
    commit([...o.prev, d], o.prev);
  }

  function commitText() {
    const t = textVal.trim();
    if (t && textBox) {
      const el = { id: newId(), type: 'text', x: textBox.x, y: textBox.y, text: t, color, size };
      commit([...elements.current, el], elements.current);
    }
    setTextBox(null); setTextVal('');
  }
  const cancelText = () => { setTextBox(null); setTextVal(''); };
  // Un blur PARASITE peut survenir juste après l'ouverture (le focus met un
  // instant à se poser) : on le rattrape en refocalisant, sinon on valide.
  function onTextBlur() {
    if (!textVal.trim() && textBox && Date.now() - textBox.opened < 500) {
      requestAnimationFrame(() => textInputRef.current && textInputRef.current.focus());
      return;
    }
    commitText();
  }

  async function publish() {
    setBusy(true);
    try {
      const url = await uploadImage(canvasWithoutSelection());
      onPublish?.(url);
      onClose();
    } catch { setBusy(false); }
  }
  // Rendu propre (sans le cadre de sélection) pour publier / exporter.
  function canvasWithoutSelection() {
    const savedSel = selectedIdRef.current; selectedIdRef.current = null; redraw();
    const data = canvasRef.current.toDataURL('image/png');
    selectedIdRef.current = savedSel; redraw();
    return data;
  }
  function exportPng() {
    const a = document.createElement('a');
    a.href = canvasWithoutSelection();
    a.download = 'tableau-blanc.png';
    a.click();
  }

  const canUndo = past.current.length > 0;
  const canRedo = future.current.length > 0;

  return (
    <div className="board-overlay">
      <div className="board-window">
        <div className="board-toolbar">
          <span className="board-title"><Icon name="palette" /> Tableau blanc</span>
          <div className="board-colors">
            {COLORS.map((c) => (
              <button key={c} className={`board-color ${c === color ? 'active' : ''}`} style={{ background: c }} onClick={() => setColor(c)} />
            ))}
          </div>
          <div className="board-sizes">
            {[2, 4, 8, 16].map((s) => (
              <button key={s} className={size === s ? 'active' : ''} onClick={() => setSize(s)}>{s}</button>
            ))}
          </div>
          <div className="board-spacer" />
          <div className="board-actions">
            <button className="board-tool" onClick={undo} disabled={!canUndo} title="Annuler"><Icon name="rotate-left" /></button>
            <button className="board-tool" onClick={redo} disabled={!canRedo} title="Rétablir"><Icon name="rotate-right" /></button>
            <button className="board-tool" onClick={deleteSelected} disabled={!selectedId} title="Supprimer l’élément sélectionné"><Icon name="trash-can" /></button>
            <button className="board-tool" onClick={clearAll} title="Tout effacer"><Icon name="broom" /></button>
            <button className="board-tool" onClick={exportPng} title="Télécharger en image"><Icon name="download" /></button>
          </div>
          <button className="btn board-publish" onClick={publish} disabled={busy}><Icon name="paper-plane" /> {busy ? 'Envoi…' : 'Publier dans le salon'}</button>
          <button className="board-close" onClick={onClose} title="Fermer"><Icon name="xmark" /></button>
        </div>
        <div className="board-main">
          <div className="board-tools-left">
            {TOOLS.map((t) => (
              <button key={t.id} className={`board-tool ${tool === t.id ? 'active' : ''}`} title={t.title} onClick={() => { setTool(t.id); if (t.id !== 'select') { select(null); redraw(); } }}>
                <Icon name={t.icon} regular={t.reg} />
              </button>
            ))}
          </div>
          <div className="board-canvas-wrap">
            <canvas
              ref={canvasRef}
              width={W}
              height={H}
              className={`board-canvas tool-${tool}`}
              onMouseDown={down} onMouseMove={move} onMouseUp={up} onMouseLeave={up}
              onTouchStart={down} onTouchMove={move} onTouchEnd={up}
            />
            {textBox && (
              <input
                ref={textInputRef}
                className="board-text-input" autoFocus value={textVal}
                style={{ left: `${textBox.left}px`, top: `${textBox.top}px`, color }}
                onChange={(e) => setTextVal(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') commitText(); if (e.key === 'Escape') cancelText(); }}
                onBlur={onTextBlur}
                placeholder="Tapez, Entrée pour valider"
              />
            )}
          </div>
        </div>
        <div className="board-hint">
          <Icon name="circle-info" /> Astuce : l’outil <strong>Sélectionner</strong> déplace une forme (glisser) ou la supprime (touche Suppr). <kbd>Ctrl</kbd>+<kbd>Z</kbd> pour annuler.
        </div>
      </div>
    </div>
  );
}
