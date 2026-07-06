import { useCallback, useEffect, useRef, useState } from 'react';
import { getSocket } from '../socket.js';
import { api } from '../api.js';
import { getAudio, setAudio, subscribeAudio } from '../audio.js';

// Config par défaut (STUN seul) ; la vraie config (avec TURN) est récupérée depuis le serveur.
const DEFAULT_ICE = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

/**
 * Gère la connexion vocale WebRTC en maillage (chaque pair se connecte à tous les autres).
 * Le nouveau venu initie les offres vers les pairs déjà présents.
 * La connexion vit au niveau de l'app : elle survit à la navigation entre salons.
 */
export function useVoice() {
  const [connectedChannelId, setConnectedChannelId] = useState(null);
  const [muted, setMuted] = useState(getAudio().micMuted);
  const [remoteStreams, setRemoteStreams] = useState({}); // socketId -> MediaStream

  const pcs = useRef(new Map()); // socketId -> RTCPeerConnection
  const localStream = useRef(null);
  const rawStream = useRef(null);   // flux micro brut (avant gain)
  const gainRef = useRef(null);     // gain du micro (volume d'entrée)
  const gainCtx = useRef(null);     // contexte audio pour le gain d'entrée
  const mutedRef = useRef(getAudio().micMuted);
  const speakingRef = useRef(false);
  const audioCtx = useRef(null);
  const rafId = useRef(null);
  const iceConfig = useRef(DEFAULT_ICE);

  const socket = getSocket();

  // Applique l'état du micro (couper / volume d'entrée) à la piste sortante.
  const applyMic = useCallback((next) => {
    mutedRef.current = next;
    setMuted(next);
    localStream.current?.getAudioTracks().forEach((t) => (t.enabled = !next));
    if (connectedChannelId != null) socket.emit('voice:mute', { muted: next });
    if (next && speakingRef.current) { speakingRef.current = false; socket.emit('voice:speaking', { speaking: false }); }
  }, [connectedChannelId, socket]);

  // Réagit aux changements globaux (bouton mute de partout, volume d'entrée).
  useEffect(() => subscribeAudio((a) => {
    if (a.micMuted !== mutedRef.current) applyMic(a.micMuted);
    if (gainRef.current) gainRef.current.gain.value = a.inVol;
  }), [applyMic]);

  // Récupère la config ICE/TURN du serveur au montage.
  useEffect(() => {
    api('/ice')
      .then((cfg) => { if (cfg?.iceServers?.length) iceConfig.current = cfg; })
      .catch(() => {});
  }, []);

  const removePeer = useCallback((socketId) => {
    const pc = pcs.current.get(socketId);
    if (pc) {
      pc.onicecandidate = null;
      pc.ontrack = null;
      pc.close();
      pcs.current.delete(socketId);
    }
    setRemoteStreams((prev) => {
      if (!(socketId in prev)) return prev;
      const next = { ...prev };
      delete next[socketId];
      return next;
    });
  }, []);

  const createPeer = useCallback((peerSocketId, initiator) => {
    if (pcs.current.has(peerSocketId)) return pcs.current.get(peerSocketId);
    const pc = new RTCPeerConnection(iceConfig.current);
    pcs.current.set(peerSocketId, pc);

    if (localStream.current) {
      for (const track of localStream.current.getTracks()) pc.addTrack(track, localStream.current);
    }

    pc.onicecandidate = (e) => {
      if (e.candidate) socket.emit('voice:signal', { targetSocketId: peerSocketId, data: { candidate: e.candidate } });
    };
    pc.ontrack = (e) => {
      const [stream] = e.streams;
      setRemoteStreams((prev) => ({ ...prev, [peerSocketId]: stream }));
    };
    pc.onconnectionstatechange = () => {
      if (['failed', 'closed', 'disconnected'].includes(pc.connectionState)) removePeer(peerSocketId);
    };

    if (initiator) {
      (async () => {
        try {
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          socket.emit('voice:signal', { targetSocketId: peerSocketId, data: { sdp: pc.localDescription } });
        } catch (err) {
          console.warn('offer error', err);
        }
      })();
    }
    return pc;
  }, [socket, removePeer]);

  // --- Détection locale de la parole (envoyée aux autres via le serveur) ---
  const startSpeakingDetection = useCallback((stream) => {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      audioCtx.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);

      const tick = () => {
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) {
          const v = (data[i] - 128) / 128;
          sum += v * v;
        }
        const rms = Math.sqrt(sum / data.length);
        const speaking = !mutedRef.current && rms > 0.04;
        if (speaking !== speakingRef.current) {
          speakingRef.current = speaking;
          socket.emit('voice:speaking', { speaking });
        }
        rafId.current = requestAnimationFrame(tick);
      };
      tick();
    } catch (err) {
      console.warn('speaking detection off', err);
    }
  }, [socket]);

  const teardown = useCallback(() => {
    for (const id of [...pcs.current.keys()]) removePeer(id);
    if (rafId.current) cancelAnimationFrame(rafId.current);
    rafId.current = null;
    if (audioCtx.current) { audioCtx.current.close().catch(() => {}); audioCtx.current = null; }
    if (gainCtx.current) { gainCtx.current.close().catch(() => {}); gainCtx.current = null; }
    gainRef.current = null;
    if (localStream.current) { localStream.current.getTracks().forEach((t) => t.stop()); localStream.current = null; }
    if (rawStream.current) { rawStream.current.getTracks().forEach((t) => t.stop()); rawStream.current = null; }
    speakingRef.current = false;
  }, [removePeer]);

  const join = useCallback(async (channelId) => {
    if (connectedChannelId === channelId) return;
    teardown(); // quitter une éventuelle connexion précédente
    const a = getAudio();
    let raw;
    try {
      raw = await navigator.mediaDevices.getUserMedia({ audio: a.inDevice ? { deviceId: { exact: a.inDevice } } : true });
    } catch {
      try { raw = await navigator.mediaDevices.getUserMedia({ audio: true }); }
      catch { alert('Micro inaccessible : autorisez le microphone dans votre navigateur pour parler.'); return; }
    }
    rawStream.current = raw;
    // Volume d'entrée : on route le micro dans un GainNode (repli sur le flux brut en cas d'échec).
    let stream = raw;
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const src = ctx.createMediaStreamSource(raw);
      const gain = ctx.createGain();
      gain.gain.value = a.inVol;
      const dest = ctx.createMediaStreamDestination();
      src.connect(gain); gain.connect(dest);
      gainRef.current = gain; gainCtx.current = ctx;
      stream = dest.stream;
    } catch { stream = raw; gainRef.current = null; }
    localStream.current = stream;
    stream.getAudioTracks().forEach((t) => (t.enabled = !mutedRef.current));
    startSpeakingDetection(stream);
    socket.emit('voice:join', { channelId });
    setConnectedChannelId(channelId);
  }, [connectedChannelId, socket, teardown, startSpeakingDetection]);

  const leave = useCallback(() => {
    socket.emit('voice:leave');
    if (speakingRef.current) socket.emit('voice:speaking', { speaking: false });
    teardown();
    setConnectedChannelId(null);
  }, [socket, teardown]);

  const toggleMute = useCallback(() => {
    setAudio({ micMuted: !getAudio().micMuted });
  }, []);

  // Écoute des évènements de signalisation (montés une seule fois)
  useEffect(() => {
    const onPeers = ({ peers }) => {
      for (const p of peers) createPeer(p.socketId, true);
    };
    const onSignal = async ({ fromSocketId, data }) => {
      const pc = pcs.current.get(fromSocketId) || createPeer(fromSocketId, false);
      try {
        if (data.sdp) {
          await pc.setRemoteDescription(data.sdp);
          if (data.sdp.type === 'offer') {
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            socket.emit('voice:signal', { targetSocketId: fromSocketId, data: { sdp: pc.localDescription } });
          }
        } else if (data.candidate) {
          await pc.addIceCandidate(data.candidate);
        }
      } catch (err) {
        console.warn('signal error', err);
      }
    };
    const onPeerLeft = ({ socketId }) => removePeer(socketId);

    socket.on('voice:peers', onPeers);
    socket.on('voice:signal', onSignal);
    socket.on('voice:peer-left', onPeerLeft);
    return () => {
      socket.off('voice:peers', onPeers);
      socket.off('voice:signal', onSignal);
      socket.off('voice:peer-left', onPeerLeft);
    };
  }, [socket, createPeer, removePeer]);

  // Nettoyage à la fermeture de l'app
  useEffect(() => () => teardown(), [teardown]);

  return { connectedChannelId, muted, remoteStreams, join, leave, toggleMute };
}
