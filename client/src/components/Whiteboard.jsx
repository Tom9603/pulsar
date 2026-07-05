import { useEffect, useRef, useState } from 'react';
import { getSocket } from '../socket.js';
import Icon from './Icon.jsx';

const W = 1000, H = 600;
const BG = '#1b1e27';
const COLORS = ['#ffffff', '#14b8a6', '#ED4245', '#FAA61A', '#57F287', '#3498DB', '#EB459E', '#111111'];

/** Tableau blanc partagé (dessin temps réel synchronisé par salon). */
export default function Whiteboard({ channelId, onClose }) {
  const canvasRef = useRef(null);
  const ctxRef = useRef(null);
  const drawing = useRef(false);
  const last = useRef(null);
  const [color, setColor] = useState('#14b8a6');
  const [size, setSize] = useState(4);
  const [eraser, setEraser] = useState(false);

  function drawSeg(s) {
    const ctx = ctxRef.current;
    ctx.strokeStyle = s.color;
    ctx.lineWidth = s.size;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(s.x0 * W, s.y0 * H);
    ctx.lineTo(s.x1 * W, s.y1 * H);
    ctx.stroke();
  }
  function fill() { const ctx = ctxRef.current; ctx.fillStyle = BG; ctx.fillRect(0, 0, W, H); }

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
  function down(e) { drawing.current = true; last.current = pos(e); }
  function move(e) {
    if (!drawing.current) return;
    e.preventDefault();
    const p = pos(e);
    const stroke = { x0: last.current.x, y0: last.current.y, x1: p.x, y1: p.y, color: eraser ? BG : color, size: eraser ? size * 4 : size };
    drawSeg(stroke);
    getSocket().emit('board:draw', { channelId, stroke });
    last.current = p;
  }
  const up = () => { drawing.current = false; };
  const clear = () => getSocket().emit('board:clear', { channelId });

  return (
    <div className="board-overlay">
      <div className="board-window">
        <div className="board-toolbar">
          <span className="board-title"><Icon name="palette" /> Tableau blanc partagé</span>
          <div className="board-colors">
            {COLORS.map((c) => (
              <button key={c} className={`board-color ${!eraser && c === color ? 'active' : ''}`} style={{ background: c }} onClick={() => { setColor(c); setEraser(false); }} />
            ))}
          </div>
          <div className="board-sizes">
            {[2, 4, 8, 16].map((s) => (
              <button key={s} className={size === s ? 'active' : ''} onClick={() => setSize(s)}>{s}</button>
            ))}
          </div>
          <button className={`board-tool ${eraser ? 'active' : ''}`} onClick={() => setEraser((v) => !v)} title="Gomme"><Icon name="eraser" /></button>
          <button className="board-tool" onClick={clear} title="Tout effacer"><Icon name="trash" /></button>
          <button className="board-close" onClick={onClose} title="Fermer"><Icon name="xmark" /></button>
        </div>
        <canvas
          ref={canvasRef}
          width={W}
          height={H}
          className="board-canvas"
          onMouseDown={down} onMouseMove={move} onMouseUp={up} onMouseLeave={up}
          onTouchStart={down} onTouchMove={move} onTouchEnd={up}
        />
      </div>
    </div>
  );
}
