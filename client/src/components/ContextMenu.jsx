import { useEffect, useState } from 'react';
import Icon from './Icon.jsx';
import { getMenu, subscribeMenu, closeMenu } from '../contextmenu.js';

/** Rendu du menu contextuel de l'app (positionné au curseur, fermé au clic ailleurs / Échap). */
export default function ContextMenu() {
  const [s, setS] = useState(getMenu());

  useEffect(() => subscribeMenu(setS), []);

  useEffect(() => {
    if (!s.open) return;
    const close = () => closeMenu();
    const onKey = (e) => e.key === 'Escape' && closeMenu();
    window.addEventListener('click', close);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('click', close);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
      window.removeEventListener('keydown', onKey);
    };
  }, [s.open]);

  if (!s.open) return null;

  const height = s.items.reduce((h, it) => h + (it.sep ? 9 : 34), 0) + 10;
  const left = Math.min(s.x, window.innerWidth - 232);
  const top = Math.min(s.y, window.innerHeight - height - 8);

  return (
    <div className="context-menu" style={{ left, top }} onClick={(e) => e.stopPropagation()} onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); }}>
      {s.items.map((it, i) => (
        it.sep
          ? <div key={i} className="cm-sep" />
          : (
            <button key={i} className={`cm-item ${it.danger ? 'danger' : ''}`} onClick={() => { closeMenu(); it.onClick?.(); }}>
              {it.icon && <span className="cm-ico"><Icon name={it.icon} /></span>}
              {it.label}
            </button>
          )
      ))}
    </div>
  );
}
