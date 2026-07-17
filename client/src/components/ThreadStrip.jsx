import Avatar from './Avatar.jsx';
import Icon from './Icon.jsx';

/** « il y a 3 min », « hier »… (repère court, sans surcharger la ligne) */
function ago(ts) {
  const then = new Date(String(ts).replace(' ', 'T') + 'Z');
  const mins = Math.round((Date.now() - then) / 60000);
  if (mins < 1) return "à l'instant";
  if (mins < 60) return `il y a ${mins} min`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `il y a ${hours} h`;
  const days = Math.round(hours / 24);
  if (days === 1) return 'hier';
  if (days < 7) return `il y a ${days} jours`;
  return then.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
}

/**
 * Ligne discrète sous un message qui a un fil.
 * Volontairement compacte : elle informe et invite à ouvrir, sans rivaliser
 * avec le message lui-même.
 */
export default function ThreadStrip({ thread, active, onOpen }) {
  if (!thread || !thread.reply_count) return null;
  const n = thread.reply_count;
  return (
    <button className={`thread-strip ${active ? 'active' : ''}`} onClick={onOpen}>
      <span className="ts-faces">
        {thread.participants.map((p) => <Avatar key={p.id} user={p} size={18} />)}
      </span>
      <span className="ts-count">{n} réponse{n > 1 ? 's' : ''}</span>
      <span className="ts-when">{ago(thread.last_reply_at)}</span>
      <span className="ts-go"><Icon name="chevron-right" /></span>
    </button>
  );
}
