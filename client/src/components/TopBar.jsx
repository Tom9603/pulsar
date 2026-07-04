import Avatar from './Avatar.jsx';
import Logo from './Logo.jsx';

/** Barre du haut : logo (→ accueil), barre vocale connectée, profil & réglages. */
export default function TopBar({ user, onHome, onOpenSettings, onLogout, voice, voiceName, onLeaveVoice }) {
  return (
    <header className="topbar">
      <button className="topbar-brand" onClick={onHome} title="Accueil">
        <Logo size={30} row />
      </button>

      <div className="topbar-spacer" />

      {voice.connectedChannelId && (
        <div className="topbar-voice">
          <span className="tv-dot" /> {voiceName || 'Vocal'}
          <button title={voice.muted ? 'Réactiver le micro' : 'Couper le micro'} onClick={voice.toggleMute}>{voice.muted ? '🔇' : '🎙️'}</button>
          <button title="Quitter le vocal" onClick={onLeaveVoice}>⏏</button>
        </div>
      )}

      <button className="topbar-icon" title="Paramètres" onClick={onOpenSettings}>⚙</button>
      <div className="topbar-user" onClick={onOpenSettings} title="Mon profil">
        <Avatar user={user} size={30} status={user.status} />
        <span className="tu-name">{user.display_name}</span>
      </div>
      <button className="topbar-icon" title="Se déconnecter" onClick={onLogout}>⏻</button>
    </header>
  );
}
