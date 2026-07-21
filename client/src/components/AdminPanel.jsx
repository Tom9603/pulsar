import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { api } from '../api.js';
import Logo from './Logo.jsx';
import Icon from './Icon.jsx';
import Avatar from './Avatar.jsx';
import ConfirmModal from './ConfirmModal.jsx';
import { formatTimeDate } from '../datetime.js';

const SECTIONS = [
  { id: 'dashboard', icon: 'chart-simple', label: 'Tableau de bord' },
  { id: 'users', icon: 'user-group', label: 'Comptes' },
  { id: 'reports', icon: 'flag', label: 'Signalements' },
  { id: 'feedback', icon: 'comment-dots', label: 'Retours' },
  { id: 'log', icon: 'clock-rotate-left', label: 'Journal' },
];

/** Grosse tuile chiffre + libellé, pour le tableau de bord. */
function Stat({ value, label, icon, tone }) {
  return (
    <div className={`ad-stat ${tone || ''}`}>
      <span className="ad-stat-ico"><Icon name={icon} /></span>
      <div>
        <div className="ad-stat-value">{value ?? '—'}</div>
        <div className="ad-stat-label">{label}</div>
      </div>
    </div>
  );
}

function Dashboard() {
  const [s, setS] = useState(null);
  useEffect(() => { api('/admin/stats').then(setS).catch(() => {}); }, []);
  if (!s) return <div className="ad-loading">Chargement…</div>;

  // Petite courbe des inscriptions sur 14 jours (SVG maison, sans dépendance).
  const days = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - (13 - i));
    return d.toISOString().slice(0, 10);
  });
  const byDay = Object.fromEntries(s.signups.map((x) => [x.jour, x.n]));
  const points = days.map((d, i) => ({ i, jour: d, n: byDay[d] || 0 }));
  const max = Math.max(1, ...points.map((p) => p.n));

  return (
    <>
      <h2>Vue d’ensemble</h2>
      <div className="ad-stats">
        <Stat value={s.users} label="Comptes" icon="user" />
        <Stat value={s.verified} label="Confirmés" icon="circle-check" tone="ok" />
        <Stat value={s.suspended} label="Suspendus" icon="ban" tone={s.suspended ? 'warn' : ''} />
        <Stat value={s.servers} label="Serveurs" icon="hashtag" />
        <Stat value={s.messages} label="Messages" icon="comment" />
        <Stat value={s.dms} label="Messages privés" icon="envelope" />
        <Stat value={s.openReports} label="Signalements à traiter" icon="flag" tone={s.openReports ? 'warn' : ''} />
        <Stat value={s.newFeedback} label="Retours non lus" icon="comment-dots" tone={s.newFeedback ? 'accent' : ''} />
      </div>

      <h3 className="ad-h3">Nouvelles inscriptions · 14 derniers jours</h3>
      <div className="ad-chart">
        <svg viewBox="0 0 700 160" preserveAspectRatio="none" style={{ width: '100%', height: 160 }}>
          {points.map((p, idx) => {
            const bw = 700 / 14; const h = (p.n / max) * 130;
            return (
              <g key={p.jour}>
                <rect x={idx * bw + 4} y={150 - h} width={bw - 8} height={Math.max(h, 2)} rx="4" fill="var(--accent)" opacity="0.85">
                  <title>{p.jour} : {p.n}</title>
                </rect>
              </g>
            );
          })}
        </svg>
        <div className="ad-chart-x">
          {points.map((p, i) => (
            <span key={p.jour}>{i % 2 === 0 ? p.jour.slice(5) : ''}</span>
          ))}
        </div>
      </div>

      <div className="ad-quicknums">
        <span><strong>{s.newUsers7d}</strong> nouveaux comptes cette semaine</span>
        <span><strong>{s.activeMsgs7d}</strong> messages envoyés cette semaine</span>
      </div>
    </>
  );
}

