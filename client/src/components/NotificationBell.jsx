import { useState, useEffect, useRef } from 'react';
import Icon from './Icon.jsx';

function timeAgo(ts) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return 'à l’instant';
  const m = Math.floor(s / 60);
  if (m < 60) return `il y a ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `il y a ${h} h`;
  return new Date(ts).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
}

/** Cloche de notifications : compteur de non-lues + panneau déroulant. */
export default function NotificationBell({ notifications, onOpenNotif, onMarkAllRead, onClear }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const unread = notifications.filter((n) => !n.read).length;

  useEffect(() => {
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  function toggle() {
    setOpen((o) => {
      if (!o) onMarkAllRead();
      return !o;
    });
  }

  return (
    <div className="notif-wrap" ref={ref}>
      <button className={`topbar-icon notif-btn ${unread ? 'has-unread' : ''}`} title="Notifications" onClick={toggle}>
        <Icon name="bell" />
        {unread > 0 && <span className="notif-badge">{unread > 9 ? '9+' : unread}</span>}
      </button>

      {open && (
        <div className="notif-panel">
          <div className="notif-head">
            <span>Notifications</span>
            {notifications.length > 0 && <button onClick={onClear}>Tout effacer</button>}
          </div>
          <div className="notif-list">
            {notifications.length === 0 && <div className="notif-empty">Aucune notification pour l’instant.</div>}
            {notifications.map((n) => (
              <button className={`notif-item ${n.read ? '' : 'unread'}`} key={n.id} onClick={() => { onOpenNotif(n); setOpen(false); }}>
                <span className={`notif-ico ${n.tone || ''}`}><Icon name={n.icon} /></span>
                <span className="notif-body">
                  <span className="notif-title">{n.title}</span>
                  {n.body && <span className="notif-text">{n.body}</span>}
                  <span className="notif-time">{timeAgo(n.at)}</span>
                </span>
                {!n.read && <span className="notif-dot" />}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
