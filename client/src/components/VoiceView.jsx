import { useEffect, useRef } from 'react';
import Avatar from './Avatar.jsx';
import Icon from './Icon.jsx';
import Soundboard from './Soundboard.jsx';

/** Élément vidéo lié à un MediaStream (caméra locale/distante ou partage d'écran). */
function VideoStream({ stream, muted, mirror }) {
  const ref = useRef(null);
  useEffect(() => { if (ref.current) ref.current.srcObject = stream || null; }, [stream]);
  return <video ref={ref} className={`voice-video ${mirror ? 'mirror' : ''}`} autoPlay playsInline muted={muted} />;
}

const hasVideo = (stream) => !!stream && stream.getVideoTracks && stream.getVideoTracks().some((t) => t.readyState === 'live');

/**
 * Vue d'un salon vocal avec **audio, vidéo et partage d'écran** (WebRTC).
 * La connexion vit au niveau de l'app (hook useVoice) et survit à la navigation.
 */
export default function VoiceView({
  channel, members, currentUser, connected, muted, canManage,
  videoOn, localVideoStream, screenOn, localScreenStream, remoteStreams = {}, peerVolumes = {},
  onJoin, onLeave, onToggleMute, onToggleCamera, onToggleScreen, onSetPeerVolume, onRaiseHand, onLowerHand,
}) {
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
            const isScreen = isMe ? (screenOn && localScreenStream) : (m.sharingScreen && hasVideo(remote));
            const isCam = isMe ? (videoOn && localVideoStream && !screenOn) : (!m.sharingScreen && hasVideo(remote));
            const stream = isMe ? (isScreen ? localScreenStream : localVideoStream) : remote;
            const vol = peerVolumes[m.socketId] ?? 1;
            return (
              <div className={`voice-tile ${m.speaking ? 'speaking' : ''} ${m.handRaised ? 'hand' : ''} ${isScreen ? 'has-screen' : (isCam ? 'has-video' : '')}`} key={m.socketId}>
                {m.handRaised && <span className="voice-hand" title="A levé la main"><Icon name="hand" /></span>}
                {isScreen && <span className="voice-screen-tag"><Icon name="display" /> Partage d’écran</span>}
                {isScreen ? <VideoStream stream={stream} muted={isMe} />
                  : isCam ? <VideoStream stream={stream} muted={isMe} mirror={isMe} />
                  : <Avatar user={m.user} size={56} />}
                <span className="vname">
                  {m.muted && <span title="Micro coupé"><Icon name="microphone-slash" /> </span>}
                  {m.user.display_name}
                  {isMe && ' (vous)'}
                </span>
                {isScreen && !isMe && (
                  <div className="voice-stream-vol" title="Volume de ce partage (chez vous)">
                    <Icon name={vol === 0 ? 'volume-xmark' : 'volume-high'} />
                    <input type="range" min="0" max="1" step="0.05" value={vol} onChange={(e) => onSetPeerVolume?.(m.socketId, Number(e.target.value))} />
                  </div>
                )}
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
            <button className={`voice-btn ${screenOn ? 'cam-on' : ''}`} onClick={onToggleScreen}>
              <Icon name="display" /> {screenOn ? 'Arrêter le partage' : 'Partager l’écran'}
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
        <Icon name="headphones" /> Audio, vidéo et partage d’écran en temps réel (WebRTC). Autorisez le micro (et la caméra) à la première utilisation.
      </p>
    </div>
  );
}