function Users({ me }) {
  const [q, setQ] = useState('');
  const [users, setUsers] = useState([]);
  const [suspend, setSuspend] = useState(null);
  const [reason, setReason] = useState('');
  const [confirmDel, setConfirmDel] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    api(`/admin/users${q ? `?q=${encodeURIComponent(q)}` : ''}`).then((r) => setUsers(r.users)).catch(() => {});
  }, [q]);
  useEffect(() => { const t = setTimeout(load, 200); return () => clearTimeout(t); }, [load]);

  async function doSuspend(u, suspend) {
    setError('');
    try {
      await api(`/admin/users/${u.id}/suspend`, { method: 'POST', body: { suspend, reason: suspend ? reason : null } });
      setSuspend(null); setReason(''); load();
    } catch (e) { setError(e.message); }
  }
  async function doDelete(u) {
    setError('');
    try { await api(`/admin/users/${u.id}`, { method: 'DELETE' }); setConfirmDel(null); load(); }
    catch (e) { setError(e.message); }
  }

  return (
    <>
      <h2>Comptes</h2>
      <div className="ad-search">
        <Icon name="magnifying-glass" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Chercher par nom, pseudo ou email…" />
      </div>
      {error && <div className="error-msg">{error}</div>}

      <div className="ad-users">
        {users.map((u) => (
          <div key={u.id} className="ad-user-row">
            <Avatar user={u} size={36} />
            <div className="ad-user-main">
              <div className="ad-user-name">
                {u.display_name}
                {u.platform_admin ? <span className="ad-badge admin"><Icon name="shield-halved" /> Administrateur</span> : null}
                {u.suspended ? <span className="ad-badge warn"><Icon name="ban" /> Suspendu</span> : null}
                {!u.verified ? <span className="ad-badge muted">Non confirmé</span> : null}
              </div>
              <div className="ad-user-meta">
                @{u.username} · {u.email || '—'} · inscrit le {u.created_at?.slice(0, 10)}
              </div>
              <div className="ad-user-meta">{u.servers} serveur(s) · {u.messages} message(s)</div>
              {u.suspended && u.suspended_reason && <div className="ad-user-reason"><Icon name="circle-info" /> {u.suspended_reason}</div>}
            </div>
            <div className="ad-user-actions">
              {u.id === me?.id ? (
                <span className="ad-you">Vous</span>
              ) : u.platform_admin ? (
                <span className="ad-locked" title="Utilisez le script serveur">Verrouillé</span>
              ) : u.suspended ? (
                <button className="btn btn-ghost" onClick={() => doSuspend(u, false)}><Icon name="rotate-left" /> Réactiver</button>
              ) : (
                <>
                  <button className="btn btn-ghost" onClick={() => { setSuspend(u); setReason(''); }}><Icon name="ban" /> Suspendre</button>
                  <button className="btn btn-danger" onClick={() => setConfirmDel(u)}><Icon name="trash" /> Supprimer</button>
                </>
              )}
            </div>
          </div>
        ))}
        {users.length === 0 && <div className="ad-empty">Aucun compte trouvé.</div>}
      </div>

      {suspend && (
        <ConfirmModal
          title={`Suspendre ${suspend.display_name} ?`}
          message={
            <>
              <p>La personne ne pourra plus se connecter tant qu’elle est suspendue. Toutes ses sessions sont fermées immédiatement.</p>
              <label className="ad-label">Motif affiché à la connexion (facultatif)</label>
              <input className="ad-input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ex. Contenus inappropriés" />
            </>
          }
          confirmLabel="Suspendre" danger
          onConfirm={() => doSuspend(suspend, true)}
          onClose={() => setSuspend(null)}
        />
      )}
      {confirmDel && (
        <ConfirmModal
          title={`Supprimer ${confirmDel.display_name} ?`}
          message="Le compte et toutes ses données seront effacés définitivement. Cette action est irréversible."
          confirmLabel="Supprimer" danger
          onConfirm={() => doDelete(confirmDel)}
          onClose={() => setConfirmDel(null)}
        />
      )}
    </>
  );
}

