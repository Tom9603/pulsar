import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api.js';
import { mediaUrl } from '../api.js';
import Modal from './Modal.jsx';
import Icon from './Icon.jsx';
import Avatar from './Avatar.jsx';

const GROUP_LABELS = {
  servers: 'Serveurs',
  channels: 'Salons',
  people: 'Personnes',
  messages: 'Messages',
};

const extract = (ts) => new Date(String(ts).replace(' ', 'T') + 'Z')
  .toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });

/** Met en évidence la partie recherchée, sans casser la casse d'origine. */
function Highlight({ text, q }) {
  const i = q ? text.toLowerCase().indexOf(q.toLowerCase()) : -1;
  if (i < 0) return text;
  return (
    <>
      {text.slice(0, i)}
      <mark>{text.slice(i, i + q.length)}</mark>
      {text.slice(i + q.length)}
    </>
  );
}

/**
 * Recherche rapide (Ctrl/Cmd + K) : une seule barre pour rejoindre un serveur,
 * un salon, une personne ou retrouver un message. Tout se fait au clavier.
 */
export default function QuickSearch({ onClose, onGoServer, onGoChannel, onGoDm }) {
  const [q, setQ] = useState('');
  const [data, setData] = useState({ servers: [], channels: [], people: [], messages: [] });
  const [loading, setLoading] = useState(false);
  const [index, setIndex] = useState(0);
  const debounce = useRef(null);
  const listRef = useRef(null);

  useEffect(() => {
    clearTimeout(debounce.current);
    if (!q.trim()) { setData({ servers: [], channels: [], people: [], messages: [] }); setLoading(false); return; }
    setLoading(true);
    debounce.current = setTimeout(() => {
      api(`/search/quick?q=${encodeURIComponent(q.trim())}`)
        .then(setData)
        .catch(() => setData({ servers: [], channels: [], people: [], messages: [] }))
        .finally(() => setLoading(false));
    }, 180);
    return () => clearTimeout(debounce.current);
  }, [q]);

  // Une seule liste à plat : la navigation au clavier traverse les catégories.
  const flat = useMemo(() => {
    const out = [];
    for (const group of ['servers', 'channels', 'people', 'messages']) {
      for (const item of data[group] || []) out.push({ group, item });
    }
    return out;
  }, [data]);

  useEffect(() => { setIndex(0); }, [flat.length]);

  function choose(entry) {
    if (!entry) return;
    const { group, item } = entry;
    if (group === 'servers') onGoServer(item.id);
    else if (group === 'channels') onGoChannel(item.server_id, item.id);
    else if (group === 'people') onGoDm(item);
    else if (group === 'messages') onGoChannel(item.server_id, item.channel_id);
    onClose();
  }

  function onKeyDown(e) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setIndex((i) => Math.min(i + 1, flat.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setIndex((i) => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); choose(flat[index]); }
  }

  // Garde l'élément sélectionné visible quand on descend au clavier.
  useEffect(() => {
    listRef.current?.querySelector('.qs-item.active')?.scrollIntoView({ block: 'nearest' });
  }, [index]);

  let cursor = -1;

  return (
    <Modal className="quick-search" onClose={onClose} dismissible>
      {/* Croix au coin de la fenêtre, hors du champ de saisie. */}
      <button className="qs-close" onClick={onClose} title="Fermer"><Icon name="xmark" /></button>
      <div className="qs-bar">
        <Icon name="magnifying-glass" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Rechercher un serveur, un salon, une personne, un message…"
          autoFocus
        />
      </div>

      <div className="qs-results" ref={listRef}>
        {!q.trim() && (
          <div className="qs-hint">
            <p>Commencez à taper pour chercher partout à la fois.</p>
            <p className="qs-keys">
              <kbd>↑</kbd><kbd>↓</kbd> pour se déplacer · <kbd>Entrée</kbd> pour ouvrir · <kbd>Échap</kbd> pour fermer
            </p>
          </div>
        )}
        {q.trim() && !loading && flat.length === 0 && (
          <div className="qs-hint"><p>Aucun résultat pour « {q.trim()} ».</p></div>
        )}

        {['servers', 'channels', 'people', 'messages'].map((group) => {
          const items = data[group] || [];
          if (!items.length) return null;
          return (
            <div className="qs-group" key={group}>
              <div className="qs-group-title">{GROUP_LABELS[group]}</div>
              {items.map((item) => {
                cursor += 1;
                const active = cursor === index;
                const at = cursor;
                return (
                  <button
                    key={`${group}-${item.id}`}
                    className={`qs-item ${active ? 'active' : ''}`}
                    onMouseEnter={() => setIndex(at)}
                    onClick={() => choose({ group, item })}
                  >
                    {group === 'servers' && (
                      <>
                        <span className="qs-ico qs-server" style={{ background: item.icon_url ? undefined : item.icon_color }}>
                          {item.icon_url ? <img src={mediaUrl(item.icon_url)} alt="" /> : item.name.charAt(0).toUpperCase()}
                        </span>
                        <span className="qs-label"><Highlight text={item.name} q={q.trim()} /></span>
                      </>
                    )}
                    {group === 'channels' && (
                      <>
                        <span className="qs-ico"><Icon name={item.type === 'voice' ? 'volume-high' : 'align-left'} /></span>
                        <span className="qs-label"><Highlight text={item.name} q={q.trim()} /></span>
                        <span className="qs-meta">{item.server_name}</span>
                      </>
                    )}
                    {group === 'people' && (
                      <>
                        <Avatar user={item} size={24} />
                        <span className="qs-label"><Highlight text={item.display_name} q={q.trim()} /></span>
                        <span className="qs-meta">@{item.username}</span>
                      </>
                    )}
                    {group === 'messages' && (
                      <>
                        <span className="qs-ico"><Icon name="comment" /></span>
                        <span className="qs-label qs-msg">
                          <Highlight text={item.content.slice(0, 90)} q={q.trim()} />
                        </span>
                        <span className="qs-meta">{item.display_name} · {item.channel_name} · {extract(item.created_at)}</span>
                      </>
                    )}
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
    </Modal>
  );
}
