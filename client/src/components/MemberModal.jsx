import { useState } from 'react';
import Modal from './Modal.jsx';
import ConfirmModal from './ConfirmModal.jsx';
import Avatar from './Avatar.jsx';
import Icon from './Icon.jsx';
import { api, mediaUrl } from '../api.js';

/** Bloc « fiche professionnelle » d'un membre (affiché s'il a renseigné quelque chose). */
export function ProCard({ u }) {
  const contacts = [
    u.website && { icon: 'link', text: u.website, href: /^https?:\/\//.test(u.website) ? u.website : `https://${u.website}` },
    u.email_pro && { icon: 'envelope', text: u.email_pro, href: `mailto:${u.email_pro}` },
    u.phone && { icon: 'phone', text: u.phone, href: `tel:${u.phone}` },
  ].filter(Boolean);
  const skills = (u.skills || '').split(',').map((s) => s.trim()).filter(Boolean);
  const hasAny = u.company || u.location || contacts.length || skills.length || u.cv_summary || u.cv_url;
  if (!hasAny) return null;

  return (
    <div className="pro-card">
      {(u.company || u.location) && (
        <div className="pro-line">
          {u.company && <span><Icon name="building" /> {u.company}</span>}
          {u.location && <span><Icon name="location-dot" /> {u.location}</span>}
        </div>
      )}
      {contacts.length > 0 && (
        <div className="pro-contacts">
          {contacts.map((c) => <a key={c.text} href={c.href} target="_blank" rel="noreferrer"><Icon name={c.icon} /> {c.text}</a>)}
        </div>
      )}
      {skills.length > 0 && (
        <div className="pro-skills">{skills.map((s) => <span key={s} className="pro-skill">{s}</span>)}</div>
      )}
      {u.cv_summary && <div className="pro-summary">{u.cv_summary}</div>}
      {u.cv_url && <a className="pro-cv" href={mediaUrl(u.cv_url)} target="_blank" rel="noreferrer"><Icon name="file-lines" /> {u.cv_name || 'Consulter le CV'}</a>}
    </div>
  );
}

/** Fiche d'un membre : profil, rôles (attribution), expulsion, message privé. */
export default function MemberModal({ member, roles, server, canManageRoles, canKick, currentUserId, onClose, onChanged, onMessage }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirmKick, setConfirmKick] = useState(false);
  const roleIds = new Set(member.role_ids || []);
  const isTargetOwner = member.id === server.owner_id;

  async function toggleRole(role) {
    setBusy(true); setError('');
    try {
      if (roleIds.has(role.id)) {
        await api(`/servers/${server.id}/members/${member.id}/roles/${role.id}`, { method: 'DELETE' });
      } else {
        await api(`/servers/${server.id}/members/${member.id}/roles`, { method: 'POST', body: { roleId: role.id } });
      }
      await onChanged();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  async function doKick() {
    setBusy(true); setError('');
    try {
      await api(`/servers/${server.id}/members/${member.id}`, { method: 'DELETE' });
      await onChanged();
      onClose();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  return (
    <Modal onClose={onClose}>
      <div className="profile-preview">
        <Avatar user={member} size={64} status={member.status} />
        <div>
          <div style={{ fontWeight: 700, fontSize: 18 }}>
            {member.display_name}
            {isTargetOwner && <span title="Fondateur"> <Icon name="shield-halved" style={{ color: '#f0b232' }} /></span>}
          </div>
          <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>@{member.username}</div>
          {member.headline && <div style={{ color: 'var(--accent)', fontSize: 13, marginTop: 2 }}>{member.headline}</div>}
        </div>
      </div>

      <ProCard u={member} />

      {member.about && (
        <div className="field">
          <label>À propos</label>
          <p style={{ fontSize: 14, color: 'var(--text)' }}>{member.about}</p>
        </div>
      )}

      {error && <div className="error-msg">{error}</div>}

      {canManageRoles && (
        <div className="field">
          <label>Rôles</label>
          {roles.length === 0 && <p style={{ color: 'var(--text-faint)', fontSize: 13 }}>Aucun rôle sur ce serveur.</p>}
          {roles.map((r) => (
            <label key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', cursor: 'pointer', textTransform: 'none', fontWeight: 400, color: 'var(--text)' }}>
              <input type="checkbox" checked={roleIds.has(r.id)} disabled={busy} onChange={() => toggleRole(r)} />
              <span style={{ width: 12, height: 12, borderRadius: '50%', background: r.color }} />
              {r.name}
            </label>
          ))}
        </div>
      )}

      <div className="modal-actions">
        {member.id !== currentUserId && (
          <button className="btn btn-ghost" style={{ width: 'auto', padding: '8px 16px' }} onClick={() => { onMessage(member); onClose(); }}>
            <Icon name="message" /> Message privé
          </button>
        )}
        {canKick && !isTargetOwner && member.id !== currentUserId && (
          <button className="btn btn-danger" style={{ width: 'auto', padding: '8px 16px' }} onClick={() => setConfirmKick(true)} disabled={busy}>
            Expulser
          </button>
        )}
        <button className="btn" style={{ width: 'auto', padding: '8px 16px' }} onClick={onClose}>Fermer</button>
      </div>

      {confirmKick && (
        <ConfirmModal
          title="Expulser le membre"
          message={`${member.display_name} sera retiré du serveur. Il pourra le rejoindre à nouveau avec une invitation.`}
          confirmLabel="Expulser" danger
          onConfirm={doKick}
          onClose={() => setConfirmKick(false)}
        />
      )}
    </Modal>
  );
}
