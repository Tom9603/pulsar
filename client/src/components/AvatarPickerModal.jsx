import Modal from './Modal.jsx';
import Icon from './Icon.jsx';
import { AVATAR_GROUPS } from '../avatars.js';

/**
 * Choix d'un avatar prêt à l'emploi, rangé par STYLE (Personnes, Robots…).
 * `onPick(url)` reçoit l'avatar choisi ; à l'appelant de l'appliquer/fermer.
 */
export default function AvatarPickerModal({ onPick, onClose }) {
  return (
    <Modal onClose={onClose} className="modal-avatar-picker">
      <h2><Icon name="user-astronaut" /> Choisir un avatar</h2>
      <p className="modal-sub">Des styles variés, tous libres de droit. Cliquez sur celui qui vous ressemble.</p>

      <div className="avatar-picker-body">
        {AVATAR_GROUPS.map((g) => (
          <div className="avatar-group" key={g.key}>
            <div className="avatar-group-title">{g.label} <span>{g.avatars.length}</span></div>
            <div className="avatar-picker-grid">
              {g.avatars.map((url) => (
                <button type="button" key={url} className="avatar-preset" title="Choisir cet avatar" onClick={() => onPick(url)}>
                  <img src={url} alt="" loading="lazy" />
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="modal-actions">
        <button className="btn btn-ghost" onClick={onClose}>Fermer</button>
      </div>
    </Modal>
  );
}
