import Avatar from '../Avatar.jsx';
import Icon from '../Icon.jsx';
import { mediaUrl } from '../../api.js';

/**
 * Catalogue des widgets de l'accueil.
 *
 * Chaque entrée décrit ce qu'on peut poser sur la grille : son nom, sa
 * description, les tailles disponibles (en cases de la grille) et son rendu.
 * Le rendu reçoit le contexte de l'application (données et actions) pour
 * rester purement présentationnel.
 */

/** Tailles proposées, exprimées en cases : [largeur, hauteur]. */
export const SIZE_LABELS = {
  '2x1': 'Bandeau',
  '2x2': 'Carré',
  '4x1': 'Large',
  '4x2': 'Panorama',
};
export const sizeKey = (w, h) => `${w}x${h}`;

const heure = (d) => `${d.getHours()}h${String(d.getMinutes()).padStart(2, '0')}`;

/* ------------------------------------------------------------------ */
/* Widgets                                                             */
/* ------------------------------------------------------------------ */

function ClockWidget({ ctx, h }) {
  const now = ctx.now;
  const jour = now.toLocaleDateString('fr-FR', { weekday: 'long' });
  const date = now.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });
  return (
    <div className={`wg-clock ${h > 1 ? 'tall' : ''}`}>
      <div className="wg-clock-day">{jour}</div>
      <div className="wg-clock-time">{heure(now)}</div>
      <div className="wg-clock-date">{date}</div>
      {h > 1 && <div className="wg-clock-greet">{ctx.greeting}, {ctx.user.display_name}</div>}
    </div>
  );
}

function ServersWidget({ ctx, w, h }) {
  const max = w * h * 2;
  const list = ctx.servers.slice(0, max);
  if (!list.length) {
    return <WidgetEmpty icon="server" text="Aucun serveur" action="Créer un serveur" onAction={ctx.onAddServer} />;
  }
  return (
    <div className="wg-servers">
      {list.map((s) => (
        <button key={s.id} className="wg-server" onClick={() => ctx.onOpenServer(s.id)} title={s.name}>
          <span className="wg-server-icon" style={{ background: s.icon_url ? undefined : s.icon_color }}>
            {s.icon_url ? <img src={mediaUrl(s.icon_url)} alt="" /> : s.name.charAt(0).toUpperCase()}
          </span>
          <span className="wg-server-name">{s.name}</span>
          {s.mentions > 0 ? <span className="wg-badge">{s.mentions}</span> : null}
        </button>
      ))}
    </div>
  );
}

function MessagesWidget({ ctx, w, h }) {
  const max = h > 1 ? (w > 2 ? 8 : 5) : 2;
  const list = ctx.dmConversations.slice(0, max);
  if (!list.length) {
    return <WidgetEmpty icon="comments" text="Aucune conversation" action="Ajouter un contact" onAction={ctx.onOpenFriends} />;
  }
  return (
    <div className="wg-rows">
      {list.map((c) => (
        <button key={c.id} className="wg-row" onClick={() => ctx.onOpenDm(c)}>
          <Avatar user={c} size={32} status={ctx.online.has(c.id) ? c.status : 'offline'} />
          <span className="wg-row-main">
            <span className="wg-row-name">{c.display_name}</span>
            <span className="wg-row-sub">{c.last_content || '@' + c.username}</span>
          </span>
          {c.unread > 0 ? <span className="wg-badge">{c.unread}</span> : null}
        </button>
      ))}
    </div>
  );
}

function ContactsWidget({ ctx, w, h }) {
  const enLigne = ctx.contacts.filter((c) => ctx.online.has(c.id));
  const list = (enLigne.length ? enLigne : ctx.contacts).slice(0, h > 1 ? (w > 2 ? 8 : 5) : 2);
  if (!list.length) {
    return <WidgetEmpty icon="user-group" text="Aucun contact" action="Ajouter un contact" onAction={ctx.onOpenFriends} />;
  }
  return (
    <div className="wg-rows">
      {list.map((c) => (
        <button key={c.id} className="wg-row" onClick={() => ctx.onOpenDm(c)}>
          <Avatar user={c} size={32} status={ctx.online.has(c.id) ? c.status : 'offline'} />
          <span className="wg-row-main">
            <span className="wg-row-name">{c.display_name}</span>
            <span className="wg-row-sub">{ctx.online.has(c.id) ? 'En ligne' : '@' + c.username}</span>
          </span>
        </button>
      ))}
    </div>
  );
}

