import { useEffect, useState, useCallback, useRef } from 'react';
import { api } from '../api.js';
import { getSocket } from '../socket.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useVoice } from '../hooks/useVoice.js';
import { useCall } from '../hooks/useCall.js';
import { makeCan } from '../permissions.js';
import { initNotifications, playPing, desktopNotify } from '../notify.js';
import { playSound } from '../sounds.js';
import { mentionsUser } from '../richtext.jsx';

import TopBar from '../components/TopBar.jsx';
import Icon from '../components/Icon.jsx';
import NavRail from '../components/NavRail.jsx';
import HomeView from '../components/HomeView.jsx';
import ChannelSidebar from '../components/ChannelSidebar.jsx';
import ChatView from '../components/ChatView.jsx';
import VoiceView from '../components/VoiceView.jsx';
import MemberList from '../components/MemberList.jsx';
import DmSidebar from '../components/DmSidebar.jsx';
import DmChat from '../components/DmChat.jsx';
import FriendsPanel from '../components/FriendsPanel.jsx';
import ActionCenter from '../components/ActionCenter.jsx';
import TaskModal from '../components/TaskModal.jsx';
import CreateServerModal from '../components/CreateServerModal.jsx';
import SettingsModal from '../components/SettingsModal.jsx';
import RolesModal from '../components/RolesModal.jsx';
import MemberModal from '../components/MemberModal.jsx';
import ServerSettingsModal from '../components/ServerSettingsModal.jsx';
import ChannelAccessModal from '../components/ChannelAccessModal.jsx';
import ProfileModal from '../components/ProfileModal.jsx';
import SearchModal from '../components/SearchModal.jsx';
import CallOverlay from '../components/CallOverlay.jsx';
import Whiteboard from '../components/Whiteboard.jsx';

