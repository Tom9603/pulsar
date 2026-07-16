// Pastille de statut personnalisé (emoji + texte), masquée si vide ou expirée.
export default function CustomStatus({ user, className = '' }) {
  const text = user?.custom_status;
  if (!text) return null;
  const until = user.custom_status_until;
  if (until && until * 1000 <= Date.now()) return null; // expiré : on n'affiche pas
  return (
    <span className={`custom-status ${className}`}>
      {user.custom_status_emoji ? <span className="cs-badge-emoji">{user.custom_status_emoji}</span> : null}
      <span className="cs-badge-text">{text}</span>
    </span>
  );
}
