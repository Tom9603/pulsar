import { useEffect, useRef, useState } from 'react';
import Modal from './Modal.jsx';
import { api } from '../api.js';
import Avatar from './Avatar.jsx';

function formatDate(ts) {
  return new Date(ts.replace(' ', 'T') + 'Z').toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

/** Recherche de messages dans le serveur actif. */
export default function SearchModal({ serverId, onClose, onJump }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const debounce = useRef(null);

  useEffect(() => {
    clearTimeout(debounce.current);
    if (q.trim().length < 2) { setResults([]); return; }
    setLoading(true);
    debounce.current = setTimeout(() => {
      api(`/servers/${serverId}/search?q=${encodeURIComponent(q.trim())}`)
        .then(({ results }) => setResults(results))
        .catch(() => setResults([]))
        .finally(() => setLoading(false));
    }, 300);
    return () => clearTimeout(debounce.current);
  }, [q, serverId]);

  return (
    <Modal onClose={onClose}>
      <h2>Rechercher</h2>
      <div className="field">
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher des messages…" />
      </div>
      <div className="search-results">
        {loading && <div className="search-empty">Recherche…</div>}
        {!loading && q.trim().length >= 2 && results.length === 0 && <div className="search-empty">Aucun résultat.</div>}
        {results.map((r) => (
          <div className="search-item" key={r.id} onClick={() => { onJump(r.channel_id); onClose(); }}>
            <Avatar user={r} size={28} />
            <div>
              <div className="search-meta"><strong>{r.display_name}</strong> · #{r.channel_name} · {formatDate(r.created_at)}</div>
              <div className="search-text">{r.content}</div>
            </div>
          </div>
        ))}
      </div>
    </Modal>
  );
}
