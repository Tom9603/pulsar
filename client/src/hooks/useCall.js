import { useCallback, useEffect, useRef, useState } from 'react';
import { getSocket } from '../socket.js';
import { api } from '../api.js';
import { playPing } from '../notify.js';

const DEFAULT_ICE = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

/** Appel vocal privé 1-à-1 (WebRTC). Statuts : idle | calling | incoming | connected. */
export function useCall() {
  const [status, setStatus] = useState('idle');
  const [peer, setPeer] = useState(null);
  const [muted, setMuted] = useState(false);
  const [remoteStream, setRemoteStream] = useState(null);

  const callId = useRef(null);
  const pc = useRef(null);
  const localStream = useRef(null);
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
    setRemoteStream(null);
    callId.current = null;
  }, []);

  const reset = useCallback(() => {
    teardown();
    setStatus('idle');
    setPeer(null);
    setMuted(false);
    mutedRef.current = false;
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
    try { await getMic(); } catch { alert('Micro inaccessible : autorise le microphone pour appeler.'); return; }
    setPeer(target);
    setStatus('calling');
    socket.emit('call:invite', { toUserId: target.id });
  }, [socket]);

  const accept = useCallback(async () => {
    try {
      await getMic();
    } catch {
      alert('Micro inaccessible.');
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
    const onUnavailable = () => { alert('Personne indisponible (hors ligne).'); reset(); };

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

  return { status, peer, muted, remoteStream, startCall, accept, decline, cancel, hangup, toggleMute };
}
