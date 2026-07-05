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
  { label: 'Enregistrer (sans rappel)', secs: 0 },
  { label: 'Dans 1 heure', secs: 3600 },
  { label: 'Dans 3 heures', secs: 10800 },
  { label: 'Demain 9 h', secs: null }, // calculé
];

/** Bouton « enregistrer / me rappeler ce message » (rappel relatif ou date précise). */
export default function SaveButton({ content, attachmentUrl, authorName, source }) {
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState('');
  const [custom, setCustom] = useState('');

  async function save({ secs, remindAt }) {
    const body = { content, attachment_url: attachmentUrl, author_name: authorName, source };
    if (remindAt) body.remindAt = remindAt;
    else body.remindInSeconds = secs === null ? untilTomorrow9() : secs;
    try {
      await api('/saved', { method: 'POST', body });
      setDone(remindAt || body.remindInSeconds > 0 ? 'Rappel programmé !' : 'Enregistré !');
      setTimeout(() => { setOpen(false); setDone(''); setCustom(''); }, 1200);
    } catch {
      setDone('Erreur');
      setTimeout(() => setDone(''), 1200);
    }
  }

  return (
    <span className="save-wrap">
      <button title="Enregistrer / Me le rappeler" onClick={() => setOpen((v) => !v)}><Icon name="bookmark" /></button>
      {open && (
        <div className="save-pop">
          {done ? (
            <div className="save-done">{done}</div>
          ) : (
            <>
              {OPTIONS.map((o) => (
                <button key={o.label} onClick={() => save({ secs: o.secs })}>{o.label}</button>
              ))}
              <div className="save-custom">
                <label>Date &amp; heure précises</label>
                <input type="datetime-local" value={custom} onChange={(e) => setCustom(e.target.value)} />
                <button
                  className="save-custom-go"
                  disabled={!custom}
                  onClick={() => save({ remindAt: Math.floor(new Date(custom).getTime() / 1000) })}
                >
                  Programmer
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </span>
  );
}
