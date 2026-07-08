import { api } from '../api.js';
import Icon from './Icon.jsx';

/** Bouton marque-page : enregistre le message (sans rappel), ou le retire s'il l'est déjà.
 *  `existing` = l'enregistrement de ce message (ou undefined). Visible de l'utilisateur seul. */
export default function BookmarkButton({ content, attachmentUrl, authorName, source, sourceMessageId, existing }) {
  const saved = !!existing;

  async function toggle() {
    try {
      if (existing) {
        await api(`/saved/${existing.id}`, { method: 'DELETE' });
      } else {
        await api('/saved', { method: 'POST', body: { content, attachment_url: attachmentUrl, author_name: authorName, source, source_message_id: sourceMessageId } });
      }
      window.dispatchEvent(new Event('pulsar:saved-changed'));
    } catch { /* ignore */ }
  }

  return (
    <button className={saved ? 'active' : ''} title={saved ? 'Retirer des enregistrés' : 'Enregistrer le message'} onClick={toggle}>
      <Icon name="bookmark" regular={!saved} />
    </button>
  );
}
