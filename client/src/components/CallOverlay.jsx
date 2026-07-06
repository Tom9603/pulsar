import Avatar from './Avatar.jsx';
import Icon from './Icon.jsx';
import RemoteAudio from './RemoteAudio.jsx';

/** Affiche l'état d'un appel privé (entrant / sortant / en cours) + joue l'audio distant. */
export default function CallOverlay({ call }) {
  const { status, peer, muted, remoteStream, accept, decline, cancel, hangup, toggleMute } = call;
  if (status === 'idle' || !peer) return null;

  return (
    <>
      {remoteStream && <RemoteAudio stream={remoteStream} />}

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

      {status === 'connected' && (
        <div className="call-bar connected">
          <span className="call-live-dot" /> En appel avec <strong>{peer.display_name}</strong>
          <button className="call-icon" title={muted ? 'Réactiver le micro' : 'Couper le micro'} onClick={toggleMute}>
            <Icon name={muted ? 'microphone-slash' : 'microphone'} />
          </button>
          <button className="call-btn decline small" onClick={hangup}>Raccrocher</button>
        </div>
      )}
    </>
  );
}
