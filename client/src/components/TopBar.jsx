import Avatar from './Avatar.jsx';
import Logo from './Logo.jsx';
import Icon from './Icon.jsx';
import NotificationBell from './NotificationBell.jsx';

/** Barre du haut : retour, logo (→ accueil), barre vocale, notifications, profil & réglages. */
export default function TopBar({
  user, onHome, onBack, canGoBack, onOpenSettings, onOpenProfile, onLogout,
  voice, voiceName, onLeaveVoice,
  notifications, onOpenNotif, onMarkAllRead, onClearNotifs,
}) {
  return (
    <header className="topbar">
      <button className="topbar-icon topbar-back" title="Retour" onClick={onBack} disabled={!canGoBack}>
        <Icon name="arrow-left" />
      </button>

      <button className="topbar-brand" onClick={onHome} title="Accueil">
        <Logo size={30} row />
      </button>

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
      <button className="topbar-icon" title="Se déconnecter" onClick={onLogout}><Icon name="power-off" /></button>
    </header>
  );
}
