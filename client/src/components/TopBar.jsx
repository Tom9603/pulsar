import Avatar from './Avatar.jsx';
import Logo from './Logo.jsx';
import Icon from './Icon.jsx';
import NotificationBell from './NotificationBell.jsx';

/** Barre du haut : retour, logo (→ accueil), barre vocale, notifications, profil et réglages. */
export default function TopBar({
  user, onHome, onBack, onForward, canGoBack, canGoForward, onOpenSettings, onOpenProfile, onLogout,
  voice, voiceName, onLeaveVoice,
  notifications, onOpenNotif, onMarkAllRead, onClearNotifs,
}) {
  return (
    <header className="topbar">
      <div className="topbar-left">
        <button className="topbar-brand" onClick={onHome} title="Accueil">
          <Logo size={30} row />
        </button>
        <div className="topbar-nav">
          {canGoBack && <button className="topbar-arrow" title="Retour" onClick={onBack}><Icon name="arrow-left" /></button>}
          {canGoForward && <button className="topbar-arrow" title="Avancer" onClick={onForward}><Icon name="arrow-right" /></button>}
        </div>
      </div>

      <div className="topbar-spacer" />

      {voice.connectedChannelId && (
        <div className="topbar-voice">
          <span className="tv-dot" /> {voiceName || 'Vocal'}
          <button title={voice.muted ? 'Réactiver le micro' : 'Couper le micro'} onClick={voice.toggleMute}>
            <Icon name={voice.muted ? 'microphone-slash' : 'microphone'} />
          </button>
          <button title="Quitter le vocal" onClick={onLeaveVoice}><Icon name="right-from-bracket" /></button>
        </div>
      )}

      <NotificationBell
        notifications={notifications}
        onOpenNotif={onOpenNotif}
        onMarkAllRead={onMarkAllRead}
        onClear={onClearNotifs}
      />

      <button className="topbar-icon" title="Paramètres" onClick={onOpenSettings}><Icon name="gear" /></button>
      <div className="topbar-user" onClick={onOpenProfile} title="Mon profil">
        <Avatar user={user} size={30} status={user.status} />
        <span className="tu-name">{user.display_name}</span>
      </div>
    </header>
  );
}
