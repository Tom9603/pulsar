import { useEffect } from 'react';

/** Fenêtre modale réutilisable : ferme sur clic backdrop ou touche Échap. */
export default function Modal({ children, onClose, className = '' }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className={`modal ${className}`} onMouseDown={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}
