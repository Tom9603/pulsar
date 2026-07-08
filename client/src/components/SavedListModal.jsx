import Modal from './Modal.jsx';
import Icon from './Icon.jsx';
import SavedPanel from './SavedPanel.jsx';

/** Fenêtre de consultation, ouverte depuis la barre du haut :
 *  mode 'saved' = messages enregistrés · mode 'reminders' = rappels. */
export default function SavedListModal({ mode, currentUser, onClose }) {
  const reminders = mode === 'reminders';
  return (
    <Modal onClose={onClose} className="modal-saved">
      <h2><Icon name={reminders ? 'clock' : 'bookmark'} /> {reminders ? 'Mes rappels' : 'Messages enregistrés'}</h2>
      <p className="modal-sub">
        {reminders
          ? 'Les messages que vous vous êtes fait rappeler. Vous seul les voyez.'
          : 'Les messages que vous avez mis de côté. Vous seul les voyez.'}
      </p>
      <SavedPanel currentUser={currentUser} embedded filter={reminders ? 'reminders' : 'saved'} />
      <div className="modal-actions">
        <button className="btn" onClick={onClose}>Fermer</button>
      </div>
    </Modal>
  );
}
