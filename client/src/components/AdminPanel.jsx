import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../api.js';
import { notify } from '../notice.js';
import Icon from './Icon.jsx';
import Avatar from './Avatar.jsx';
import ConfirmModal from './ConfirmModal.jsx';

const SECTIONS = [
  { id: 'dashboard', label: 'Tableau de bord', icon: 'chart-simple' },
  { id: 'users', label: 'Comptes', icon: 'users' },
  { id: 'reports', label: 'Signalements', icon: 'flag' },
  { id: 'feedback', label: 'Retours', icon: 'comment-dots' },
  { id: 'log', label: 'Journal', icon: 'clock-rotate-left' },
];

const fmtDate = (ts) => new Date(String(ts).replace(' ', 'T') + 'Z')
  .toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
const fmtDateTime = (ts) => new Date(String(ts).replace(' ', 'T') + 'Z')
  .toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

/** Petite tuile de statistique. */
function Stat({ label, value, hint, alert }) {
  return (
    <div className={`adm-stat ${alert ? 'alert' : ''}`}>
      <div className="adm-stat-value">{value}</div>
      <div className="adm-stat-label">{label}</div>
      {hint && <div className="adm-stat-hint">{hint}</div>}
    </div>
  );
}

/** Mini histogramme des inscriptions (14 jours), sans dépendance. */
function Signups({ data }) {
  if (!data?.length) return null;
  const max = Math.max(1, ...data.map((d) => d.n));
  return (
    <div className="adm-chart">
      <div className="adm-chart-title">Inscriptions · 14 derniers jours</div>
      <div className="adm-bars">
        {data.map((d) => (
          <div key={d.jour} className="adm-bar" title={`${d.jour} : ${d.n}`}>
            <span style={{ height: `${Math.round((d.n / max) * 100)}%` }} />
          </div>
        ))}
      </div>
    </div>
  );
}

function Dashboard() {
  const [s, setS] = useState(null);
  useEffect(() => { api('/admin/stats').then(setS).catch((e) => notify(e.message)); }, []);
  if (!s) return <div className="adm-loading">Chargement…</div>;
  return (
    <>
      <div className="adm-stats">
        <Stat label="Comptes" value={s.users} hint={`${s.verified} confirmés · ${s.suspended} suspendus`} />
        <Stat label="Serveurs" value={s.servers} hint={`${s.channels} salons`} />
        <Stat label="Messages" value={s.messages} hint={`${s.dms} en privé`} />
        <Stat label="Nouveaux · 7 j" value={s.newUsers7d} hint={`${s.activeMsgs7d} messages postés`} />
        <Stat label="Signalements ouverts" value={s.openReports} alert={s.openReports > 0} />
        <Stat label="Retours à traiter" value={s.newFeedback} alert={s.newFeedback > 0} />
      </div>
      <Signups data={s.signups} />
    </>
  );
}

