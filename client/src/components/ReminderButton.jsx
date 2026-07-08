import { useState } from 'react';
import { api } from '../api.js';
import Icon from './Icon.jsx';

function untilTomorrow9() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(9, 0, 0, 0);
  return Math.floor((d.getTime() - Date.now()) / 1000);
}

const OPTIONS = [
  { label: 'Dans 1 heure', secs: 3600 },
  { label: 'Dans 3 heures', secs: 10800 },
  { label: 'Demain 9 h', secs: null },
];

/** Bouton rappel : programme (ou modifie) un rappel daté sur un message. Distinct du marque-page. */
export default function ReminderButton({ content, attachmentUrl, authorName, source, sourceMessageId, existing, dropUp }) {
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState('');
  const [custom, setCustom] = useState('');
  const active = !!existing?.remind_at;

  async function program(body) {
    try {
      if (existing) {
        await api(`/saved/${existing.id}`, { method: 'PATCH', body });
      } else {
        await api('/saved', { method: 'POST', body: { content, attachment_url: attachmentUrl, author_name: authorName, source, source_message_id: sourceMessageId, ...body } });
      }
      window.dispatchEvent(new Event('pulsar:saved-changed'));
      setDone('Rappel programmé !');
      setTimeout(() => { setOpen(false); setDone(''); setCustom(''); }, 1100);
    } catch { setDone('Erreur'); setTimeout(() => setDone(''), 1100); }
  }

  return (
    <span className="save-wrap">
      <button className={active ? 'active' : ''} title={active ? 'Modifier le rappel' : 'Me le rappeler'} onClick={() => setOpen((v) => !v)}>
        <Icon name="clock" />
      </button>
      {open && (
        <div className={`save-pop ${dropUp ? 'up' : ''}`}>
          {done ? (
            <div className="save-done">{done}</div>
          ) : (
            <>
              {OPTIONS.map((o) => (
                <button key={o.label} onClick={() => program({ remindInSeconds: o.secs === null ? untilTomorrow9() : o.secs })}>{o.label}</button>
              ))}
              <div className="save-custom">
                <label>Date et heure précises</label>
                <input type="datetime-local" value={custom} onChange={(e) => setCustom(e.target.value)} />
                <button className="save-custom-go" disabled={!custom} onClick={() => program({ remindAt: Math.floor(new Date(custom).getTime() / 1000) })}>Programmer</button>
              </div>
              {active && <button onClick={() => program({ remindInSeconds: 0 })}>Retirer le rappel</button>}
            </>
          )}
        </div>
      )}
    </span>
  );
}
