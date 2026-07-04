// Rendu de texte enrichi type Discord : **gras**, *italique*, __souligné__,
// ~~barré~~, `code`, ```blocs```, liens cliquables, et mentions @pseudo.
// On construit des nœuds React (pas de innerHTML) → pas de risque XSS.

// Motif partagé sous forme de chaîne : on crée une NOUVELLE regex à chaque appel
// (indispensable car renderRich est récursif — une regex globale partagée aurait
// son lastIndex corrompu par les appels imbriqués → boucle infinie).
const TOKEN_SRC = '(```[\\s\\S]+?```)|(`[^`]+?`)|(\\*\\*[^*]+?\\*\\*)|(__[^_]+?__)|(\\*[^*]+?\\*)|(_[^_]+?_)|(~~[^~]+?~~)|(https?:\\/\\/[^\\s]+)|(@[\\w.-]+)';

export function renderRich(text, currentUser, keyPrefix = 'r') {
  if (!text) return null;
  const re = new RegExp(TOKEN_SRC, 'g');
  const nodes = [];
  let last = 0;
  let m;
  let i = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    const key = `${keyPrefix}${i++}`;
    if (m[1]) nodes.push(<pre className="md-block" key={key}>{m[1].slice(3, -3).replace(/^\n/, '')}</pre>);
    else if (m[2]) nodes.push(<code className="md-code" key={key}>{m[2].slice(1, -1)}</code>);
    else if (m[3]) nodes.push(<strong key={key}>{renderRich(m[3].slice(2, -2), currentUser, key)}</strong>);
    else if (m[4]) nodes.push(<u key={key}>{renderRich(m[4].slice(2, -2), currentUser, key)}</u>);
    else if (m[5]) nodes.push(<em key={key}>{renderRich(m[5].slice(1, -1), currentUser, key)}</em>);
    else if (m[6]) nodes.push(<em key={key}>{renderRich(m[6].slice(1, -1), currentUser, key)}</em>);
    else if (m[7]) nodes.push(<del key={key}>{renderRich(m[7].slice(2, -2), currentUser, key)}</del>);
    else if (m[8]) nodes.push(<a className="md-link" href={m[8]} target="_blank" rel="noopener noreferrer" key={key}>{m[8]}</a>);
    else if (m[9]) {
      const tag = m[9];
      const low = tag.toLowerCase();
      const isMe = currentUser && (low === '@' + currentUser.username.toLowerCase() || low === '@' + currentUser.display_name.toLowerCase());
      nodes.push(<span className={`mention ${isMe ? 'mention-me' : ''}`} key={key}>{tag}</span>);
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

/** Le texte contient-il une mention de l'utilisateur ? */
export function mentionsUser(content, user) {
  if (!content) return false;
  const low = content.toLowerCase();
  return low.includes('@' + user.username.toLowerCase()) || low.includes('@' + user.display_name.toLowerCase());
}
