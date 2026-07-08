import { useEffect, useState, useCallback } from 'react';
import { api, mediaUrl, isAudio } from '../api.js';
import { getSocket } from '../socket.js';
import { renderRich } from '../richtext.jsx';
import Icon from './Icon.jsx';

function reminderLabel(item) {
  if (!item.remind_at) return null;
  const diff = item.remind_at * 1000 - Date.now();
  const when = new Date(item.remind_at * 1000).toLocaleString('fr-FR', { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  if (item.notified || diff <= 0) return { icon: 'bell', text: `Rappel passé (${when})`, past: true };
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  const d = Math.floor(h / 24);
  const rel = d > 0 ? `dans ${d} j` : h > 0 ? `dans ${h} h ${m} min` : `dans ${m} min`;
  return { icon: 'clock', text: `Rappel ${rel} (${when})`, past: false };
}

const untilTomorrow9 = () => {
  const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(9, 0, 0, 0);
  return Math.floor((d.getTime() - Date.now()) / 1000);
};

/** Espace personnel : messages enregistrés et/ou rappels.
 *  `filter` : 'all' (défaut) · 'saved' (marque-pages sans rappel) · 'reminders' (avec rappel).
 *  `embedded` : sans en-tête (intégré au centre d'actions ou à une modale). */
export default function SavedPanel({ currentUser, embedded, filter = 'all' }) {
  const [all, setAll] = useState([]);
  const [menuFor, setMenuFor] = useState(null);
  const [custom, setCustom] = useState('');

  const items = all.filter((it) => (
    filter === 'saved' ? !it.remind_at : filter === 'reminders' ? !!it.remind_at : true
  ));

  const load = useCallback(() => { api('/saved').then(({ items }) => setAll(items)).catch(() => {}); }, []);

  useEffect(() => {
    load();
    const socket = getSocket();
    socket.on('reminder:due', load);
    return () => socket.off('reminder:due', load);
  }, [load]);

  const remove = async (id) => { await api(`/saved/${id}`, { method: 'DELETE' }); window.dispatchEvent(new Event('pulsar:saved-changed')); load(); };
  const setSecs = async (id, secs) => { await api(`/saved/${id}`, { method: 'PATCH', body: { remindInSeconds: secs } }); setMenuFor(null); load(); };
  const setAt = async (id, str) => {
    const epoch = Math.floor(new Date(str).getTime() / 1000);
    if (!Number.isFinite(epoch)) return;
    await api(`/saved/${id}`, { method: 'PATCH', body: { remindAt: epoch } });
    setMenuFor(null); setCustom(''); load();
  };

  const body = (
    <div className="saved-body">
      {items.length === 0 && (
        <p className="saved-empty">
          {filter === 'reminders'
            ? <>Aucun rappel pour l’instant. Sur un message, cliquez sur l’icône <Icon name="clock" /> pour vous le faire rappeler à la date de votre choix.</>
            : <>Aucun message enregistré. Sur un message, cliquez sur l’icône <Icon name="bookmark" /> pour l’enregistrer ici et le retrouver plus tard.</>}
        </p>
      )}
      {items.map((it) => (
        <div className={`saved-item ${it.remind_at && !it.notified ? 'has-reminder' : ''}`} key={it.id}>
          <div className="saved-main">
            <div className="saved-meta">
              <strong>{it.author_name || 'Message'}</strong>
              {it.source ? <span> · {it.source}</span> : null}
            </div>
            {it.content && <div className="saved-text">{renderRich(it.content, currentUser)}</div>}
            {it.attachment_url && (isAudio(it.attachment_url)
              ? <audio className="msg-audio" controls src={mediaUrl(it.attachment_url)} />
              : <img className="saved-img" src={mediaUrl(it.attachment_url)} alt="" onClick={() => window.open(mediaUrl(it.attachment_url), '_blank')} />)}
            {(() => { const r = reminderLabel(it); return r && <div className="saved-reminder"><Icon name={r.icon} /> {r.text}</div>; })()}
          </div>
          <div className="saved-actions">
            <button title="Programmer un rappel" onClick={() => { setMenuFor(menuFor === it.id ? null : it.id); setCustom(''); }}><Icon name="clock" /></button>
            <button title="Supprimer" onClick={() => remove(it.id)}><Icon name="trash" /></button>
            {menuFor === it.id && (
              <div className="save-pop">
                <button onClick={() => setSecs(it.id, 3600)}>Dans 1 heure</button>
                <button onClick={() => setSecs(it.id, 10800)}>Dans 3 heures</button>
                <button onClick={() => setSecs(it.id, untilTomorrow9())}>Demain 9 h</button>
                <div className="save-custom">
                  <label>Date &amp; heure précises</label>
                  <input type="datetime-local" value={custom} onChange={(e) => setCustom(e.target.value)} />
                  <button className="save-custom-go" disabled={!custom} onClick={() => setAt(it.id, custom)}>Programmer</button>
                </div>
                <button onClick={() => setSecs(it.id, 0)}>Retirer le rappel</button>
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );

  if (embedded) return body;

  return (
    <div className="main-content">
      <div className="content-header"><span><Icon name="bookmark" /> Rappels</span></div>
      {body}
    </div>
  );
}
