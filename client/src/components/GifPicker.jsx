import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import Icon from './Icon.jsx';

/** Panneau de recherche de GIF (Tenor). Clique un GIF pour l'envoyer. */
export default function GifPicker({ onSelect, onClose }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const debounce = useRef(null);

  useEffect(() => {
    setLoading(true);
    clearTimeout(debounce.current);
    debounce.current = setTimeout(() => {
      api(`/gifs?q=${encodeURIComponent(query)}`)
        .then(({ results }) => setResults(results || []))
        .catch(() => setResults([]))
        .finally(() => setLoading(false));
    }, 350);
    return () => clearTimeout(debounce.current);
  }, [query]);

  return (
    <div className="gif-panel">
      <div className="gif-head">
        <input
          autoFocus
          placeholder="Rechercher un GIF…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button type="button" title="Fermer" onClick={onClose}><Icon name="xmark" /></button>
      </div>
      <div className="gif-grid">
        {loading && <div className="gif-empty">Chargement…</div>}
        {!loading && results.length === 0 && <div className="gif-empty">Aucun GIF trouvé.</div>}
        {results.map((g) => (
          <img
            key={g.id}
            src={g.preview}
            alt={g.desc}
            loading="lazy"
            onClick={() => onSelect(g.url)}
          />
        ))}
      </div>
      <div className="gif-credit">Propulsé par Tenor</div>
    </div>
  );
}
