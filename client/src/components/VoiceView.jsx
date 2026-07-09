import { useEffect, useRef } from 'react';
import Avatar from './Avatar.jsx';
import Icon from './Icon.jsx';
import Soundboard from './Soundboard.jsx';

/** Élément vidéo lié à un MediaStream (caméra locale ou distante). */
function VideoStream({ stream, muted, mirror }) {
  const ref = useRef(null);
  useEffect(() => { if (ref.current) ref.current.srcObject = stream || null; }, [stream]);
  return <video ref={ref} className={`voice-video ${mirror ? 'mirror' : ''}`} autoPlay playsInline muted={muted} />;
}

const hasVideo = (stream) => !!stream && stream.getVideoTracks && stream.getVideoTracks().some((t) => t.readyState === 'live');

/**
 * Vue d'un salon vocal avec **audio et vidéo réels** (WebRTC).
 * La connexion vit au niveau de l'app (hook useVoice) et survit à la navigation.
 */
export default function VoiceView({ channel, members, currentUser, connected, muted, canManage, videoOn, localVideoStream, remoteStreams = {}, onJoin, onLeave, onToggleMute, onToggleCamera, onRaiseHand, onLowerHand }) {
  const me = members.find((m) => m.userId === currentUser.id);
  const myHandRaised = me?.handRaised;

  return (
    <div className="voice-stage">
      <span className="voice-badge"><Icon name="volume-high" /> {channel.name}</span>
      <div className="voice-title">Salon vocal</div>

      {members.length === 0 ? (
        <p className="voice-note">Personne dans ce salon. Rejoignez-le pour discuter en vocal avec les autres membres.</p>
      ) : (
        <div className="voice-grid">
          {members.map((m) => {
            const isMe = m.userId === currentUser.id;
            const remote = remoteStreams[m.socketId];
            const showLocal = isMe && videoOn && localVideoStream;
            const showRemote = !isMe && hasVideo(remote);
            return (
              <div className={`voice-tile ${m.speaking ? 'speaking' : ''} ${m.handRaised ? 'hand' : ''} ${showLocal || showRemote ? 'has-video' : ''}`} key={m.socketId}>
                {m.handRaised && <span className="voice-hand" title="A levé la main"><Icon name="hand" /></span>}
                {showLocal ? <VideoStream stream={localVideoStream} muted mirror />
                  : showRemote ? <VideoStream stream={remote} />
                  : <Avatar user={m.user} size={56} />}
                <span className="vname">
                  {m.muted && <span title="Micro coupé"><Icon name="microphone-slash" /> </span>}
                  {m.user.display_name}
                  {isMe && ' (vous)'}
                </span>
                {m.handRaised && canManage && !isMe && (
                  <button className="voice-lower" title="Baisser la main de ce membre" onClick={() => onLowerHand?.(m.socketId)}>
                    <Icon name="hand" /> Baisser
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="voice-controls">
        {connected ? (
          <>
            <button className={`voice-btn ${muted ? 'leave' : ''}`} onClick={onToggleMute}>
              {muted ? <><Icon name="microphone-slash" /> Micro coupé</> : <><Icon name="microphone" /> Micro actif</>}
            </button>
            <button className={`voice-btn ${videoOn ? 'cam-on' : ''}`} onClick={onToggleCamera}>
              <Icon name={videoOn ? 'video' : 'video-slash'} /> {videoOn ? 'Caméra active' : 'Activer la caméra'}
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
        <Icon name="headphones" /> Audio et vidéo en temps réel (WebRTC). Autorisez votre micro (et la caméra) à la première utilisation.
        Le contour vert autour d’un membre indique qu’il parle.
      </p>
    </div>
  );
}
