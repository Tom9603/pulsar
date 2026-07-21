import { useEffect, useRef } from 'react';
import Avatar from './Avatar.jsx';
import Icon from './Icon.jsx';
import RemoteAudio from './RemoteAudio.jsx';

function VideoEl({ stream, muted, className }) {
  const ref = useRef(null);
  useEffect(() => { if (ref.current) ref.current.srcObject = stream || null; }, [stream]);
  return <video ref={ref} autoPlay playsInline muted={muted} className={className} />;
}

const hasVideo = (s) => !!s && s.getVideoTracks && s.getVideoTracks().some((t) => t.readyState === 'live');

/** Affiche l'état d'un appel privé (entrant / sortant / en cours), l'audio, la caméra et le partage d'écran. */
export default function CallOverlay({ call }) {
  const { status, peer, muted, remoteStream, screenOn, localScreenStream,
    videoOn, localVideoStream, remoteVideoKind = 'none',
    remoteVolume = 1, setRemoteVolume, accept, decline, cancel, hangup, toggleMute, toggleScreen, toggleCamera } = call;
  if (status === 'idle' || !peer) return null;

  const remoteHasVideo = hasVideo(remoteStream);
  // Ce que montre la grande zone : en priorité la vidéo du correspondant, sinon
  // votre propre partage (écran ou caméra) pour vous voir aussi.
  const showPanel = status === 'connected' && (remoteHasVideo || (screenOn && localScreenStream) || (videoOn && localVideoStream));
  const main = remoteHasVideo
    ? { stream: remoteStream, muted: false, label: remoteVideoKind === 'camera' ? `Caméra de ${peer.display_name}` : `Écran de ${peer.display_name}`, icon: remoteVideoKind === 'camera' ? 'video' : 'display', isRemoteScreen: remoteVideoKind !== 'camera' }
    : (screenOn && localScreenStream)
      ? { stream: localScreenStream, muted: true, label: 'Vous partagez votre écran', icon: 'display', isRemoteScreen: false }
      : { stream: localVideoStream, muted: true, label: 'Votre caméra', icon: 'video', isRemoteScreen: false };
  // Vignette de sa propre caméra, sauf si elle occupe déjà la grande zone.
  const showSelfPip = videoOn && localVideoStream && main.stream !== localVideoStream;

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
            <Icon name={main.icon} /> {main.label}
          </div>
          <VideoEl stream={main.stream} muted={main.muted} />
          {showSelfPip && (
            <div className="call-self-pip"><VideoEl stream={localVideoStream} muted /></div>
          )}
          {main.isRemoteScreen && (
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
          <button className={`call-icon ${videoOn ? 'on' : ''}`} title={videoOn ? 'Couper la caméra' : 'Activer la caméra'} onClick={toggleCamera}>
            <Icon name={videoOn ? 'video' : 'video-slash'} />
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
