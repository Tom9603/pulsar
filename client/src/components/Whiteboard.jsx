import { useEffect, useRef, useState } from 'react';
import { getSocket } from '../socket.js';
import { uploadImage } from '../api.js';
import Icon from './Icon.jsx';

const W = 1000, H = 600;
const BG = '#1b1e27';
const COLORS = ['#ffffff', '#14b8a6', '#ED4245', '#FAA61A', '#57F287', '#3498DB', '#EB459E', '#111111'];
const TOOLS = [
  { id: 'pen', icon: 'pen', title: 'Stylo' },
  { id: 'line', icon: 'minus', title: 'Ligne' },
  { id: 'arrow', icon: 'arrow-right', title: 'Flèche' },
  { id: 'rect', icon: 'vector-square', title: 'Rectangle' },
  { id: 'square', icon: 'square', reg: true, title: 'Carré' },
  { id: 'ellipse', icon: 'circle', reg: true, title: 'Cercle' },
  { id: 'text', icon: 'font', title: 'Texte' },
  { id: 'eraser', icon: 'eraser', title: 'Gomme' },
];
const SHAPES = new Set(['line', 'arrow', 'rect', 'square', 'ellipse']);

/** Tableau blanc partagé (temps réel par salon) : outils riches à gauche + publication dans le salon. */
export default function Whiteboard({ channelId, onClose, onPublish }) {
  const canvasRef = useRef(null);
  const ctxRef = useRef(null);
  const drawing = useRef(false);
  const last = useRef(null);
  const start = useRef(null);
  const snapshot = useRef(null);
  const [color, setColor] = useState('#14b8a6');
  const [size, setSize] = useState(4);
  const [tool, setTool] = useState('pen');
  const [textBox, setTextBox] = useState(null);
  const [textVal, setTextVal] = useState('');
  const [busy, setBusy] = useState(false);

  function drawArrow(ctx, x0, y0, x1, y1, s) {
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
    const ang = Math.atan2(y1 - y0, x1 - x0);
    const len = Math.max(12, s * 3.5);
    ctx.beginPath();
    ctx.moveTo(x1, y1); ctx.lineTo(x1 - len * Math.cos(ang - Math.PI / 6), y1 - len * Math.sin(ang - Math.PI / 6));
    ctx.moveTo(x1, y1); ctx.lineTo(x1 - len * Math.cos(ang + Math.PI / 6), y1 - len * Math.sin(ang + Math.PI / 6));
    ctx.stroke();
  }

  function drawSeg(s) {
    const ctx = ctxRef.current;
    ctx.strokeStyle = s.color; ctx.fillStyle = s.color; ctx.lineWidth = s.size;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    if (s.type === 'rect') {
      ctx.strokeRect(s.x * W, s.y * H, s.w * W, s.h * H);
    } else if (s.type === 'ellipse') {
      ctx.beginPath();
      ctx.ellipse((s.x + s.w / 2) * W, (s.y + s.h / 2) * H, (s.w / 2) * W, (s.h / 2) * H, 0, 0, Math.PI * 2);
      ctx.stroke();
    } else if (s.type === 'arrow') {
      drawArrow(ctx, s.x0 * W, s.y0 * H, s.x1 * W, s.y1 * H, s.size);
    } else if (s.type === 'text') {
      ctx.font = `600 ${Math.max(14, s.size * 6)}px system-ui, -apple-system, sans-serif`;
      ctx.textBaseline = 'top';
      ctx.fillText(s.text, s.x * W, s.y * H);
    } else {
      ctx.beginPath();
      ctx.moveTo(s.x0 * W, s.y0 * H);
      ctx.lineTo(s.x1 * W, s.y1 * H);
      ctx.stroke();
    }
  }
  function fill() { const ctx = ctxRef.current; ctx.fillStyle = BG; ctx.fillRect(0, 0, W, H); }
  const emit = (stroke) => { drawSeg(stroke); getSocket().emit('board:draw', { channelId, stroke }); };

  useEffect(() => {
    ctxRef.current = canvasRef.current.getContext('2d');
    fill();
    const socket = getSocket();
    socket.emit('board:get', { channelId });
    const onInit = ({ channelId: cid, strokes }) => { if (cid === channelId) { fill(); strokes.forEach(drawSeg); } };
    const onDraw = ({ channelId: cid, stroke }) => { if (cid === channelId) drawSeg(stroke); };
    const onClear = ({ channelId: cid }) => { if (cid === channelId) fill(); };
    socket.on('board:init', onInit);
    socket.on('board:draw', onDraw);
    socket.on('board:clear', onClear);
    return () => { socket.off('board:init', onInit); socket.off('board:draw', onDraw); socket.off('board:clear', onClear); };
  }, [channelId]);

  function pos(e) {
    const rect = canvasRef.current.getBoundingClientRect();
    const p = e.touches ? e.touches[0] : e;
    return { x: (p.clientX - rect.left) / rect.width, y: (p.clientY - rect.top) / rect.height };
  }

  // Calcule le trait final d'une forme à partir des points de départ et d'arrivée.
  function shapeStroke(a, b) {
    if (tool === 'line') return { x0: a.x, y0: a.y, x1: b.x, y1: b.y, color, size };
    if (tool === 'arrow') return { type: 'arrow', x0: a.x, y0: a.y, x1: b.x, y1: b.y, color, size };
    let dx = b.x - a.x, dy = b.y - a.y;
    if (tool === 'square') { const s = Math.max(Math.abs(dx), Math.abs(dy)); dx = Math.sign(dx || 1) * s; dy = Math.sign(dy || 1) * s; }
    const x = Math.min(a.x, a.x + dx), y = Math.min(a.y, a.y + dy);
    return { type: tool === 'ellipse' ? 'ellipse' : 'rect', x, y, w: Math.abs(dx), h: Math.abs(dy), color, size };
  }

  function down(e) {
    const p = pos(e);
    if (tool === 'text') {
      const rect = canvasRef.current.getBoundingClientRect();
      const src = e.touches ? e.touches[0] : e;
      setTextVal('');
      setTextBox({ x: p.x, y: p.y, left: src.clientX - rect.left, top: src.clientY - rect.top });
      return;
    }
    drawing.current = true;
    last.current = p;
    start.current = p;
    if (SHAPES.has(tool)) snapshot.current = ctxRef.current.getImageData(0, 0, W, H);
  }
  function move(e) {
    if (!drawing.current) return;
    e.preventDefault();
    const p = pos(e);
    if (SHAPES.has(tool)) {
      ctxRef.current.putImageData(snapshot.current, 0, 0);
      drawSeg(shapeStroke(start.current, p));
      return;
    }
    const stroke = { x0: last.current.x, y0: last.current.y, x1: p.x, y1: p.y, color: tool === 'eraser' ? BG : color, size: tool === 'eraser' ? size * 4 : size };
    emit(stroke);
    last.current = p;
  }
  function up(e) {
    if (!drawing.current) return;
    if (SHAPES.has(tool) && start.current && snapshot.current) {
      const src = e.changedTouches ? { clientX: e.changedTouches[0].clientX, clientY: e.changedTouches[0].clientY } : e;
      const p = pos(src);
      ctxRef.current.putImageData(snapshot.current, 0, 0);
      const st = shapeStroke(start.current, p);
      const big = (st.w > 0.004 || st.h > 0.004 || Math.abs((st.x1 ?? 0) - (st.x0 ?? 0)) > 0.004 || Math.abs((st.y1 ?? 0) - (st.y0 ?? 0)) > 0.004);
      if (big) emit(st);
      snapshot.current = null;
    }
    drawing.current = false;
  }

  function commitText() {
    const t = textVal.trim();
    if (t && textBox) emit({ type: 'text', x: textBox.x, y: textBox.y, text: t, color, size });
    setTextBox(null); setTextVal('');
  }

  const clear = () => getSocket().emit('board:clear', { channelId });

  async function publish() {
    setBusy(true);
    try {
      const url = await uploadImage(canvasRef.current.toDataURL('image/png'));
      onPublish?.(url);
      onClose();
    } catch { setBusy(false); }
  }

  return (
    <div className="board-overlay">
      <div className="board-window">
        <div className="board-toolbar">
          <span className="board-title"><Icon name="palette" /> Tableau blanc</span>
          <div className="board-colors">
            {COLORS.map((c) => (
              <button key={c} className={`board-color ${tool !== 'eraser' && c === color ? 'active' : ''}`} style={{ background: c }} onClick={() => { setColor(c); if (tool === 'eraser') setTool('pen'); }} />
            ))}
          </div>
          <div className="board-sizes">
            {[2, 4, 8, 16].map((s) => (
              <button key={s} className={size === s ? 'active' : ''} onClick={() => setSize(s)}>{s}</button>
            ))}
          </div>
          <div className="board-spacer" />
          <button className="board-tool" onClick={clear} title="Tout effacer"><Icon name="trash" /></button>
          <button className="btn board-publish" onClick={publish} disabled={busy}><Icon name="paper-plane" /> {busy ? 'Envoi…' : 'Publier dans le salon'}</button>
          <button className="board-close" onClick={onClose} title="Fermer"><Icon name="xmark" /></button>
        </div>
        <div className="board-main">
          <div className="board-tools-left">
            {TOOLS.map((t) => (
              <button key={t.id} className={`board-tool ${tool === t.id ? 'active' : ''}`} title={t.title} onClick={() => setTool(t.id)}>
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
                className="board-text-input" autoFocus value={textVal}
                style={{ left: `${textBox.left}px`, top: `${textBox.top}px`, color }}
                onChange={(e) => setTextVal(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') commitText(); if (e.key === 'Escape') { setTextBox(null); setTextVal(''); } }}
                onBlur={commitText}
                placeholder="Tapez, Entrée pour valider"
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
