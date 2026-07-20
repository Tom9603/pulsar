import Avatar from './Avatar.jsx';
import Icon from './Icon.jsx';
import CustomStatus from './CustomStatus.jsx';

/** Rôle le plus haut porté par le membre (roles est trié par position décroissante). */
function topRole(member, roles) {
  const ids = new Set(member.role_ids || []);
  return roles.find((r) => ids.has(r.id)) || null;
}

/** Panneau des membres du serveur — présentation Pulsar : en-tête, pastilles de rôle, « Fondateur ». */
export default function MemberList({ members, onlineIds, ownerId, roles = [], onMemberClick }) {
  const online = new Set(onlineIds);
  const onlineMembers = members.filter((m) => online.has(m.id));
  const offlineMembers = members.filter((m) => !online.has(m.id));

  const row = (m, isOnline) => {
    const role = topRole(m, roles);
    return (
      <button className={`mbr ${isOnline ? '' : 'off'}`} key={m.id} title={m.about || m.display_name} onClick={() => onMemberClick?.(m)}>
        <Avatar user={m} size={34} status={isOnline ? m.status : 'offline'} />
        <span className="mbr-info">
          <span className="mbr-name">{m.display_name}</span>
          <CustomStatus user={m} className="cs-member" />
          {(m.id === ownerId || role) && (
            <span className="mbr-tags">
              {m.id === ownerId && <span className="mbr-tag owner"><Icon name="shield-halved" /> Fondateur</span>}
              {role && <span className="mbr-tag" style={{ color: role.color, borderColor: `${role.color}66` }}>{role.name}</span>}
            </span>
          )}
        </span>
      </button>
    );
  };

  return (
    <div className="member-list">
      <div className="mbr-head"><span><Icon name="users" /> Membres</span><span className="mbr-total">{members.length}</span></div>
      {onlineMembers.length > 0 && (
        <div className="mbr-section">
          <div className="mbr-group">En ligne <span>{onlineMembers.length}</span></div>
          {onlineMembers.map((m) => row(m, true))}
        </div>
      )}
      {offlineMembers.length > 0 && (
        <div className="mbr-section">
          <div className="mbr-group">Hors ligne <span>{offlineMembers.length}</span></div>
          {offlineMembers.map((m) => row(m, false))}
        </div>
      )}
    </div>
  );
}