function Reports() {
  const [status, setStatus] = useState('open');
  const [rows, setRows] = useState([]);
  const load = useCallback(() => {
    api(`/admin/reports?status=${status}`).then((r) => setRows(r.reports)).catch(() => {});
  }, [status]);
  useEffect(() => { load(); }, [load]);

  async function act(id, s) {
    try { await api(`/admin/reports/${id}/resolve`, { method: 'POST', body: { status: s } }); load(); }
    catch { /* silencieux : le rechargement montrera l'état réel */ }
  }

  return (
    <>
      <h2>Signalements</h2>
      <div className="ad-tabs">
        {['open', 'resolved', 'dismissed'].map((s) => (
          <button key={s} className={status === s ? 'active' : ''} onClick={() => setStatus(s)}>
            {s === 'open' ? 'À traiter' : s === 'resolved' ? 'Traités' : 'Ignorés'}
          </button>
        ))}
      </div>
      <div className="ad-reports">
        {rows.map((r) => (
          <div key={r.id} className="ad-report">
            <div className="ad-report-head">
              <span className="ad-badge muted">{r.target_type === 'user' ? 'Compte' : r.target_type === 'dm' ? 'Message privé' : 'Message'}</span>
              <span className="ad-badge accent">{r.reason}</span>
              <span className="ad-report-meta">Par {r.reporter_name || 'anonyme'} · {formatTimeDate(r.created_at)}</span>
            </div>
            {r.target_name && (
              <div className="ad-report-target">
                Contre <strong>{r.target_name}</strong> <span className="ad-user-meta">@{r.target_username}</span>
                {r.target_suspended ? <span className="ad-badge warn"><Icon name="ban" /> déjà suspendu</span> : null}
              </div>
            )}
            {r.context_label && <div className="ad-report-context">{r.context_label}</div>}
            {r.content_excerpt && <blockquote className="ad-report-quote">« {r.content_excerpt} »</blockquote>}
            {status === 'open' && (
              <div className="ad-report-actions">
                <button className="btn btn-ghost" onClick={() => act(r.id, 'dismissed')}><Icon name="xmark" /> Ignorer</button>
                <button className="btn" onClick={() => act(r.id, 'resolved')}><Icon name="check" /> Marquer traité</button>
              </div>
            )}
          </div>
        ))}
        {rows.length === 0 && <div className="ad-empty">Aucun signalement.</div>}
      </div>
    </>
  );
}

function Feedback() {
  const [rows, setRows] = useState([]);
  const load = () => api('/admin/feedback').then((r) => setRows(r.feedback)).catch(() => {});
  useEffect(() => { load(); }, []);
  const toggle = async (f) => { try { await api(`/admin/feedback/${f.id}/handled`, { method: 'POST', body: { handled: !f.handled } }); load(); } catch { /* rien */ } };

  return (
    <>
      <h2>Retours des utilisateurs</h2>
      <div className="ad-feedback">
        {rows.map((f) => (
          <div key={f.id} className={`ad-fb ${f.handled ? 'is-handled' : ''}`}>
            <div className="ad-fb-head">
              <span className={`ad-badge ${f.type === 'bug' ? 'warn' : f.type === 'suggestion' ? 'accent' : 'muted'}`}>
                <Icon name={f.type === 'bug' ? 'bug' : f.type === 'suggestion' ? 'lightbulb' : 'comment'} /> {f.type}
              </span>
              {f.subject && <span className="ad-fb-subject">{f.subject}</span>}
              {f.area && <span className="ad-user-meta">· {f.area}</span>}
              <span className="ad-report-meta">Par {f.display_name || 'anonyme'} · {formatTimeDate(f.created_at)}</span>
            </div>
            <p className="ad-fb-msg">{f.message}</p>
            {Array.isArray(f.screenshots) && f.screenshots.length > 0 && (
              <div className="ad-fb-shots">
                {f.screenshots.map((u) => <img key={u} src={u} alt="" />)}
              </div>
            )}
            <div className="ad-fb-actions">
              {f.email && (
                <a className="btn btn-ghost ad-fb-toggle" href={`mailto:${f.email}?subject=${encodeURIComponent('Réponse à votre retour Pulsar' + (f.subject ? ' : ' + f.subject : ''))}`}>
                  <Icon name="reply" /> Répondre par email
                </a>
              )}
              <button className="btn btn-ghost ad-fb-toggle" onClick={() => toggle(f)}>
                <Icon name={f.handled ? 'rotate-left' : 'check'} /> {f.handled ? 'Rouvrir' : 'Marquer traité'}
              </button>
            </div>
          </div>
        ))}
        {rows.length === 0 && <div className="ad-empty">Aucun retour pour l’instant.</div>}
      </div>
    </>
  );
}

