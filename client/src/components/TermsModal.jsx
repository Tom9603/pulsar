import { useRef, useState } from 'react';
import Modal from './Modal.jsx';
import Icon from './Icon.jsx';
import { Terms, Privacy } from '../legal.jsx';

/**
 * Conditions générales et politique de confidentialité.
 *
 * - Mode lecture seule (« onAccept » absent) : simple consultation.
 * - Mode acceptation : case à cocher en bas, puis bouton « J'accepte ».
 *   Une fois accepté ici, la case de l'inscription est cochée toute seule.
 */
export default function TermsModal({ tab: initial = 'terms', onAccept, onClose }) {
  const [tab, setTab] = useState(initial);
  const [checked, setChecked] = useState(false);
  const [seenEnd, setSeenEnd] = useState(false); // le texte a été parcouru jusqu'au bout
  const scroller = useRef(null);

  // On n'exige pas la lecture, mais on signale si le bas n'a pas été atteint :
  // cocher sans avoir rien vu défiler est le travers habituel de ces fenêtres.
  function onScroll(e) {
    const el = e.currentTarget;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 40) setSeenEnd(true);
  }

  const toEnd = () => {
    const el = scroller.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  };

  return (
    <Modal className="terms-modal" onClose={onClose}>
      <div className="tm-head">
        <h2>Conditions d’utilisation</h2>
        <button className="tm-close" onClick={onClose} title="Fermer"><Icon name="xmark" /></button>
      </div>

      <div className="tm-tabs">
        <button className={tab === 'terms' ? 'active' : ''} onClick={() => setTab('terms')}>
          Conditions générales
        </button>
        <button className={tab === 'privacy' ? 'active' : ''} onClick={() => setTab('privacy')}>
          Données personnelles
        </button>
      </div>

      <div className="tm-scroll legal" ref={scroller} onScroll={onScroll}>
        {tab === 'terms' ? <Terms /> : <Privacy />}
      </div>

      {onAccept ? (
        <div className="tm-foot">
          <label className="tm-check">
            <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} />
            <span>
              J’ai lu et j’accepte les conditions générales d’utilisation et la politique de
              confidentialité, et je certifie avoir au moins 15 ans.
            </span>
          </label>
          <div className="tm-actions">
            {!seenEnd && <button className="linklike tm-toend" onClick={toEnd}>Aller à la fin du texte</button>}
            <span className="spacer" />
            <button className="btn-ghost" onClick={onClose}>Annuler</button>
            <button className="btn" disabled={!checked} onClick={onAccept}>J’accepte</button>
          </div>
        </div>
      ) : (
        <div className="tm-foot">
          <div className="tm-actions">
            <span className="spacer" />
            <button className="btn" onClick={onClose}>Fermer</button>
          </div>
        </div>
      )}
    </Modal>
  );
}
