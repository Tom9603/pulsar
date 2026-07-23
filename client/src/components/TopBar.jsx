import { useEffect, useState } from 'react';
import Avatar from './Avatar.jsx';
import Logo from './Logo.jsx';
import Icon from './Icon.jsx';
import NotificationBell from './NotificationBell.jsx';
import AudioControls from './AudioControls.jsx';
import { useUpdate, openUpdate } from '../update.js';

const STATUS_LABEL = { online: 'En ligne', idle: 'Absent', dnd: 'Ne pas déranger', meeting: 'En réunion', invisible: 'Invisible' };

/**
 * Carte personnelle de la barre du haut : photo, nom, état de connexion, et
 * une ligne de détails qui défile (statut du moment, intitulé, identifiant)
 * pour tout montrer sans allonger la carte à l'infini.
 */
function UserChip({ user, onOpenProfile }) {
  const details = [
    user.custom_status ? `${user.custom_status_emoji || ''} ${user.custom_status}`.trim() : null,
    user.headline || null,
    user.display_name,
    '@' + user.username,
  ].filter(Boolean);

  const [i, setI] = useState(0);
  const [prev, setPrev] = useState(null); // ligne sortante, le temps du glissement

  useEffect(() => {
    if (details.length < 2) { setI(0); return undefined; }
    const tick = setInterval(() => {
      setI((n) => { setPrev(n); return (n + 1) % details.length; });
    }, 2000);
    return () => clearInterval(tick);
  }, [details.length]);

  // La ligne sortante disparaît une fois son glissement terminé.
  useEffect(() => {
    if (prev === null) return undefined;
    const t = setTimeout(() => setPrev(null), 420);
    return () => clearTimeout(t);
  }, [prev]);

  const statut = STATUS_LABEL[user.status] || 'En ligne';

  return (
    <button className="topbar-user" onClick={onOpenProfile} title="Mon profil">
      <Avatar user={user} size={36} status={user.status} />
      <span className="tu-meta">
        <span className="tu-name">{user.display_name}</span>
        <span className={`tu-status st-${user.status || 'online'}`}>
          <span className="tu-dot" /> {statut}
        </span>
        {/* La ligne de détails glisse vers le haut en fondu : l'ancienne
            s'échappe pendant que la nouvelle monte à sa place. */}
        <span className="tu-sub-wrap">
          {prev !== null && <span className="tu-sub leaving" key={`p${prev}`}>{details[prev]}</span>}
          <span className="tu-sub entering" key={`c${i}`}>{details[i] || ''}</span>
        </span>
      </span>
    </button>
  );
}

/** Barre du haut : retour, logo (→ accueil), barre vocale, notifications, profil et réglages. */
export default function TopBar({
  user, onHome, onBack, onForward, canGoBack, canGoForward, onOpenSettings, onOpenProfile, onLogout,
  voice, voiceName, onLeaveVoice, onReturnVoice, onVoiceChannel,
  notifications, onOpenNotif, onMarkAllRead, onClearNotifs,
  onOpenSaved, onOpenReminders, onOpenQuickSearch, onOpenTasks,
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
        <button className="topbar-icon" title="Tâches" onClick={onOpenTasks}><Icon name="list-check" /></button>
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
          <div className={`topbar-voice ${onVoiceChannel ? '' : 'tv-away'}`}>
            <button className="tv-return" onClick={onReturnVoice} title={onVoiceChannel ? 'Salon vocal en cours' : 'Revenir au salon vocal'} disabled={onVoiceChannel}>
              <span className="tv-dot" />
              <span className="tv-name">{voiceName || 'Vocal'}</span>
              {!onVoiceChannel && <span className="tv-back"><Icon name="right-to-bracket" /> Revenir</span>}
            </button>
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
        <UserChip user={user} onOpenProfile={onOpenProfile} />
      </div>
    </header>
  );
}
