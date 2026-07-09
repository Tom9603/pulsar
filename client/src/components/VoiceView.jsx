import Avatar from './Avatar.jsx';
import Icon from './Icon.jsx';
import Soundboard from './Soundboard.jsx';

/**
 * Vue d'un salon vocal avec **audio réel** (WebRTC).
 * La connexion vit au niveau de l'app (hook useVoice) et survit à la navigation ;
 * ce composant ne gère que l'affichage et les boutons.
 */
export default function VoiceView({ channel, members, currentUser, connected, muted, canManage, onJoin, onLeave, onToggleMute, onRaiseHand, onLowerHand }) {
  const myHandRaised = members.find((m) => m.userId === currentUser.id)?.handRaised;

  return (
    <div className="voice-stage">
      <span className="voice-badge"><Icon name="volume-high" /> {channel.name}</span>
      <div className="voice-title">Salon vocal</div>

      {members.length === 0 ? (
        <p className="voice-note">Personne dans ce salon. Rejoignez-le pour discuter en vocal avec les autres membres.</p>
      ) : (
        <div className="voice-grid">
          {members.map((m) => (
            <div className={`voice-tile ${m.speaking ? 'speaking' : ''} ${m.handRaised ? 'hand' : ''}`} key={m.socketId}>
              {m.handRaised && <span className="voice-hand" title="A levé la main"><Icon name="hand" /></span>}
              <Avatar user={m.user} size={56} />
              <span className="vname">
                {m.muted && <span title="Micro coupé"><Icon name="microphone-slash" /> </span>}
                {m.user.display_name}
                {m.userId === currentUser.id && ' (vous)'}
              </span>
              {m.handRaised && canManage && m.userId !== currentUser.id && (
                <button className="voice-lower" title="Baisser la main de ce membre" onClick={() => onLowerHand?.(m.socketId)}>
                  <Icon name="hand" /> Baisser
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="voice-controls">
        {connected ? (
          <>
            <button className={`voice-btn ${muted ? 'leave' : ''}`} onClick={onToggleMute}>
              {muted ? <><Icon name="microphone-slash" /> Micro coupé</> : <><Icon name="microphone" /> Micro actif</>}
            </button>
            <button className={`voice-btn ${myHandRaised ? 'hand-on' : ''}`} onClick={() => onRaiseHand?.(!myHandRaised)}>
              <Icon name="hand" /> {myHandRaised ? 'Baisser la main' : 'Lever la main'}
            </button>
            <button className="voice-btn leave" onClick={onLeave}>Se déconnecter</button>
          </>
        ) : (
          <button className="voice-btn join" onClick={onJoin}>Rejoindre le salon vocal</button>
        )}
      </div>

      {connected && <Soundboard channelId={channel.id} serverId={channel.server_id} />}

      <p className="voice-note" style={{ fontSize: 12, opacity: 0.7 }}>
        <Icon name="headphones" /> Audio en temps réel (WebRTC). Autorisez votre micro à la première connexion.
        Le contour vert autour d’un membre indique qu’il parle.
      </p>
    </div>
  );
}