function Users() {
  const [q, setQ] = useState('');
  const [rows, setRows] = useState([]);
  const [confirm, setConfirm] = useState(null); // { kind, user }

  const load = useCallback(() => {
    api(`/admin/users${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ''}`)
      .then((r) => setRows(r.users)).catch((e) => notify(e.message));
  }, [q]);
  useEffect(() => { const t = setTimeout(load, 200); return () => clearTimeout(t); }, [load]);

  async function suspend(u, suspend) {
    try {
      await api(`/admin/users/${u.id}/suspend`, { method: 'POST', body: { suspend } });
      notify(suspend ? 'Compte suspendu.' : 'Compte réactivé.', 'success');
      load();
    } catch (e) { notify(e.message); }
  }
  async function remove(u) {
    try {
      await api(`/admin/users/${u.id}`, { method: 'DELETE' });
      notify('Compte supprimé.', 'success');
      load();
    } catch (e) { notify(e.message); }
  }

  return (
    <>
      <div className="adm-search">
        <Icon name="magnifying-glass" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Chercher un nom, un identifiant, un email…" />
      </div>
      <div className="adm-table">
        {rows.map((u) => (
          <div className={`adm-row ${u.suspended ? 'is-suspended' : ''}`} key={u.id}>
            <Avatar user={u} size={34} />
            <div className="adm-row-main">
              <div className="adm-row-name">
                {u.display_name}
                {u.platform_admin ? <span className="adm-badge admin">admin</span> : null}
                {u.suspended ? <span className="adm-badge susp">suspendu</span> : null}
                {!u.verified ? <span className="adm-badge">non confirmé</span> : null}
              </div>
              <div className="adm-row-sub">@{u.username} · {u.email || 'sans email'} · inscrit le {fmtDate(u.created_at)}</div>
              <div className="adm-row-sub">{u.servers} serveur{u.servers > 1 ? 's' : ''} · {u.messages} message{u.messages > 1 ? 's' : ''}</div>
            </div>
            {!u.platform_admin && (
              <div className="adm-row-actions">
                {u.suspended
                  ? <button className="adm-act" onClick={() => suspend(u, false)} title="Réactiver"><Icon name="unlock" /></button>
                  : <button className="adm-act warn" onClick={() => setConfirm({ kind: 'suspend', user: u })} title="Suspendre"><Icon name="ban" /></button>}
                <button className="adm-act danger" onClick={() => setConfirm({ kind: 'delete', user: u })} title="Supprimer"><Icon name="trash" /></button>
              </div>
            )}
          </div>
        ))}
        {rows.length === 0 && <div className="adm-empty">Aucun compte.</div>}
      </div>

      {confirm?.kind === 'suspend' && (
        <ConfirmModal title="Suspendre ce compte ?"
          message={`« ${confirm.user.display_name} » sera déconnecté et ne pourra plus se connecter jusqu'à réactivation.`}
          confirmLabel="Suspendre" danger
          onConfirm={() => suspend(confirm.user, true)} onClose={() => setConfirm(null)} />
      )}
      {confirm?.kind === 'delete' && (
        <ConfirmModal title="Supprimer ce compte ?"
          message={`Le compte « ${confirm.user.display_name} » et toutes ses données seront effacés définitivement. Cette action est irréversible.`}
          confirmLabel="Supprimer définitivement" danger
          onConfirm={() => remove(confirm.user)} onClose={() => setConfirm(null)} />
      )}
    </>
  );
}

function Reports() {
  const [status, setStatus] = useState('open');
  const [rows, setRows] = useState([]);
  const load = useCallback(() => {
    api(`/admin/reports?status=${status}`).then((r) => setRows(r.reports)).catch((e) => notify(e.message));
  }, [status]);
  useEffect(() => { load(); }, [load]);

  async function resolve(r, decision) {
    try {
      await api(`/admin/reports/${r.id}/resolve`, { method: 'POST', body: { status: decision } });
      load();
    } catch (e) { notify(e.message); }
  }

  return (
    <>
      <div className="adm-tabs">
        {['open', 'resolved', 'dismissed'].map((s) => (
          <button key={s} className={status === s ? 'active' : ''} onClick={() => setStatus(s)}>
            {s === 'open' ? 'À traiter' : s === 'resolved' ? 'Traités' : 'Écartés'}
          </button>
        ))}
      </div>
      <div className="adm-list">
        {rows.map((r) => (
          <div className="adm-card" key={r.id}>
            <div className="adm-card-head">
              <span className="adm-reason"><Icon name="flag" /> {r.reason}</span>
              <span className="adm-card-date">{fmtDateTime(r.created_at)}</span>
            </div>
            <div className="adm-card-body">
              <p>
                <strong>{r.target_name || 'compte supprimé'}</strong>
                {r.target_username ? ` (@${r.target_username})` : ''} signalé
                {r.reporter_name ? ` par ${r.reporter_name}` : ''}.
                {r.target_suspended ? ' Ce compte est déjà suspendu.' : ''}
              </p>
              {r.context_label && <p className="adm-context">{r.context_label}</p>}
              {r.content_excerpt && <blockquote className="adm-excerpt">{r.content_excerpt}</blockquote>}
            </div>
            {status === 'open' && (
              <div className="adm-card-actions">
                <button className="btn btn-ghost" onClick={() => resolve(r, 'dismissed')}>Écarter</button>
                <button className="btn" onClick={() => resolve(r, 'resolved')}>Marquer traité</button>
              </div>
            )}
          </div>
        ))}
        {rows.length === 0 && <div className="adm-empty">Rien ici.</div>}
      </div>
    </>
  );
}