function TasksWidget({ ctx, w, h }) {
  const mine = ctx.tasks.filter((t) => t.status !== 'done' && (t.assignee_id === ctx.user.id || t.creator_id === ctx.user.id));
  const list = mine.slice(0, h > 1 ? (w > 2 ? 6 : 4) : 2);
  if (!mine.length) {
    return <WidgetEmpty icon="circle-check" text="Rien à faire, tout est à jour" action="Ouvrir les tâches" onAction={ctx.onOpenSaved} />;
  }
  return (
    <div className="wg-tasks">
      <div className="wg-tasks-count"><strong>{mine.length}</strong> {mine.length > 1 ? 'tâches en cours' : 'tâche en cours'}</div>
      <div className="wg-rows">
        {list.map((t) => (
          <button key={t.id} className="wg-row wg-task" onClick={ctx.onOpenSaved}>
            <span className="wg-task-dot" />
            <span className="wg-row-main">
              <span className="wg-row-name">{t.title}</span>
              {t.server_name ? <span className="wg-row-sub">{t.server_name}</span> : null}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function ShortcutsWidget({ ctx, config, w, h }) {
  const items = Array.isArray(config?.items) ? config.items : [];
  if (!items.length) {
    return <WidgetEmpty icon="bolt" text="Aucun raccourci" hint="Passez en mode édition pour en ajouter." />;
  }
  const max = w * h * 3;
  return (
    <div className="wg-shortcuts">
      {items.slice(0, max).map((it, i) => (
        <button key={it.kind + it.id + i} className="wg-shortcut" onClick={() => ctx.onShortcut(it)} title={it.label}>
          <span className="wg-shortcut-icon" style={{ background: it.color || undefined }}>
            {it.avatar ? <img src={mediaUrl(it.avatar)} alt="" /> : <Icon name={it.icon || 'bolt'} />}
          </span>
          <span className="wg-shortcut-name">{it.label}</span>
        </button>
      ))}
    </div>
  );
}

function ActionsWidget({ ctx }) {
  const actions = [
    { icon: 'plus', label: 'Nouveau serveur', run: ctx.onAddServer },
    { icon: 'user-group', label: 'Contacts', run: ctx.onOpenFriends },
    { icon: 'circle-check', label: 'Tâches', run: ctx.onOpenSaved },
    { icon: 'magnifying-glass', label: 'Rechercher', run: ctx.onQuickSearch },
  ];
  return (
    <div className="wg-actions">
      {actions.map((a) => (
        <button key={a.label} className="wg-action" onClick={a.run}>
          <span className="wg-action-icon"><Icon name={a.icon} /></span>
          <span>{a.label}</span>
        </button>
      ))}
    </div>
  );
}

function WidgetEmpty({ icon, text, hint, action, onAction }) {
  return (
    <div className="wg-empty">
      <Icon name={icon} />
      <span>{text}</span>
      {hint ? <span className="wg-empty-hint">{hint}</span> : null}
      {action ? <button className="wg-empty-action" onClick={onAction}>{action}</button> : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */

export const WIDGETS = {
  clock: {
    name: 'Heure et date',
    description: 'Le jour, l’heure et un mot d’accueil.',
    icon: 'clock',
    sizes: [[2, 1], [2, 2]],
    render: ClockWidget,
  },
  shortcuts: {
    name: 'Raccourcis',
    description: 'Les serveurs, salons et conversations que vous choisissez.',
    icon: 'bolt',
    sizes: [[2, 1], [4, 1], [2, 2], [4, 2]],
    configurable: true,
    render: ShortcutsWidget,
  },
  servers: {
    name: 'Vos serveurs',
    description: 'Accès direct à vos espaces de travail.',
    icon: 'server',
    sizes: [[2, 1], [2, 2], [4, 1], [4, 2]],
    render: ServersWidget,
  },
  messages: {
    name: 'Messages récents',
    description: 'Vos dernières conversations privées.',
    icon: 'comments',
    sizes: [[2, 2], [4, 2]],
    render: MessagesWidget,
  },
  tasks: {
    name: 'Tâches en cours',
    description: 'Ce qu’il vous reste à faire aujourd’hui.',
    icon: 'circle-check',
    sizes: [[2, 1], [2, 2], [4, 2]],
    render: TasksWidget,
  },
  contacts: {
    name: 'Contacts',
    description: 'Qui est disponible en ce moment.',
    icon: 'user-group',
    sizes: [[2, 2], [4, 2]],
    render: ContactsWidget,
  },
  actions: {
    name: 'Actions rapides',
    description: 'Créer un serveur, ouvrir les contacts, chercher.',
    icon: 'wand-magic-sparkles',
    sizes: [[2, 1], [4, 1], [2, 2]],
    render: ActionsWidget,
  },
};

/** Disposition posée pour une personne qui n'a rien personnalisé. */
export const DEFAULT_LAYOUT = [
  { id: 'w-clock', type: 'clock', x: 0, y: 0, w: 2, h: 1 },
  { id: 'w-actions', type: 'actions', x: 2, y: 0, w: 2, h: 1 },
  { id: 'w-servers', type: 'servers', x: 0, y: 1, w: 2, h: 2 },
  { id: 'w-messages', type: 'messages', x: 2, y: 1, w: 2, h: 2 },
  { id: 'w-tasks', type: 'tasks', x: 0, y: 3, w: 2, h: 2 },
  { id: 'w-contacts', type: 'contacts', x: 2, y: 3, w: 2, h: 2 },
];
