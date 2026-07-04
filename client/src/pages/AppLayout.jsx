import { useEffect, useState, useCallback, useRef } from 'react';
import { api } from '../api.js';
import { getSocket } from '../socket.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useVoice } from '../hooks/useVoice.js';
import { useCall } from '../hooks/useCall.js';
import { makeCan } from '../permissions.js';
import { initNotifications, playPing, desktopNotify } from '../notify.js';

/** Le message mentionne-t-il l'utilisateur (@pseudo) ? */
function mentionsUser(content, user) {
  if (!content) return false;
  const low = content.toLowerCase();
  return low.includes('@' + user.username.toLowerCase()) || low.includes('@' + user.display_name.toLowerCase());
}

import ServerRail from '../components/ServerRail.jsx';
import ChannelSidebar from '../components/ChannelSidebar.jsx';
import UserPanel from '../components/UserPanel.jsx';
import ChatView from '../components/ChatView.jsx';
import VoiceView from '../components/VoiceView.jsx';
import MemberList from '../components/MemberList.jsx';
import DmSidebar from '../components/DmSidebar.jsx';
import DmChat from '../components/DmChat.jsx';
import CreateServerModal from '../components/CreateServerModal.jsx';
import SettingsModal from '../components/SettingsModal.jsx';
import RolesModal from '../components/RolesModal.jsx';
import MemberModal from '../components/MemberModal.jsx';
import CallOverlay from '../components/CallOverlay.jsx';