function Feedback() {
  const [rows, setRows] = useState([]);
  const load = useCallback(() => { api('/admin/feedback').then((r) => setRows(r.feedback)).catch((e) => notify(e.message)); }, []);
  useEffect(() => { load(); }, [load]);

  async function toggle(f) {
    try { await api(`/admin/feedback/${f.id}/handled`, { method: 'POST', body: { handled: !f.handled } }); load(); }
    catch (e) { notify(e.message); }
  }

  return (
    <div className="adm-list">
      {rows.map((f) => (
        <div className={`adm-card ${f.handled ? 'is-done' : ''}`} key={f.id}>
          <div className="adm-card-head">
            <span className={`adm-type adm-type-${f.type}`}>{f.type}</span>
            <span className="adm-card-date">{fmtDateTime(f.created_at)}</span>
          </div>
          <div className="adm-card-body">
            {f.subject && <p className="adm-fb-subject">{f.subject}</p>}
            <p>{f.message}</p>
            <p className="adm-row-sub">
              {f.display_name ? `${f.display_name} (@${f.username})` : 'anonyme'}
              {f.area ? ` · ${f.area}` : ''}
            </p>
          </div>
          <div className="adm-card-actions">
            <button className={f.handled ? 'btn btn-ghost' : 'btn'} onClick={() => toggle(f)}>
              {f.handled ? 'Rouvrir' : 'Marquer traité'}
            </button>
          </div>
        </div>
      ))}
      {rows.length === 0 && <div className="adm-empty">Aucun retour pour l’instant.</div>}
    </div>
  );
}

function Log() {
  const [rows, setRows] = useState([]);
  useEffect(() => { api('/admin/log').then((r) => setRows(r.log)).catch((e) => notify(e.message)); }, []);
  return (
    <div className="adm-log">
      {rows.map((l) => (
        <div className="adm-log-row" key={l.id}>
          <span className="adm-log-when">{fmtDateTime(l.created_at)}</span>
          <span className="adm-log-who">{l.admin_name || 'système'}</span>
          <span className="adm-log-what">{l.action}{l.detail ? ` · ${l.detail}` : ''}</span>
        </div>
      ))}
      {rows.length === 0 && <div className="adm-empty">Aucune action enregistrée.</div>}
    </div>
  );
}

/**
 * Espace d'administration de la plateforme (réservé aux comptes administrateurs).
 * Le serveur revérifie ce droit à chaque requête : cette fenêtre ne fait
 * qu'afficher des données que le serveur accepte de fournir.
 */
export default function AdminPanel({ onClose }) {
  const [section, setSection] = useState('dashboard');

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const Body = { dashboard: Dashboard, users: Users, reports: Reports, feedback: Feedback, log: Log }[section];

  return createPortal(
    <div className="adm-overlay">
      <aside className="adm-nav">
        <div className="adm-brand"><Icon name="shield-halved" /> Administration</div>
        {SECTIONS.map((s) => (
          <button key={s.id} className={`adm-nav-item ${section === s.id ? 'active' : ''}`} onClick={() => setSection(s.id)}>
            <Icon name={s.icon} /> {s.label}
          </button>
        ))}
        <button className="adm-nav-close" onClick={onClose}><Icon name="arrow-left" /> Retour à l’application</button>
      </aside>
      <main className="adm-main">
        <h1>{SECTIONS.find((s) => s.id === section).label}</h1>
        <Body />
      </main>
    </div>,
    document.body,
  );
}
