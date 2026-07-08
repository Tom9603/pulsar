import { useEffect } from 'react';
import { createPortal } from 'react-dom';

/** Fenêtre modale réutilisable : ferme sur clic backdrop ou touche Échap.
 *  Rendue dans un portail sur <body> pour rester centrée et couvrir tout l'écran,
 *  même si un parent a un filtre/transform (ex. la barre du haut). */
export default function Modal({ children, onClose, className = '' }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return createPortal(
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className={`modal ${className}`} onMouseDown={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>,
    document.body,
  );
}
