import { useEffect, useRef } from 'react';
import Avatar from './Avatar.jsx';
import Icon from './Icon.jsx';
import RemoteAudio from './RemoteAudio.jsx';

function VideoEl({ stream, muted }) {
  const ref = useRef(null);
  useEffect(() => { if (ref.current) ref.current.srcObject = stream || null; }, [stream]);
  return <video ref={ref} autoPlay playsInline muted={muted} />;
}

const hasVideo = (s) => !!s && s.getVideoTracks && s.getVideoTracks().some((t) => t.readyState === 'live');

/** Affiche l'état d'un appel privé (entrant / sortant / en cours), l'audio, la vidéo et le partage d'écran. */
export default function CallOverlay({ call }) {
  const { status, peer, muted, remoteStream, screenOn, localScreenStream, remoteVolume = 1, setRemoteVolume,
    accept, decline, cancel, hangup, toggleMute, toggleScreen } = call;
  if (status === 'idle' || !peer) return null;

  const remoteScreen = hasVideo(remoteStream); // en MP, une vidéo = un partage d'écran
  const showPanel = status === 'connected' && (remoteScreen || (screenOn && localScreenStream));

  return (
    <>
      {remoteStream && <RemoteAudio stream={remoteStream} volume={remoteVolume} />}

      {status === 'incoming' && (
        <div className="call-modal-backdrop">
          <div className="call-modal">
            <Avatar user={peer} size={72} />
            <div className="call-name">{peer.display_name}</div>
            <div className="call-sub">Appel entrant…</div>
            <div className="call-actions">
              <button className="call-btn decline" onClick={decline}>Refuser</button>
              <button className="call-btn accept" onClick={accept}>Accepter</button>
            </div>
          </div>
        </div>
      )}

      {status === 'calling' && (
        <div className="call-bar">
          <Avatar user={peer} size={28} />
          <span>Appel de {peer.display_name}…</span>
          <button className="call-btn decline small" onClick={cancel}>Annuler</button>
        </div>
      )}

      {showPanel && (
        <div className="call-video">
          <div className="call-video-tag">
            <Icon name="display" /> {remoteScreen ? `Écran de ${peer.display_name}` : 'Vous partagez votre écran'}
          </div>
          <VideoEl stream={remoteScreen ? remoteStream : localScreenStream} muted={!remoteScreen} />
          {remoteScreen && (
            <div className="call-video-vol" title="Volume du partage (chez vous)">
              <Icon name={remoteVolume === 0 ? 'volume-xmark' : 'volume-high'} />
              <input type="range" min="0" max="1" step="0.05" value={remoteVolume} onChange={(e) => setRemoteVolume?.(Number(e.target.value))} />
            </div>
          )}
        </div>
      )}

      {status === 'connected' && (
        <div className="call-bar connected">
          <span className="call-live-dot" /> En appel avec <strong>{peer.display_name}</strong>
          <button className="call-icon" title={muted ? 'Réactiver le micro' : 'Couper le micro'} onClick={toggleMute}>
            <Icon name={muted ? 'microphone-slash' : 'microphone'} />
          </button>
          <button className={`call-icon ${screenOn ? 'on' : ''}`} title={screenOn ? 'Arrêter le partage d’écran' : 'Partager l’écran'} onClick={toggleScreen}>
            <Icon name="display" />
          </button>
          <button className="call-btn decline small" onClick={hangup}>Raccrocher</button>
        </div>
      )}
    </>
  );
}