export default function AppLayout() {
  const { user, logout } = useAuth();
  const voice = useVoice();
  const call = useCall();

  // section : 'home' | 'server' | 'dm' | 'friends' | 'saved'
  const [section, setSection] = useState('home');
  const [servers, setServers] = useState([]);
  const [activeServerId, setActiveServerId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [activeChannelId, setActiveChannelId] = useState(null);

  const [onlineIds, setOnlineIds] = useState([]);
  const [voiceStates, setVoiceStates] = useState({});
  const [voiceInfo, setVoiceInfo] = useState(null);
  const [showMembers, setShowMembers] = useState(true);

  const [dmConversations, setDmConversations] = useState([]);
  const [activeDm, setActiveDm] = useState(null);
  const [hasUnreadDm, setHasUnreadDm] = useState(false);

  const [modal, setModal] = useState(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [whiteboardOpen, setWhiteboardOpen] = useState(false);
  const [memberTarget, setMemberTarget] = useState(null);
  const [accessChannel, setAccessChannel] = useState(null);
  const [profileTarget, setProfileTarget] = useState(null); // id d'utilisateur

  // Navigation « retour »
  const [history, setHistory] = useState([]);
  const locRef = useRef(null);
  const backNav = useRef(false);
  const pendingChannelRef = useRef(null);

  // Notifications (cloche)
  const [notifications, setNotifications] = useState([]);
  const pushNotif = useCallback((n) => {
    setNotifications((list) => [{ id: `${Date.now()}-${Math.random()}`, at: Date.now(), read: false, ...n }, ...list].slice(0, 40));
  }, []);

  // Tâches (centre « À faire »)
  const [tasks, setTasks] = useState([]);
  const [taskFilter, setTaskFilter] = useState('mine');
  const [taskModal, setTaskModal] = useState(null); // { task } | { prefill, members }
  const todoCount = tasks.filter((t) => t.status !== 'done' && t.assignee_id === user.id).length;

  const can = makeCan(detail?.is_owner, detail?.my_permissions);

  const sectionRef = useRef(section);
  const activeChannelRef = useRef(activeChannelId);
  const activeDmRef = useRef(activeDm);
  useEffect(() => { sectionRef.current = section; }, [section]);
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
    setAccessChannel((ac) => (ac ? data.channels.find((c) => c.id === ac.id) || null : ac));
    return data;
  }, []);

  const refreshConversations = useCallback(async () => {
    const { conversations } = await api('/dms');
    setDmConversations(conversations);
    return conversations;
  }, []);

  const refreshTasks = useCallback(async () => {
    const { tasks } = await api('/tasks');
    setTasks(tasks);
    return tasks;
  }, []);

  useEffect(() => {
    initNotifications();
    refreshServers();
    refreshConversations();
    refreshTasks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    refreshDetail(activeServerId).then((data) => {
      const pending = pendingChannelRef.current;
      if (pending && data?.channels.some((c) => c.id === pending)) setActiveChannelId(pending);
      pendingChannelRef.current = null;
    });
  }, [activeServerId, refreshDetail]);

  // Historique de navigation (pour le bouton « Retour »).
  useEffect(() => {
    const cur = { section, activeServerId, activeChannelId, activeDm };
    const prev = locRef.current;
    const changed = prev && (prev.section !== cur.section || prev.activeServerId !== cur.activeServerId
      || prev.activeChannelId !== cur.activeChannelId || (prev.activeDm?.id ?? null) !== (cur.activeDm?.id ?? null));
    if (changed && !backNav.current) setHistory((h) => [...h.slice(-40), prev]);
    backNav.current = false;
    locRef.current = cur;
  }, [section, activeServerId, activeChannelId, activeDm]);

  function goBack() {
    setHistory((h) => {
      if (h.length === 0) return h;
      const prev = h[h.length - 1];
      backNav.current = true;
      setSection(prev.section);
      if (prev.activeServerId !== activeServerId) { pendingChannelRef.current = prev.activeChannelId; setActiveServerId(prev.activeServerId); }
      else if (prev.activeChannelId) setActiveChannelId(prev.activeChannelId);
      setActiveDm(prev.activeDm);
      return h.slice(0, -1);
    });
  }

  // Marque le salon actif comme lu.
  useEffect(() => {
    if (section !== 'server' || !activeChannelId) return;
    const ch = detail?.channels.find((c) => c.id === activeChannelId);
    if (!ch || ch.type !== 'text') return;
    getSocket().emit('channel:read', { channelId: activeChannelId });
    setDetail((d) => (d ? { ...d, channels: d.channels.map((c) => (c.id === activeChannelId ? { ...c, unread: false, mentions: 0 } : c)) } : d));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeChannelId, section, detail?.channels?.length]);

  // ---- Navigation ----
  const goHome = () => { setSection('home'); refreshConversations(); };
  const openServer = (id) => { getSocket().emit('server:subscribe', { serverId: id }); setActiveServerId(id); setSection('server'); };
  const openMessages = () => { setSection('dm'); setHasUnreadDm(false); refreshConversations(); };
  const openFriends = () => setSection('friends');
  const openSaved = () => setSection('saved');
  function openDm(target) { setActiveDm(target); setSection('dm'); setHasUnreadDm(false); }
  function onSection(id) { ({ home: goHome, dm: openMessages, friends: openFriends, saved: openSaved }[id] || goHome)(); }
  function openServerChannel(serverId, channelId) {
    getSocket().emit('server:subscribe', { serverId });
    if (serverId === activeServerId) { setSection('server'); if (channelId) setActiveChannelId(channelId); }
    else { pendingChannelRef.current = channelId || null; setActiveServerId(serverId); setSection('server'); }
  }
  function openNotif(n) {
    const nav = n.nav || {};
    if (nav.type === 'dm') openDm(nav.peer);
    else if (nav.type === 'channel') openServerChannel(nav.serverId, nav.channelId);
    else if (nav.type === 'todo') setSection('saved');
  }
  const markAllRead = () => setNotifications((l) => l.map((n) => ({ ...n, read: true })));
  const clearNotifs = () => setNotifications([]);

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
      if (message.recipient_id !== user.id) return;
      const viewing = sectionRef.current === 'dm' && activeDmRef.current?.id === message.sender_id && !document.hidden;
      if (viewing) return;
      setHasUnreadDm(true);
      playPing();
      const peer = { id: message.sender_id, username: message.username, display_name: message.display_name, avatar_color: message.avatar_color, avatar_url: message.avatar_url, status: 'online' };
      pushNotif({ icon: 'message', tone: 'blue', title: message.display_name, body: message.content || 'Pièce jointe', nav: { type: 'dm', peer } });
      desktopNotify(`${message.display_name} — message privé`, message.content || 'Image', () => openDm(peer));
    };
    const onMessageNew = ({ channelId, serverId, message }) => {
      if (message.user_id === user.id) return;
      const focused = sectionRef.current === 'server' && activeChannelRef.current === channelId && !document.hidden;
      const mentioned = mentionsUser(message.content, user);
      if (!focused) {
        setDetail((d) => (d && d.channels.some((c) => c.id === channelId)
          ? { ...d, channels: d.channels.map((c) => (c.id === channelId ? { ...c, unread: true, mentions: (c.mentions || 0) + (mentioned ? 1 : 0) } : c)) }
          : d));
      }
      if (mentioned && !focused) {
        playPing();
        desktopNotify(`${message.display_name} vous a mentionné`, message.content);
        pushNotif({ icon: 'at', tone: 'purple', title: `${message.display_name} vous a mentionné`, body: message.content, nav: { type: 'channel', serverId, channelId } });
      }
    };
    const onKicked = ({ serverId }) => {
      refreshServers();
      setActiveServerId((cur) => (cur === serverId ? null : cur));
      setSection((s) => (s === 'server' ? 'home' : s));
    };
    const onReminder = ({ item }) => {
      playPing();
      const title = 'Rappel : ' + (item.author_name || 'votre message');
      desktopNotify(title, item.content || 'pièce jointe', openSaved);
      pushNotif({ icon: 'bell', tone: 'amber', title, body: item.content || 'Pièce jointe', nav: { type: 'todo' } });
    };
    const onSound = ({ sound }) => playSound(sound);
    const onTaskChanged = ({ type, task }) => {
      refreshTasks();
      if (type === 'created' && task.assignee_id === user.id && task.creator_id !== user.id) {
        playPing();
        desktopNotify('Nouvelle tâche assignée', task.title, () => setSection('saved'));
        pushNotif({ icon: 'circle-check', tone: 'green', title: 'Nouvelle tâche assignée', body: task.title, nav: { type: 'todo' } });
      }
    };

    socket.on('presence', onPresence);
    socket.on('voice:state', onVoice);
    socket.on('server:updated', onServerUpdated);
    socket.on('dm:new', onDmNew);
    socket.on('message:new', onMessageNew);
    socket.on('server:kicked', onKicked);
    socket.on('reminder:due', onReminder);
    socket.on('sound:play', onSound);
    socket.on('task:changed', onTaskChanged);
    return () => {
      socket.off('presence', onPresence); socket.off('voice:state', onVoice);
      socket.off('server:updated', onServerUpdated); socket.off('dm:new', onDmNew);
      socket.off('message:new', onMessageNew); socket.off('server:kicked', onKicked);
      socket.off('reminder:due', onReminder); socket.off('sound:play', onSound);
      socket.off('task:changed', onTaskChanged);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.id, refreshDetail, refreshServers, refreshConversations, refreshTasks, pushNotif]);

  // ---- Actions ----
  async function handleServerReady(server) {
    await refreshServers();
    openServer(server.id);
    setModal(null);
  }
  async function createChannel(name, type, opts = {}) { await api(`/servers/${activeServerId}/channels`, { method: 'POST', body: { name, type, ...opts } }); await refreshDetail(activeServerId, true); }
  async function deleteChannel(channelId) { await api(`/channels/${channelId}`, { method: 'DELETE' }); await refreshDetail(activeServerId, activeChannelId !== channelId); }
  async function deleteServer() {
    if (!confirm(`Supprimer définitivement « ${detail.server.name} » ?`)) return;
    await api(`/servers/${detail.server.id}`, { method: 'DELETE' });
    const list = await refreshServers();
    setActiveServerId(list[0]?.id ?? null); setSection('home');
  }
  async function leaveServer() {
    if (!confirm(`Quitter « ${detail.server.name} » ?`)) return;
    await api(`/servers/${detail.server.id}/leave`, { method: 'POST' });
    const list = await refreshServers();
    setActiveServerId(list[0]?.id ?? null); setSection('home');
  }
  async function startDm(username) { const { user: target } = await api('/dms/start', { method: 'POST', body: { username } }); openDm(target); }

  // ---- Tâches ----
  const openTaskFromMessage = (prefill) => setTaskModal({ prefill, members: detail?.members || [] });
  const openNewTask = () => setTaskModal({ prefill: {}, members: [] });
  const editTask = (task) => setTaskModal({ task });
  const toggleTask = async (task) => { await api(`/tasks/${task.id}`, { method: 'PATCH', body: { status: task.status === 'done' ? 'todo' : 'done' } }); refreshTasks(); };
  const setTaskStatus = async (task, status) => { await api(`/tasks/${task.id}`, { method: 'PATCH', body: { status } }); refreshTasks(); };
  const deleteTask = async (task) => { if (confirm(`Supprimer la tâche « ${task.title} » ?`)) { await api(`/tasks/${task.id}`, { method: 'DELETE' }); refreshTasks(); } };

  function joinVoice(channel) { setVoiceInfo({ id: channel.id, name: channel.name }); voice.join(channel.id); }
  function leaveVoice() { voice.leave(); setVoiceInfo(null); }

  const activeChannel = detail?.channels.find((c) => c.id === activeChannelId) || null;

  return (
    <div className="pulsar-app">
      <TopBar
        user={user}
        onHome={goHome}
        onBack={goBack}
        canGoBack={history.length > 0}
        onOpenSettings={() => setModal('settings')}
        onOpenProfile={() => setProfileTarget(user.id)}
        onLogout={logout}
        voice={voice}
        voiceName={voiceInfo?.name}
        onLeaveVoice={leaveVoice}
        notifications={notifications}
        onOpenNotif={openNotif}
        onMarkAllRead={markAllRead}
        onClearNotifs={clearNotifs}
      />

      <div className="pulsar-body">
        <NavRail
          section={section}
          servers={servers}
          activeServerId={activeServerId}
          hasUnreadDm={hasUnreadDm}
          todoCount={todoCount}
          onSection={onSection}
          onSelectServer={openServer}
          onAddServer={() => setModal('create')}
        />

        {section === 'server' && detail && (
          <ChannelSidebar
            detail={detail} isOwner={detail?.is_owner} can={can}
            activeChannelId={activeChannelId} voiceStates={voiceStates}
            connectedChannelId={voice.connectedChannelId}
            onSelectChannel={setActiveChannelId} onCreateChannel={createChannel} onDeleteChannel={deleteChannel}
            onManageAccess={setAccessChannel}
            onDeleteServer={deleteServer} onLeaveServer={leaveServer}
            onManageRoles={() => setModal('roles')} onServerSettings={() => setModal('serverSettings')}
          />
        )}
        {section === 'dm' && (
          <DmSidebar conversations={dmConversations} activeUserId={activeDm?.id} onlineIds={onlineIds} onSelect={openDm} onStartDm={startDm} />
        )}

        <div className="pulsar-main">
          {section === 'home' && (
            <HomeView user={user} servers={servers} dmConversations={dmConversations} onlineIds={onlineIds}
              onOpenServer={openServer} onOpenDm={openDm} onOpenFriends={openFriends} onOpenSaved={openSaved} onAddServer={() => setModal('create')} />
          )}
          {section === 'friends' && <FriendsPanel onlineIds={onlineIds} onOpenDm={openDm} />}
          {section === 'saved' && (
            <ActionCenter
              currentUser={user} tasks={tasks} taskFilter={taskFilter} onTaskFilter={setTaskFilter}
              onToggleTask={toggleTask} onSetTaskStatus={setTaskStatus} onEditTask={editTask}
              onDeleteTask={deleteTask} onNewTask={openNewTask}
            />
          )}
          {section === 'dm' && (
            activeDm
              ? <DmChat peer={activeDm} currentUser={user} onlineIds={onlineIds} onCall={call.startCall} onOpenProfile={setProfileTarget} />
              : <div className="main-content"><div className="empty-hero"><h2><Icon name="comment" /> Messages</h2><p>Choisissez une conversation à gauche, ou ajoutez un contact.</p></div></div>
          )}
          {section === 'server' && (
            activeChannel ? (
              <div className="main-content">
                <div className="content-header">
                  <span className="hash"><Icon name={activeChannel.type === 'voice' ? 'volume-high' : activeChannel.private ? 'lock' : 'hashtag'} /></span>
                  <span>{activeChannel.name}</span>
                  {activeChannel.client_label && <span className="topic topic-client"><Icon name="folder-open" /> {activeChannel.client_label}</span>}
                  {activeChannel.type === 'text' && !activeChannel.client_label && <span className="topic">Salon textuel</span>}
                  <span className="spacer" />
                  <button className="header-btn" title="Tableau blanc partagé" onClick={() => setWhiteboardOpen(true)}><Icon name="palette" /></button>
                  <button className="header-btn" title="Rechercher" onClick={() => setSearchOpen(true)}><Icon name="magnifying-glass" /></button>
                  <button className={`header-btn ${showMembers ? 'active' : ''}`} title="Membres" onClick={() => setShowMembers((v) => !v)}><Icon name="users" /></button>
                </div>
                <div className="content-body">
                  {activeChannel.type === 'voice' ? (
                    <VoiceView channel={activeChannel} members={voiceStates[activeChannel.id] || []} currentUser={user}
                      connected={voice.connectedChannelId === activeChannel.id} muted={voice.muted}
                      onJoin={() => joinVoice(activeChannel)} onLeave={leaveVoice} onToggleMute={voice.toggleMute} />
                  ) : (
                    <ChatView channel={activeChannel} currentUser={user} canManage={can('MANAGE_CHANNELS')} onCreateTask={openTaskFromMessage} onOpenProfile={setProfileTarget} />
                  )}
                </div>
              </div>
            ) : (
              <div className="main-content"><div className="empty-hero"><h2>Aucun salon</h2><p>Ce serveur n’a pas encore de salon.</p></div></div>
            )
          )}
        </div>

        {section === 'server' && showMembers && detail && (
          <MemberList members={detail.members} onlineIds={onlineIds} ownerId={detail.server.owner_id} roles={detail.roles} onMemberClick={setMemberTarget} />
        )}
      </div>

      <div style={{ display: 'none' }}>
        {Object.entries(voice.remoteStreams).map(([sid, stream]) => (
          <audio key={sid} autoPlay ref={(el) => { if (el && el.srcObject !== stream) { el.srcObject = stream; el.play?.().catch(() => {}); } }} />
        ))}
      </div>

      <CallOverlay call={call} />
      {whiteboardOpen && activeChannel && <Whiteboard channelId={activeChannel.id} onClose={() => setWhiteboardOpen(false)} />}

      {taskModal && (
        <TaskModal
          task={taskModal.task}
          prefill={taskModal.prefill}
          members={taskModal.members}
          servers={servers}
          currentUser={user}
          onClose={() => setTaskModal(null)}
          onSaved={refreshTasks}
        />
      )}

      {modal === 'create' && <CreateServerModal onClose={() => setModal(null)} onReady={handleServerReady} />}
      {modal === 'settings' && <SettingsModal onClose={() => setModal(null)} />}
      {modal === 'roles' && detail && <RolesModal serverId={detail.server.id} roles={detail.roles} onClose={() => setModal(null)} onChanged={() => refreshDetail(activeServerId, true)} />}
      {modal === 'serverSettings' && detail && <ServerSettingsModal server={detail.server} categories={detail.categories || []} channels={detail.channels} onClose={() => setModal(null)} onChanged={() => refreshDetail(activeServerId, true)} />}
      {searchOpen && detail && <SearchModal serverId={detail.server.id} onClose={() => setSearchOpen(false)} onJump={(channelId) => { setActiveChannelId(channelId); setSection('server'); }} />}
      {memberTarget && detail && (
        <MemberModal member={memberTarget} roles={detail.roles} server={detail.server} canManageRoles={can('MANAGE_ROLES')} canKick={can('KICK_MEMBERS')} currentUserId={user.id}
          onClose={() => setMemberTarget(null)} onChanged={() => refreshDetail(activeServerId, true)} onMessage={openDm} />
      )}
      {accessChannel && detail && (
        <ChannelAccessModal channel={accessChannel} members={detail.members} serverId={detail.server.id} ownerId={detail.server.owner_id}
          onClose={() => setAccessChannel(null)} onChanged={() => refreshDetail(activeServerId, true)} />
      )}
      {profileTarget && (
        <ProfileModal userId={profileTarget} currentUserId={user.id}
          onClose={() => setProfileTarget(null)} onMessage={openDm} onEditProfile={() => setModal('settings')} />
      )}
    </div>
  );
}
