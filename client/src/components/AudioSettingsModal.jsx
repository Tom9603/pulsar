import Modal from './Modal.jsx';
import Icon from './Icon.jsx';
import AudioSettingsPanel from './AudioSettingsPanel.jsx';

/** Sur-modale : tous les réglages audio (entrée / sortie), tests et réinitialisation. */
export default function AudioSettingsModal({ onClose }) {
  return (
    <Modal onClose={onClose} className="modal-audio">
      <h2><Icon name="sliders" /> Paramètres audio</h2>
      <AudioSettingsPanel />
      <div className="modal-actions">
        <button className="btn" onClick={onClose}>Terminé</button>
      </div>
    </Modal>
  );
}