function Log() {
  const [rows, setRows] = useState([]);
  useEffect(() => { api('/admin/log').then((r) => setRows(r.log)).catch(() => {}); }, []);
  const LABELS = {
    suspend_user: 'Suspension de compte',
    unsuspend_user: 'Réactivation de compte',
    delete_user: 'Suppression de compte',
    resolve_report: 'Traitement d’un signalement',
  };
  return (
    <>
      <h2>Journal d’administration</h2>
      <p className="ad-note">Les 100 dernières actions effectuées depuis cet espace.</p>
      <div className="ad-log">
        {rows.map((l) => (
          <div key={l.id} className="ad-log-row">
            <span className="ad-log-when">{formatTimeDate(l.created_at)}</span>
            <span className="ad-log-who">{l.admin_name || '—'}</span>
            <span className="ad-log-what">{LABELS[l.action] || l.action}</span>
            <span className="ad-user-meta">{l.detail || l.target || ''}</span>
          </div>
        ))}
        {rows.length === 0 && <div className="ad-empty">Aucune action pour l’instant.</div>}
      </div>
    </>
  );
}

/**
 * Espace d'administration de la plateforme.
 *
 * Le drapeau « platform_admin » est vérifié à la fois côté client (pour
 * afficher la page) ET à chaque requête côté serveur (pour toute action).
 * Le premier garde-fou n'a de valeur qu'esthétique : c'est le second qui
 * protège réellement.
 */
export default function AdminPanel({ onClose }) {
  const { user } = useAuth();
  const [section, setSection] = useState('dashboard');

  // Écran plein — mais ce n'est pas une nouvelle route. On sort par « Retour ».
  useEffect(() => {
    // Coupe le défilement de l'application derrière le panneau.
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);
  if (!user || !user.platform_admin) return null;

  return (
    <div className="admin-wrap">
      <aside className="admin-nav">
        <div className="admin-brand">
          <Logo size={32} wordmark={false} row />
          <div>
            <div className="admin-brand-title">Administration</div>
            <div className="admin-brand-sub">Plateforme Pulsar</div>
          </div>
        </div>
        {SECTIONS.map((s) => (
          <button key={s.id} className={`admin-nav-item ${section === s.id ? 'active' : ''}`} onClick={() => setSection(s.id)}>
            <Icon name={s.icon} /> <span>{s.label}</span>
          </button>
        ))}
        <div className="admin-nav-foot">
          <button className="admin-nav-item" onClick={onClose}>
            <Icon name="arrow-left" /> <span>Retour à l’application</span>
          </button>
        </div>
      </aside>

      <main className="admin-main">
        {section === 'dashboard' && <Dashboard />}
        {section === 'users' && <Users me={user} />}
        {section === 'reports' && <Reports />}
        {section === 'feedback' && <Feedback />}
        {section === 'log' && <Log />}
      </main>
    </div>
  );
}
