import { useEffect, useRef, useState } from 'react';
import { getSocket } from '../socket.js';
import Icon from './Icon.jsx';

// Charge l'API iframe YouTube une seule fois.
let ytApiPromise = null;
function loadYT() {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (ytApiPromise) return ytApiPromise;
  ytApiPromise = new Promise((resolve) => {
    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    document.head.appendChild(tag);
    window.onYouTubeIframeAPIReady = () => resolve(window.YT);
  });
  return ytApiPromise;
}

const isAudioUrl = (u) => /\.(mp3|m4a|wav|ogg)(\?|#|$)/i.test(u || '');

/** Lecture synchronisée (« watch party ») en salon (channelId) ou en message privé (dmUserId). */
export default function WatchTogether({ channelId, dmUserId }) {
  const isDm = dmUserId != null;
  const [session, setSession] = useState(null);
  const [url, setUrl] = useState('');
  const [open, setOpen] = useState(false);
  const socket = getSocket();
  const suppress = useRef(false);
  const ytPlayer = useRef(null);
  const mediaRef = useRef(null);
  const containerRef = useRef(null);

  // Émetteurs (mêmes fonctionnalités, contexte serveur ou privé).
  const emitGet = () => (isDm ? socket.emit('watch:dm:get', { toUserId: dmUserId }) : socket.emit('watch:get', { channelId }));
  const emitStart = (u) => (isDm ? socket.emit('watch:dm:start', { toUserId: dmUserId, url: u }) : socket.emit('watch:start', { channelId, url: u }));
  const emitStop = () => (isDm ? socket.emit('watch:dm:stop', { toUserId: dmUserId }) : socket.emit('watch:stop', { channelId }));
  const emitControl = (playing, time) => (isDm ? socket.emit('watch:dm:control', { toUserId: dmUserId, playing, time }) : socket.emit('watch:control', { channelId, playing, time }));

  useEffect(() => {
    setSession(null);
    setOpen(false);
    emitGet();
    const stateEvent = isDm ? 'watch:dm:state' : 'watch:state';
    const syncEvent = isDm ? 'watch:dm:sync' : 'watch:sync';
    const match = (e) => (isDm ? e.peerId === dmUserId : e.channelId === channelId);
    const onState = (e) => { if (match(e)) { setSession(e.session); if (e.session) setOpen(true); } };
    const onSync = (e) => { if (match(e)) applySync(e.playing, e.time); };
    const onErr = ({ message }) => alert(message);
    socket.on(stateEvent, onState);
    socket.on(syncEvent, onSync);
    socket.on('watch:error', onErr);
    return () => { socket.off(stateEvent, onState); socket.off(syncEvent, onSync); socket.off('watch:error', onErr); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelId, dmUserId]);

  function applySync(playing, time) {
    suppress.current = true;
    const yt = ytPlayer.current;
    const el = mediaRef.current;
    if (yt?.getCurrentTime) {
      if (Math.abs((yt.getCurrentTime() || 0) - time) > 1.5) yt.seekTo(time, true);
      if (playing) yt.playVideo(); else yt.pauseVideo();
    } else if (el) {
      if (Math.abs(el.currentTime - time) > 1.5) el.currentTime = time;
      if (playing) el.play().catch(() => {}); else el.pause();
    }
    setTimeout(() => { suppress.current = false; }, 500);
  }
  const broadcast = (playing, time) => { if (!suppress.current) emitControl(playing, time); };

  // Lecteur YouTube
  useEffect(() => {
    if (session?.kind !== 'youtube') return;
    let destroyed = false;
    loadYT().then((YT) => {
      if (destroyed || !containerRef.current) return;
      ytPlayer.current = new YT.Player(containerRef.current, {
        videoId: session.mediaId,
        playerVars: { autoplay: 1, controls: 1, rel: 0 },
        events: {
          onReady: (e) => { e.target.seekTo(session.time || 0, true); if (session.playing) e.target.playVideo(); },
          onStateChange: (e) => {
            const t = e.target.getCurrentTime?.() || 0;
            if (e.data === YT.PlayerState.PLAYING) broadcast(true, t);
            else if (e.data === YT.PlayerState.PAUSED) broadcast(false, t);
          },
        },
      });
    });
    return () => { destroyed = true; try { ytPlayer.current?.destroy(); } catch { /* ignore */ } ytPlayer.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.kind, session?.mediaId]);

  const start = () => { if (url.trim()) { emitStart(url.trim()); setUrl(''); } };
  const stop = () => emitStop();

  if (!session && !open) {
    return <div className="watch-bar"><button className="watch-open-btn" onClick={() => setOpen(true)}><Icon name="tv" /> Regarder / écouter ensemble</button></div>;
  }

  return (
    <div className="watch-panel">
      <div className="watch-head">
        <span><Icon name="tv" /> Regarder ensemble</span>
        <div className="watch-head-actions">
          {session && <button className="watch-stop" onClick={stop}>Arrêter</button>}
          <button onClick={() => setOpen(false)} title="Réduire"><Icon name="xmark" /></button>
        </div>
      </div>

      {!session ? (
        <div className="watch-start">
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="Collez un lien à regarder ou écouter ensemble…"
            onKeyDown={(e) => e.key === 'Enter' && start()}
          />
          <button className="btn" style={{ width: 'auto', padding: '0 18px' }} onClick={start}>Lancer</button>
        </div>
      ) : session.kind === 'youtube' ? (
        <div className="watch-media" key={'yt-' + session.mediaId}><div ref={containerRef} /></div>
      ) : isAudioUrl(session.url) ? (
        <audio
          ref={mediaRef} className="watch-audio" controls autoPlay src={session.url}
          onPlay={() => broadcast(true, mediaRef.current.currentTime)}
          onPause={() => broadcast(false, mediaRef.current.currentTime)}
          onSeeked={() => broadcast(!mediaRef.current.paused, mediaRef.current.currentTime)}
        />
      ) : (
        <video
          ref={mediaRef} className="watch-media-el" controls autoPlay src={session.url}
          onPlay={() => broadcast(true, mediaRef.current.currentTime)}
          onPause={() => broadcast(false, mediaRef.current.currentTime)}
          onSeeked={() => broadcast(!mediaRef.current.paused, mediaRef.current.currentTime)}
        />
      )}
    </div>
  );
}
