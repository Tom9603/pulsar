import Avatar from './Avatar.jsx';
import Logo from './Logo.jsx';
import Icon from './Icon.jsx';
import NotificationBell from './NotificationBell.jsx';
import AudioControls from './AudioControls.jsx';
import { useUpdate, openUpdate } from '../update.js';

const STATUS_LABEL = { online: 'En ligne', idle: 'Absent', dnd: 'Ne pas déranger', meeting: 'En réunion', invisible: 'Hors ligne' };

/** Barre du haut : retour, logo (→ accueil), barre vocale, notifications, profil et réglages. */
export default function TopBar({
  user, onHome, onBack, onForward, canGoBack, canGoForward, onOpenSettings, onOpenProfile, onLogout,
  voice, voiceName, onLeaveVoice,
  notifications, onOpenNotif, onMarkAllRead, onClearNotifs,
  onOpenSaved, onOpenReminders, onOpenQuickSearch,
}) {
  const isMac = typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform || '');
  const upd = useUpdate();
  const showUpdateReminder = upd.available && !upd.open && (upd.phase === 'idle' || upd.phase === 'available');
  return (
    <header className="topbar">
      {/* Zone gauche : marque et navigation. */}
      <div className="topbar-left">
        <button className="topbar-brand" onClick={onHome} title="Accueil">
          <Logo size={50} wordmark={false} row />
        </button>
        <div className="topbar-nav">
          {canGoBack && <button className="topbar-arrow" title="Retour" onClick={onBack}><Icon name="arrow-left" /></button>}
          {canGoForward && <button className="topbar-arrow" title="Avancer" onClick={onForward}><Icon name="arrow-right" /></button>}
        </div>
      </div>

      {/* Zone centrale : la recherche et les icônes de consultation, ensemble et centrés. */}
      <div className="topbar-center">
        <button className="topbar-search" onClick={onOpenQuickSearch}>
          <Icon name="magnifying-glass" />
          <span>Rechercher</span>
          <kbd>{isMac ? '⌘' : 'Ctrl'}+K</kbd>
        </button>
        <button className="topbar-icon" title="Messages enregistrés" onClick={onOpenSaved}><Icon name="bookmark" /></button>
        <button className="topbar-icon" title="Mes rappels" onClick={onOpenReminders}><Icon name="clock" /></button>
        <NotificationBell
          notifications={notifications}
          onOpenNotif={onOpenNotif}
          onMarkAllRead={onMarkAllRead}
          onClear={onClearNotifs}
        />
      </div>

      {/* Zone droite : le bloc personnel (audio, réglages, profil). */}
      <div className="topbar-right">
        {voice.connectedChannelId && (
          <div className="topbar-voice">
            <span className="tv-dot" /> {voiceName || 'Vocal'}
            <button title={voice.muted ? 'Réactiver le micro' : 'Couper le micro'} onClick={voice.toggleMute}>
              <Icon name={voice.muted ? 'microphone-slash' : 'microphone'} />
            </button>
            <button title="Quitter le vocal" onClick={onLeaveVoice}><Icon name="right-from-bracket" /></button>
          </div>
        )}

        {showUpdateReminder && (
          <button className="topbar-update" onClick={openUpdate} title="Une nouvelle version est disponible">
            <Icon name="arrows-rotate" /> Mettre à jour
          </button>
        )}

        <AudioControls />
        <button className="topbar-icon" title="Paramètres" onClick={onOpenSettings}><Icon name="gear" /></button>
        <button className="topbar-user" onClick={onOpenProfile} title="Mon profil">
          <Avatar user={user} size={34} status={user.status} />
          <span className="tu-meta">
            <span className="tu-name">{user.display_name}</span>
            <span className="tu-sub">{user.headline || STATUS_LABEL[user.status] || 'En ligne'}</span>
          </span>
        </button>
      </div>
    </header>
  );
}