export default function AppLayout() {
  const { user } = useAuth();
  const voice = useVoice();
  const call = useCall();

  const [view, setView] = useState('server'); // 'server' | 'dm'
  const [servers, setServers] = useState([]);
  const [activeServerId, setActiveServerId] = useState(null);
  const [detail, setDetail] = useState(null); // { server, channels, roles, members, is_owner, my_permissions }
  const [activeChannelId, setActiveChannelId] = useState(null);

  const [onlineIds, setOnlineIds] = useState([]);
  const [voiceStates, setVoiceStates] = useState({});
  const [voiceInfo, setVoiceInfo] = useState(null); // { id, name } du salon vocal connecté
  const [showMembers, setShowMembers] = useState(true);

  const [dmConversations, setDmConversations] = useState([]);
  const [activeDm, setActiveDm] = useState(null); // objet utilisateur
  const [hasUnreadDm, setHasUnreadDm] = useState(false);

  const [modal, setModal] = useState(null); // 'create' | 'settings' | 'roles'
  const [memberTarget, setMemberTarget] = useState(null);

  const can = makeCan(detail?.is_owner, detail?.my_permissions);

  // Refs pour connaître l'état courant depuis les gestionnaires socket (sans les recréer).
  const viewRef = useRef(view);
  const activeChannelRef = useRef(activeChannelId);
  const activeDmRef = useRef(activeDm);
  useEffect(() => { viewRef.current = view; }, [view]);
  useEffect(() => { activeChannelRef.current = activeChannelId; }, [activeChannelId]);
  useEffect(() => { activeDmRef.current = activeDm; }, [activeDm]);

  // ---- Données ----
  const refreshServers = useCallback(async () => {
    const { servers } = await api('/servers');
    setServers(servers);
    return servers;
  }, []);

  const refreshDetail = useCallback(async (serverId, keepChannel = false) => {
    if (!serverId) { setDetail(null); return null; }
    const data = await api(`/servers/${serverId}`);
    setDetail(data);
    setActiveChannelId((prev) => {
      if (keepChannel && data.channels.some((c) => c.id === prev)) return prev;
      const firstText = data.channels.find((c) => c.type === 'text');
      return firstText ? firstText.id : data.channels[0]?.id ?? null;
    });
    setMemberTarget((mt) => (mt ? data.members.find((m) => m.id === mt.id) || null : mt));
    return data;
  }, []);

  const refreshConversations = useCallback(async () => {
    const { conversations } = await api('/dms');
    setDmConversations(conversations);
    return conversations;
  }, []);

  useEffect(() => {
    initNotifications();
    refreshServers().then((list) => {
      if (list.length) setActiveServerId(list[0].id);
    });
    refreshConversations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { refreshDetail(activeServerId); }, [activeServerId, refreshDetail]);

  // ---- Temps réel ----
  useEffect(() => {
    const socket = getSocket();
    const onPresence = ({ online }) => setOnlineIds(online);
    const onVoice = ({ channelId, members }) => setVoiceStates((p) => ({ ...p, [channelId]: members }));
    const onServerUpdated = ({ serverId }) => {
      setActiveServerId((cur) => { if (cur === serverId) refreshDetail(serverId, true); return cur; });
    };
    const onDmNew = ({ message }) => {
      refreshConversations();
      if (message.recipient_id !== user.id) return; // seulement les messages entrants
      const viewingThisDm = viewRef.current === 'dm' && activeDmRef.current?.id === message.sender_id && !document.hidden;
      if (viewingThisDm) return;
      setHasUnreadDm(true);
      playPing();
      desktopNotify(`${message.display_name} — message privé`, message.content || '📷 Image', () => {
        openDm({
          id: message.sender_id, username: message.username, display_name: message.display_name,
          avatar_color: message.avatar_color, avatar_url: message.avatar_url, status: 'online',
        });
      });
    };
    const onMessageNew = ({ channelId, message }) => {
      if (message.user_id === user.id || !mentionsUser(message.content, user)) return;
      const activeFocused = viewRef.current === 'server' && activeChannelRef.current === channelId && !document.hidden;
      if (activeFocused) return;
      playPing();
      desktopNotify(`${message.display_name} t’a mentionné`, message.content);
    };
    const onKicked = ({ serverId }) => {
      refreshServers().then((list) => {
        setActiveServerId((cur) => (cur === serverId ? (list[0]?.id ?? null) : cur));
      });
    };

    socket.on('presence', onPresence);
    socket.on('voice:state', onVoice);
    socket.on('server:updated', onServerUpdated);
    socket.on('dm:new', onDmNew);
    socket.on('message:new', onMessageNew);
    socket.on('server:kicked', onKicked);
    return () => {
      socket.off('presence', onPresence);
      socket.off('voice:state', onVoice);
      socket.off('server:updated', onServerUpdated);
      socket.off('dm:new', onDmNew);
      socket.off('message:new', onMessageNew);
      socket.off('server:kicked', onKicked);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.id, refreshDetail, refreshServers, refreshConversations]);

  // ---- Actions serveurs ----
  async function handleServerReady(server) {
    getSocket().emit('server:subscribe', { serverId: server.id });
    await refreshServers();
    setActiveServerId(server.id);
    setView('server');
    setModal(null);
  }
  async function createChannel(name, type) {
    await api(`/servers/${activeServerId}/channels`, { method: 'POST', body: { name, type } });
    await refreshDetail(activeServerId, true);
  }
  async function deleteChannel(channelId) {
    await api(`/channels/${channelId}`, { method: 'DELETE' });
    await refreshDetail(activeServerId, activeChannelId !== channelId);
  }
  async function deleteServer() {
    if (!confirm(`Supprimer définitivement « ${detail.server.name} » ?`)) return;
    await api(`/servers/${detail.server.id}`, { method: 'DELETE' });
    const list = await refreshServers();
    setActiveServerId(list[0]?.id ?? null);
  }
  async function leaveServer() {
    if (!confirm(`Quitter « ${detail.server.name} » ?`)) return;
    await api(`/servers/${detail.server.id}/leave`, { method: 'POST' });
    const list = await refreshServers();
    setActiveServerId(list[0]?.id ?? null);
  }

  // ---- Actions DM ----
  async function startDm(username) {
    const { user: target } = await api('/dms/start', { method: 'POST', body: { username } });
    setActiveDm(target);
    setView('dm');
  }
  function openDm(target) {
    setActiveDm(target);
    setView('dm');
    setHasUnreadDm(false);
  }
  function goHome() {
    setView('dm');
    setHasUnreadDm(false);
    refreshConversations();
  }

  // ---- Vocal ----
  function joinVoice(channel) {
    setVoiceInfo({ id: channel.id, name: channel.name });
    voice.join(channel.id);
  }
  function leaveVoice() {
    voice.leave();
    setVoiceInfo(null);
  }

  const activeChannel = detail?.channels.find((c) => c.id === activeChannelId) || null;

  return (
    <div className="app-shell">
      <ServerRail
        servers={servers}
        activeServerId={activeServerId}
        view={view}
        hasUnreadDm={hasUnreadDm}
        onSelect={(id) => { setActiveServerId(id); setView('server'); }}
        onHome={goHome}
        onAdd={() => setModal('create')}
      />

      <div className="side-column">
        {view === 'dm' ? (
          <DmSidebar
            conversations={dmConversations}
            activeUserId={activeDm?.id}
            onlineIds={onlineIds}
            onSelect={openDm}
            onStartDm={startDm}
          />
        ) : (
          <ChannelSidebar
            detail={detail}
            isOwner={detail?.is_owner}
            can={can}
            activeChannelId={activeChannelId}
            voiceStates={voiceStates}
            connectedChannelId={voice.connectedChannelId}
            onSelectChannel={setActiveChannelId}
            onCreateChannel={createChannel}
            onDeleteChannel={deleteChannel}
            onDeleteServer={deleteServer}
            onLeaveServer={leaveServer}
            onManageRoles={() => setModal('roles')}
          />
        )}

        {voice.connectedChannelId && (
          <div className="voice-bar">
            <div className="vb-info">
              <span className="vb-dot" /> Vocal · {voiceInfo?.name || 'connecté'}
            </div>
            <div className="vb-actions">
              <button title={voice.muted ? 'Réactiver le micro' : 'Couper le micro'} onClick={voice.toggleMute}>
                {voice.muted ? '🔇' : '🎙️'}
              </button>
              <button title="Se déconnecter du vocal" onClick={leaveVoice}>⏏</button>
            </div>
          </div>
        )}

        <UserPanel user={user} onOpenSettings={() => setModal('settings')} />
      </div>

      {/* Zone principale */}
      {view === 'dm' ? (
        activeDm ? (
          <DmChat peer={activeDm} currentUser={user} onlineIds={onlineIds} onCall={call.startCall} />
        ) : (
          <div className="main-content">
            <div className="msg-welcome" style={{ margin: 'auto', textAlign: 'center' }}>
              <h2>Messages privés 💬</h2>
              <p>Choisis une conversation à gauche, ou saisis un nom d’utilisateur pour en démarrer une.</p>
            </div>
          </div>
        )
      ) : activeChannel ? (
        <div className="main-content">
          <div className="content-header">
            <span className="hash">{activeChannel.type === 'voice' ? '🔊' : '#'}</span>
            <span>{activeChannel.name}</span>
            {activeChannel.type === 'text' && <span className="topic">Salon textuel</span>}
            <span className="spacer" />
            <button className={`header-btn ${showMembers ? 'active' : ''}`} title="Afficher/masquer les membres" onClick={() => setShowMembers((v) => !v)}>👥</button>
          </div>

          <div className="content-body">
            {activeChannel.type === 'voice' ? (
              <VoiceView
                channel={activeChannel}
                members={voiceStates[activeChannel.id] || []}
                currentUser={user}
                connected={voice.connectedChannelId === activeChannel.id}
                muted={voice.muted}
                onJoin={() => joinVoice(activeChannel)}
                onLeave={leaveVoice}
                onToggleMute={voice.toggleMute}
              />
            ) : (
              <ChatView channel={activeChannel} currentUser={user} canManage={can('MANAGE_CHANNELS')} />
            )}

            {showMembers && detail && (
              <MemberList
                members={detail.members}
                onlineIds={onlineIds}
                ownerId={detail.server.owner_id}
                roles={detail.roles}
                onMemberClick={setMemberTarget}
              />
            )}
          </div>
        </div>
      ) : (
        <div className="main-content">
          <div className="msg-welcome" style={{ margin: 'auto', textAlign: 'center' }}>
            <h2>Bienvenue sur Concord 👋</h2>
            <p>Crée ton premier serveur ou rejoins-en un pour commencer.</p>
            <div style={{ marginTop: 20 }}>
              <button className="btn" style={{ width: 'auto', padding: '10px 24px', display: 'inline-block' }} onClick={() => setModal('create')}>
                Créer / rejoindre un serveur
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Audio distant (rendu en permanence pour que le son persiste hors de la vue vocale) */}
      <div style={{ display: 'none' }}>
        {Object.entries(voice.remoteStreams).map(([sid, stream]) => (
          <audio key={sid} autoPlay ref={(el) => { if (el && el.srcObject !== stream) { el.srcObject = stream; el.play?.().catch(() => {}); } }} />
        ))}
      </div>

      {/* Appels vocaux privés (entrant / en cours) */}
      <CallOverlay call={call} />

      {/* Modales */}
      {modal === 'create' && <CreateServerModal onClose={() => setModal(null)} onReady={handleServerReady} />}
      {modal === 'settings' && <SettingsModal onClose={() => setModal(null)} />}
      {modal === 'roles' && detail && (
        <RolesModal serverId={detail.server.id} roles={detail.roles} onClose={() => setModal(null)} onChanged={() => refreshDetail(activeServerId, true)} />
      )}
      {memberTarget && detail && (
        <MemberModal
          member={memberTarget}
          roles={detail.roles}
          server={detail.server}
          canManageRoles={can('MANAGE_ROLES')}
          canKick={can('KICK_MEMBERS')}
          currentUserId={user.id}
          onClose={() => setMemberTarget(null)}
          onChanged={() => refreshDetail(activeServerId, true)}
          onMessage={openDm}
        />
      )}
    </div>
  );
}
