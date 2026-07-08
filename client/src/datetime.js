// Formatage de la date/heure des messages.
// Les horodatages viennent de SQLite en UTC ("YYYY-MM-DD HH:MM:SS").

function parseTs(ts) {
  if (ts instanceof Date) return ts;
  return new Date(String(ts).replace(' ', 'T') + 'Z');
}

const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

/** Heure seule : "14:30". */
export function formatTime(ts) {
  return parseTs(ts).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

/** Heure + date relative : "14:30", "Hier 14:30", "Avant-hier 14:30",
 *  puis "07/07/2026 14:30" au-delà de deux jours. */
export function formatTimeDate(ts) {
  const d = parseTs(ts);
  const time = formatTime(d);
  const days = Math.round((startOfDay(new Date()) - startOfDay(d)) / 86400000);
  if (days <= 0) return time;
  if (days === 1) return `Hier ${time}`;
  if (days === 2) return `Avant-hier ${time}`;
  const date = d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  return `${date} ${time}`;
}
