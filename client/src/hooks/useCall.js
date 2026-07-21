import { useCallback, useEffect, useRef, useState } from 'react';
import { getSocket } from '../socket.js';
import { notify } from '../notice.js';
import { api } from '../api.js';
import { playPing } from '../notify.js';

const DEFAULT_ICE = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

/** Appel vocal privé 1-à-1 (WebRTC). Statuts : idle | calling | incoming | connected. */
export function useCall() {
  const [status, setStatus] = useState('idle');
  const [peer, setPeer] = useState(null);
  const [muted, setMuted] = useState(false);
  const [remoteStream, setRemoteStream] = useState(null);
  const [screenOn, setScreenOn] = useState(false);
  const [localScreenStream, setLocalScreenStream] = useState(null);
  const [videoOn, setVideoOn] = useState(false);
  const [localVideoStream, setLocalVideoStream] = useState(null);
  const [remoteVideoKind, setRemoteVideoKind] = useState('none'); // 'none' | 'camera' | 'screen'
  const [remoteVolume, setRemoteVolume] = useState(1); // volume local du correspondant (utile pour un partage)

  const callId = useRef(null);
  const pc = useRef(null);
  const peerSid = useRef(null);
  const localStream = useRef(null);
  const screenStream = useRef(null);
  const videoStream = useRef(null);
  const iceConfig = useRef(DEFAULT_ICE);
  const mutedRef = useRef(false);
  const statusRef = useRef('idle');
  const socket = getSocket();

  useEffect(() => { statusRef.current = status; }, [status]);
  useEffect(() => {
    api('/ice').then((c) => { if (c?.iceServers?.length) iceConfig.current = c; }).catch(() => {});
  }, []);

  const teardown = useCallback(() => {
    if (pc.current) { pc.current.close(); pc.current = null; }
    if (localStream.current) { localStream.current.getTracks().forEach((t) => t.stop()); localStream.current = null; }
    if (screenStream.current) { screenStream.current.getTracks().forEach((t) => t.stop()); screenStream.current = null; }
    if (videoStream.current) { videoStream.current.getTracks().forEach((t) => t.stop()); videoStream.current = null; }
    setRemoteStream(null);
    setLocalScreenStream(null);
    setScreenOn(false);
    setLocalVideoStream(null);
    setVideoOn(false);
    setRemoteVideoKind('none');
    peerSid.current = null;
    callId.current = null;
  }, []);

  const reset = useCallback(() => {
    teardown();
    setStatus('idle');
    setPeer(null);
    setMuted(false);
    mutedRef.current = false;
    setRemoteVolume(1);
  }, [teardown]);

  async function getMic() {
    const s = await navigator.mediaDevices.getUserMedia({ audio: true });
    localStream.current = s;
    s.getAudioTracks().forEach((t) => (t.enabled = !mutedRef.current));
    return s;
  }

  const makePc = useCallback((peerSocketId, initiator) => {
    const p = new RTCPeerConnection(iceConfig.current);
    pc.current = p;
    peerSid.current = peerSocketId;
    if (localStream.current) localStream.current.getTracks().forEach((t) => p.addTrack(t, localStream.current));
    p.onicecandidate = (e) => {
      if (e.candidate) socket.emit('call:signal', { targetSocketId: peerSocketId, data: { candidate: e.candidate } });
    };
    p.ontrack = (e) => setRemoteStream(e.streams[0]);
    if (initiator) {
      (async () => {
        try {
          const offer = await p.createOffer();
          await p.setLocalDescription(offer);
          socket.emit('call:signal', { targetSocketId: peerSocketId, data: { sdp: p.localDescription } });
        } catch { /* ignore */ }
      })();
    }
    return p;
  }, [socket]);

  const startCall = useCallback(async (target) => {
    if (statusRef.current !== 'idle') return;
    try { await getMic(); } catch { notify('Micro inaccessible : autorise le microphone pour appeler.'); return; }
    setPeer(target);
    setStatus('calling');
    socket.emit('call:invite', { toUserId: target.id });
  }, [socket]);

  const accept = useCallback(async () => {
    try {
      await getMic();
    } catch {
      notify('Micro inaccessible.');
      socket.emit('call:decline', { callId: callId.current });
      reset();
      return;
    }
    socket.emit('call:accept', { callId: callId.current });
  }, [socket, reset]);

  const decline = useCallback(() => { socket.emit('call:decline', { callId: callId.current }); reset(); }, [socket, reset]);
  const cancel = useCallback(() => { socket.emit('call:cancel', { callId: callId.current }); reset(); }, [socket, reset]);
  const hangup = useCallback(() => { socket.emit('call:end', { callId: callId.current }); reset(); }, [socket, reset]);
  const toggleMute = useCallback(() => {
    setMuted((m) => {
      const n = !m;
      mutedRef.current = n;
      localStream.current?.getAudioTracks().forEach((t) => (t.enabled = !n));
      return n;
    });
  }, []);

  // Renégocie la connexion après avoir ajouté/retiré une piste, en indiquant au
  // correspondant CE QUE l'on partage désormais (caméra, écran, ou rien) pour
  // qu'il l'affiche avec le bon libellé.
  const renegotiate = useCallback(async (mediaKind) => {
    const p = pc.current; if (!p) return;
    try {
      const offer = await p.createOffer();
      await p.setLocalDescription(offer);
      socket.emit('call:signal', { targetSocketId: peerSid.current, data: { sdp: p.localDescription, mediaKind } });
    } catch { /* ignore */ }
  }, [socket]);

  const stopStream = useCallback((ref) => {
    const p = pc.current; const s = ref.current;
    if (!s) return;
    for (const track of s.getTracks()) {
      const sender = p?.getSenders().find((sd) => sd.track === track);
      if (sender && p) p.removeTrack(sender);
      track.stop();
    }
    ref.current = null;
  }, []);

  const toggleScreenRef = useRef(null);
  const toggleCameraRef = useRef(null);
  const toggleScreen = useCallback(async () => {
    const p = pc.current;
    if (!p) return;
    if (screenStream.current) {
      stopStream(screenStream);
      setLocalScreenStream(null);
      setScreenOn(false);
      await renegotiate(videoStream.current ? 'camera' : 'none');
    } else {
      let disp;
      try { disp = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true }); }
      catch { return; }
      // Écran et caméra sont exclusifs : on coupe la caméra si elle tournait.
      if (videoStream.current) { stopStream(videoStream); setLocalVideoStream(null); setVideoOn(false); }
      screenStream.current = disp;
      for (const track of disp.getTracks()) p.addTrack(track, disp);
      const vt = disp.getVideoTracks()[0];
      if (vt) vt.onended = () => toggleScreenRef.current?.();
      setLocalScreenStream(disp);
      setScreenOn(true);
      await renegotiate('screen');
    }
  }, [socket, renegotiate, stopStream]);
  useEffect(() => { toggleScreenRef.current = toggleScreen; }, [toggleScreen]);

  const toggleCamera = useCallback(async () => {
    const p = pc.current;
    if (!p) return;
    if (videoStream.current) {
      stopStream(videoStream);
      setLocalVideoStream(null);
      setVideoOn(false);
      await renegotiate(screenStream.current ? 'screen' : 'none');
    } else {
      let cam;
      try { cam = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 640 }, height: { ideal: 480 } } }); }
      catch { notify('Caméra inaccessible : autorisez la caméra pour l’activer.'); return; }
      // Écran et caméra sont exclusifs : on coupe le partage d'écran s'il tournait.
      if (screenStream.current) { stopStream(screenStream); setLocalScreenStream(null); setScreenOn(false); }
      videoStream.current = cam;
      for (const track of cam.getTracks()) p.addTrack(track, cam);
      setLocalVideoStream(cam);
      setVideoOn(true);
      await renegotiate('camera');
    }
  }, [renegotiate, stopStream]);
  useEffect(() => { toggleCameraRef.current = toggleCamera; }, [toggleCamera]);

  useEffect(() => {
    const onIncoming = ({ callId: id, from }) => {
      if (statusRef.current !== 'idle') { socket.emit('call:decline', { callId: id }); return; }
      callId.current = id;
      setPeer(from);
      setStatus('incoming');
      playPing();
    };
    const onRinging = ({ callId: id }) => { callId.current = id; };
    const onAccepted = ({ peerSocketId }) => { setStatus('connected'); makePc(peerSocketId, true); };
    const onConnected = ({ peerSocketId }) => { setStatus('connected'); makePc(peerSocketId, false); };
    const onSignal = async ({ fromSocketId, data }) => {
      const p = pc.current || makePc(fromSocketId, false);
      if (data.mediaKind !== undefined) setRemoteVideoKind(data.mediaKind);
      try {
        if (data.sdp) {
          await p.setRemoteDescription(data.sdp);
          if (data.sdp.type === 'offer') {
            const ans = await p.createAnswer();
            await p.setLocalDescription(ans);
            socket.emit('call:signal', { targetSocketId: fromSocketId, data: { sdp: p.localDescription } });
          }
        } else if (data.candidate) {
          await p.addIceCandidate(data.candidate);
        }
      } catch { /* ignore */ }
    };
    const onEnded = () => reset();
    const onDeclined = () => reset();
    const onCanceled = () => reset();
    const onUnavailable = () => { notify('Personne indisponible (hors ligne).'); reset(); };

    socket.on('call:incoming', onIncoming);
    socket.on('call:ringing', onRinging);
    socket.on('call:accepted', onAccepted);
    socket.on('call:connected', onConnected);
    socket.on('call:signal', onSignal);
    socket.on('call:ended', onEnded);
    socket.on('call:declined', onDeclined);
    socket.on('call:canceled', onCanceled);
    socket.on('call:unavailable', onUnavailable);
    return () => {
      socket.off('call:incoming', onIncoming);
      socket.off('call:ringing', onRinging);
      socket.off('call:accepted', onAccepted);
      socket.off('call:connected', onConnected);
      socket.off('call:signal', onSignal);
      socket.off('call:ended', onEnded);
      socket.off('call:declined', onDeclined);
      socket.off('call:canceled', onCanceled);
      socket.off('call:unavailable', onUnavailable);
    };
  }, [socket, makePc, reset]);

  return { status, peer, muted, remoteStream, screenOn, localScreenStream, videoOn, localVideoStream, remoteVideoKind, remoteVolume, setRemoteVolume, startCall, accept, decline, cancel, hangup, toggleMute, toggleScreen, toggleCamera };
}
