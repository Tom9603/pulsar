import { useEffect, useLayoutEffect, useRef, useState } from 'react';

/**
 * Bouton segmenté (bascule) avec surligneur qui GLISSE d'une option à l'autre.
 *
 * Le surligneur est un élément à part, posé derrière les boutons : on mesure la
 * position et la largeur de l'option active, puis on l'y déplace en transition.
 * C'est ce qui donne le glissement, impossible avec un simple fond qui saute.
 *
 * options : [{ value, label }]
 */
export default function Segmented({ options, value, onChange, className = '' }) {
  const ref = useRef(null);
  const [pill, setPill] = useState(null); // { left, width } | null tant qu'on n'a pas mesuré

  // useLayoutEffect : on place le surligneur avant que le navigateur ne peigne,
  // pour éviter un saut visible au premier rendu.
  useLayoutEffect(() => {
    const root = ref.current;
    if (!root) return;
    const active = root.querySelector('[data-active="true"]');
    if (!active) { setPill(null); return; }
    setPill({ left: active.offsetLeft, width: active.offsetWidth });
  }, [value, options]);

  // Les largeurs changent si un compteur apparaît (« · 3 ») : on suit le redimensionnement.
  useEffect(() => {
    if (!ref.current || typeof ResizeObserver === 'undefined') return;
    const obs = new ResizeObserver(() => {
      const active = ref.current?.querySelector('[data-active="true"]');
      if (active) setPill({ left: active.offsetLeft, width: active.offsetWidth });
    });
    obs.observe(ref.current);
    return () => obs.disconnect();
  }, []);

  return (
    <div className={`seg ${className}`} ref={ref}>
      {pill && <span className="seg-pill" style={{ transform: `translateX(${pill.left}px)`, width: pill.width }} />}
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          data-active={value === o.value}
          className={value === o.value ? 'active' : ''}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
