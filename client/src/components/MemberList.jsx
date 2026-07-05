import Avatar from './Avatar.jsx';
import Icon from './Icon.jsx';

/** Couleur du rôle le plus haut porté par le membre (roles est trié par position décroissante). */
function topRoleColor(member, roles) {
  const ids = new Set(member.role_ids || []);
  const role = roles.find((r) => ids.has(r.id));
  return role ? role.color : null;
}

/** Liste des membres du serveur, séparés en ligne / hors ligne, colorés par rôle. */
export default function MemberList({ members, onlineIds, ownerId, roles = [], onMemberClick }) {
  const online = new Set(onlineIds);
  const onlineMembers = members.filter((m) => online.has(m.id));
  const offlineMembers = members.filter((m) => !online.has(m.id));

  const renderGroup = (title, list, isOnline) =>
    list.length === 0 ? null : (
      <>
        <div className="member-group-title">{title}</div>
        {list.map((m) => {
          const color = topRoleColor(m, roles);
          return (
            <div
              className={`member-row ${isOnline ? '' : 'offline'}`}
              key={m.id}
              title={m.about || m.display_name}
              onClick={() => onMemberClick?.(m)}
            >
              <Avatar user={m} size={32} status={isOnline ? m.status : 'offline'} />
              <span className="m-name" style={color ? { color } : undefined}>{m.display_name}</span>
              {m.id === ownerId && <span className="owner-crown" title="Propriétaire du serveur"><Icon name="crown" /></span>}
            </div>
          );
        })}
      </>
    );

  return (
    <div className="member-list">
      {renderGroup(`En ligne — ${onlineMembers.length}`, onlineMembers, true)}
      {renderGroup(`Hors ligne — ${offlineMembers.length}`, offlineMembers, false)}
    </div>
  );
}
