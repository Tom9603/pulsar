import { useEffect, useRef, useState } from 'react';
import { getSocket } from '../socket.js';
import { uploadImage } from '../api.js';
import Icon from './Icon.jsx';

const W = 1000, H = 600;
const BG = '#1b1e27';
const COLORS = ['#ffffff', '#14b8a6', '#ED4245', '#FAA61A', '#57F287', '#3498DB', '#EB459E', '#111111'];

/** Tableau blanc partagé (temps réel par salon) : stylo, rectangle, texte, gomme + publication dans le salon. */
export default function Whiteboard({ channelId, onClose, onPublish }) {
  const canvasRef = useRef(null);
  const ctxRef = useRef(null);
  const drawing = useRef(false);
  const last = useRef(null);
  const start = useRef(null);
  const snapshot = useRef(null);
  const [color, setColor] = useState('#14b8a6');
  const [size, setSize] = useState(4);
  const [tool, setTool] = useState('pen'); // pen | rect | text | eraser
  const [textBox, setTextBox] = useState(null); // { x, y, left, top } saisie de texte
  const [textVal, setTextVal] = useState('');
  const [busy, setBusy] = useState(false);

  function drawSeg(s) {
    const ctx = ctxRef.current;
    ctx.strokeStyle = s.color; ctx.fillStyle = s.color; ctx.lineWidth = s.size;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    if (s.type === 'rect') {
      ctx.strokeRect(s.x * W, s.y * H, s.w * W, s.h * H);
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

  function down(e) {
    const p = pos(e);
    if (tool === 'text') {
      const rect = canvasRef.current.getBoundingClientRect();
      setTextVal('');
      setTextBox({ x: p.x, y: p.y, left: (e.touches ? e.touches[0] : e).clientX - rect.left, top: (e.touches ? e.touches[0] : e).clientY - rect.top });
      return;
    }
    drawing.current = true;
    last.current = p;
    start.current = p;
    if (tool === 'rect') snapshot.current = ctxRef.current.getImageData(0, 0, W, H);
  }
  function move(e) {
    if (!drawing.current) return;
    e.preventDefault();
    const p = pos(e);
    if (tool === 'rect') {
      ctxRef.current.putImageData(snapshot.current, 0, 0);
      const ctx = ctxRef.current;
      ctx.strokeStyle = color; ctx.lineWidth = size;
      ctx.strokeRect(start.current.x * W, start.current.y * H, (p.x - start.current.x) * W, (p.y - start.current.y) * H);
      return;
    }
    const stroke = { x0: last.current.x, y0: last.current.y, x1: p.x, y1: p.y, color: tool === 'eraser' ? BG : color, size: tool === 'eraser' ? size * 4 : size };
    emit(stroke);
    last.current = p;
  }
  function up(e) {
    if (!drawing.current) return;
    if (tool === 'rect' && start.current) {
      const p = pos(e.changedTouches ? { clientX: e.changedTouches[0].clientX, clientY: e.changedTouches[0].clientY } : e);
      const x = Math.min(start.current.x, p.x), y = Math.min(start.current.y, p.y);
      const w = Math.abs(p.x - start.current.x), h = Math.abs(p.y - start.current.y);
      snapshot.current = null;
      if (w > 0.004 || h > 0.004) emit({ type: 'rect', x, y, w, h, color, size });
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

  const tools = [
    { id: 'pen', icon: 'pen', title: 'Stylo' },
    { id: 'rect', icon: 'square', title: 'Rectangle' },
    { id: 'text', icon: 'font', title: 'Texte' },
    { id: 'eraser', icon: 'eraser', title: 'Gomme' },
  ];

  return (
    <div className="board-overlay">
      <div className="board-window">
        <div className="board-toolbar">
          <span className="board-title"><Icon name="palette" /> Tableau blanc</span>
          <div className="board-tools">
            {tools.map((t) => (
              <button key={t.id} className={`board-tool ${tool === t.id ? 'active' : ''}`} title={t.title} onClick={() => setTool(t.id)}><Icon name={t.icon} /></button>
            ))}
          </div>
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
  );
}
