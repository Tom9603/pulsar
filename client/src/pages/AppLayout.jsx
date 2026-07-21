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
import SavedListModal from '../components/SavedListModal.jsx';
import LeaveServerModal from '../components/LeaveServerModal.jsx';
import TaskModal from '../components/TaskModal.jsx';
import AiSummaryModal from '../components/AiSummaryModal.jsx';
import AiConfirmModal from '../components/AiConfirmModal.jsx';
import { aiStatus } from '../ai.js';
import CreateServerModal from '../components/CreateServerModal.jsx';
import SettingsModal from '../components/SettingsModal.jsx';
import QuickSearch from '../components/QuickSearch.jsx';
import ForwardModal from '../components/ForwardModal.jsx';
import Onboarding, { onboardingHidden } from '../components/Onboarding.jsx';
import OnboardingSetup from '../components/OnboardingSetup.jsx';
import { pruneDrafts } from '../drafts.js';
import RolesModal from '../components/RolesModal.jsx';
import MemberModal from '../components/MemberModal.jsx';
import ServerSettingsModal from '../components/ServerSettingsModal.jsx';
import ChannelAccessModal from '../components/ChannelAccessModal.jsx';
import ServerTasksModal from '../components/ServerTasksModal.jsx';
import ProfileModal from '../components/ProfileModal.jsx';
import EditProfileModal from '../components/EditProfileModal.jsx';
import AdminPanel from '../components/AdminPanel.jsx';
import FeedbackModal from '../components/FeedbackModal.jsx';
import HelpModal from '../components/HelpModal.jsx';
import SearchModal from '../components/SearchModal.jsx';
import CallOverlay from '../components/CallOverlay.jsx';
import Whiteboard from '../components/Whiteboard.jsx';
import RemoteAudio from '../components/RemoteAudio.jsx';
import ContextMenu from '../components/ContextMenu.jsx';
import ConfirmModal from '../components/ConfirmModal.jsx';
import { ctx } from '../contextmenu.js';

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
  const [threadOpen, setThreadOpen] = useState(false); // un fil occupe la droite

  const [dmConversations, setDmConversations] = useState([]);
  const [activeDm, setActiveDm] = useState(null);
  const [hasUnreadDm, setHasUnreadDm] = useState(false);

  const [modal, setModal] = useState(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false); // recherche rapide (Ctrl/Cmd + K)
  const [setupOpen, setSetupOpen] = useState(() => !user.setup_completed); // personnalisation à la 1re connexion
  const [tourOpen, setTourOpen] = useState(() => user.setup_completed && !onboardingHidden()); // présentation, après la perso
  const [whiteboardOpen, setWhiteboardOpen] = useState(false);
  const [serverTasksOpen, setServerTasksOpen] = useState(false);
  const [memberTarget, setMemberTarget] = useState(null);
  const [accessChannel, setAccessChannel] = useState(null);
  const [profileTarget, setProfileTarget] = useState(null); // id d'utilisateur
  const [adminOpen, setAdminOpen] = useState(false); // espace d'administration (admins uniquement)
  const [confirmState, setConfirmState] = useState(null); // confirmation clic droit { title, message, ... }
  const [forwardMsg, setForwardMsg] = useState(null); // message à transférer

  // Transférer un message vers un salon ou un contact.
  const forwardTo = (target) => {
    if (!forwardMsg) return;
    const payload = { content: forwardMsg.content || '', attachmentUrl: forwardMsg.attachment_url || undefined, attachmentName: forwardMsg.attachment_name || undefined };
    if (target.kind === 'channel') getSocket().emit('message:send', { channelId: target.id, ...payload });
    else getSocket().emit('dm:send', { toUserId: target.id, ...payload });
  };

  // Navigation « retour » / « avancer »
  const [history, setHistory] = useState([]);
  const [future, setFuture] = useState([]);
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
  const [ai, setAi] = useState({ enabled: false });
  const [aiSummary, setAiSummary] = useState(null); // { channelId, channelName }
  const [aiAsk, setAiAsk] = useState(null); // confirmation avant de lancer le Rattrapage
  useEffect(() => { aiStatus().then(setAi).catch(() => {}); }, []);

  // Recherche rapide : Ctrl+K (Cmd+K sur Mac), depuis n'importe où dans l'app.
  useEffect(() => {
    pruneDrafts();
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setQuickOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  const todoCount = tasks.filter((t) => t.status !== 'done' && t.assignee_id === user.id).length;

  // Serveurs affichés dans le rail vs archivés / cachés (préférence de vue perso).
  const visibleServers = servers.filter((s) => !s.archived && !s.hidden);
  const archivedServers = servers.filter((s) => s.archived);
  const hiddenServers = servers.filter((s) => s.hidden);

  // Enregistrements personnels (marque-pages sans rappel + rappels datés), visibles de moi seul.
  const [savedItems, setSavedItems] = useState([]);
  const [savedModal, setSavedModal] = useState(null); // 'saved' | 'reminders' | null
  const [leaveTarget, setLeaveTarget] = useState(null); // serveur à quitter / supprimer
  const taskMsgIds = new Set(tasks.map((t) => t.source_message_id).filter(Boolean));
  const refreshSaved = useCallback(() => {
    api('/saved').then(({ items }) => setSavedItems(items)).catch(() => {});
  }, []);
  const savedByMsg = new Map(savedItems.filter((i) => i.source_message_id).map((i) => [i.source_message_id, i]));
  const savedMsgIds = new Set(savedItems.filter((i) => !i.remind_at && i.source_message_id).map((i) => i.source_message_id));
  const reminderMsgIds = new Set(savedItems.filter((i) => i.remind_at && i.source_message_id).map((i) => i.source_message_id));

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
    refreshSaved();
    const onSavedChanged = () => refreshSaved();
    window.addEventListener('pulsar:saved-changed', onSavedChanged);
    return () => window.removeEventListener('pulsar:saved-changed', onSavedChanged);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    refreshDetail(activeServerId).then((data) => {
      const pending = pendingChannelRef.current;
      if (pending && data?.channels.some((c) => c.id === pending)) setActiveChannelId(pending);
      pendingChannelRef.current = null;
    });
  }, [activeServerId, refreshDetail]);

  // Historique de navigation (boutons « Retour » et « Avancer »).
  const applyLocation = (loc) => {
    backNav.current = true;
    setSection(loc.section);
    if (loc.activeServerId !== activeServerId) { pendingChannelRef.current = loc.activeChannelId; setActiveServerId(loc.activeServerId); }
    else if (loc.activeChannelId) setActiveChannelId(loc.activeChannelId);
    setActiveDm(loc.activeDm);
  };

  useEffect(() => {
    const cur = { section, activeServerId, activeChannelId, activeDm };
    const prev = locRef.current;
    const changed = prev && (prev.section !== cur.section || prev.activeServerId !== cur.activeServerId
      || prev.activeChannelId !== cur.activeChannelId || (prev.activeDm?.id ?? null) !== (cur.activeDm?.id ?? null));
    if (changed && !backNav.current) { setHistory((h) => [...h.slice(-40), prev]); setFuture([]); }
    backNav.current = false;
    locRef.current = cur;
  }, [section, activeServerId, activeChannelId, activeDm]);

  function goBack() {
    setHistory((h) => {
      if (h.length === 0) return h;
      setFuture((f) => [locRef.current, ...f].slice(0, 40));
      applyLocation(h[h.length - 1]);
      return h.slice(0, -1);
    });
  }
  function goForward() {
    setFuture((f) => {
      if (f.length === 0) return f;
      setHistory((h) => [...h, locRef.current]);
      applyLocation(f[0]);
      return f.slice(1);
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

  // Synchronise le badge du serveur actif (icône de gauche) avec l'état de ses salons.
  useEffect(() => {
    if (!detail?.server) return;
    const sid = detail.server.id;
    const mentions = detail.channels.reduce((n, c) => n + (c.mentions || 0), 0);
    const unread = detail.channels.some((c) => c.type === 'text' && c.unread);
    setServers((list) => list.map((s) => (s.id === sid && (s.mentions !== mentions || s.unread !== unread) ? { ...s, mentions, unread } : s)));
  }, [detail]);

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

  // ---- Menus clic droit adaptés au contexte ----
  const askConfirm = (opts) => setConfirmState(opts);
  const copyText = (t) => { navigator.clipboard?.writeText(t).catch(() => {}); };

  async function setServerFlag(sv, patch) {
    try { await api(`/servers/${sv.id}/membership`, { method: 'PATCH', body: patch }); await refreshServers(); } catch { /* ignore */ }
  }
  const afterLeave = async () => { const list = await refreshServers(); if (!list.some((s) => s.id === activeServerId)) { setActiveServerId(list[0]?.id ?? null); setSection('home'); } };

  // Menu d'un serveur (icône du rail ou carte d'accueil).
  const serverMenu = (sv) => ctx(() => {
    const owner = sv.owner_id === user.id;
    const others = (sv.member_count ?? 1) > 1;
    return [
      { label: 'Ouvrir le serveur', icon: 'right-to-bracket', onClick: () => openServer(sv.id) },
      sv.invite_code && { label: 'Copier le code d’invitation', icon: 'link', onClick: () => copyText(sv.invite_code) },
      owner && { label: 'Paramètres du serveur', icon: 'gear', onClick: () => { openServer(sv.id); setModal('serverSettings'); } },
      { sep: true },
      { label: sv.archived ? 'Désarchiver' : 'Archiver le serveur', icon: 'box-archive', onClick: () => setServerFlag(sv, { archived: !sv.archived }) },
      { label: sv.hidden ? 'Réafficher' : 'Cacher le serveur', icon: sv.hidden ? 'eye' : 'eye-slash', onClick: () => setServerFlag(sv, { hidden: !sv.hidden }) },
      { sep: true },
      owner
        ? { label: others ? 'Quitter (céder le serveur)' : 'Supprimer le serveur', icon: others ? 'right-from-bracket' : 'trash', danger: true, onClick: () => setLeaveTarget(sv) }
        : { label: 'Quitter le serveur', icon: 'right-from-bracket', danger: true, onClick: () => setLeaveTarget(sv) },
    ];
  });

  // Menu d'une conversation privée (liste des messages ou carte d'accueil).
  const deleteConversation = (peer) => askConfirm({
    title: `Supprimer la conversation avec ${peer.display_name} ?`,
    message: 'Elle disparaîtra de votre liste. Les messages ne sont pas supprimés pour votre interlocuteur, et la conversation réapparaîtra s’il vous réécrit.',
    confirmLabel: 'Supprimer', danger: true, requireText: 'supprimer',
    onConfirm: async () => {
      await api(`/dms/${peer.id}`, { method: 'DELETE' });
      if (activeDm?.id === peer.id) { setActiveDm(null); setSection('home'); }
      refreshConversations();
    },
  });
  // Appel depuis une carte de contact : on confirme d'abord (clic facile par mégarde).
  const callContact = (peer) => askConfirm({
    title: `Appeler ${peer.display_name} ?`,
    message: 'Un appel vocal va être lancé.',
    confirmLabel: 'Appeler',
    onConfirm: () => call.startCall(peer),
  });
  const dmMenu = (peer) => ctx([
    { label: 'Ouvrir la conversation', icon: 'comment', onClick: () => openDm(peer) },
    { label: 'Appel vocal', icon: 'phone', onClick: () => call.startCall(peer) },
    { label: 'Voir le profil', icon: 'user', onClick: () => setProfileTarget(peer.id) },
    { sep: true },
    { label: 'Supprimer la conversation', icon: 'trash', danger: true, onClick: () => deleteConversation(peer) },
  ]);

  // (Le menu clic droit global de navigation a été retiré : il surgissait
  // partout sans raison. La navigation se fait par le rail de gauche et la
  // barre du haut ; les menus contextuels utiles restent sur les serveurs,
  // salons, messages et contacts.)

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
      desktopNotify(`${message.display_name} · message privé`, message.content || 'Image', () => openDm(peer));
    };
    const onMessageNew = ({ channelId, serverId, message }) => {
      if (message.user_id === user.id) return;
      const focused = sectionRef.current === 'server' && activeChannelRef.current === channelId && !document.hidden;
      const mentioned = mentionsUser(message.content, user);
      if (!focused) {
        setDetail((d) => (d && d.channels.some((c) => c.id === channelId)
          ? { ...d, channels: d.channels.map((c) => (c.id === channelId ? { ...c, unread: true, mentions: (c.mentions || 0) + (mentioned ? 1 : 0) } : c)) }
          : d));
        setServers((list) => list.map((s) => (s.id === serverId ? { ...s, unread: true, mentions: (s.mentions || 0) + (mentioned ? 1 : 0) } : s)));
      }
      if (mentioned && !focused) {
        playPing();
        desktopNotify(`${message.display_name} vous a mentionné`, message.content);
        pushNotif({ icon: 'at', tone: 'purple', title: `${message.display_name} vous a mentionné`, body: message.content, nav: { type: 'channel', serverId, channelId } });
      }
      if (message.poll && !focused && message.user_id !== user.id) {
        pushNotif({ icon: 'chart-simple', tone: 'blue', title: 'Nouveau sondage', body: message.poll.question, nav: { type: 'channel', serverId, channelId } });
      }
    };
    const onKicked = ({ serverId }) => {
      refreshServers();
      setActiveServerId((cur) => (cur === serverId ? null : cur));
      setSection((s) => (s === 'server' ? 'home' : s));
    };
    const onServerAdded = ({ serverId, name }) => {
      refreshServers();
      getSocket().emit('server:subscribe', { serverId });
      pushNotif({ icon: 'server', tone: 'purple', title: 'Ajouté à un serveur', body: name || '', nav: { type: 'channel', serverId } });
    };
    const onReminder = ({ item }) => {
      playPing();
      const title = 'Rappel : ' + (item.author_name || 'votre message');
      desktopNotify(title, item.content || 'pièce jointe', openSaved);
      pushNotif({ icon: 'bell', tone: 'amber', title, body: item.content || 'Pièce jointe', nav: { type: 'todo' } });
    };
    const onTaskDue = ({ task }) => {
      playPing();
      const title = 'Tâche à échéance : ' + task.title;
      const body = task.creator_id === user.id ? 'Que vous vous êtes fixée' : `Confiée par ${task.creator_name}`;
      desktopNotify(title, body, openSaved);
      pushNotif({ icon: 'circle-check', tone: 'amber', title, body, nav: { type: 'todo' } });
      refreshTasks();
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
    socket.on('server:added', onServerAdded);
    socket.on('reminder:due', onReminder);
    socket.on('task:due', onTaskDue);
    socket.on('sound:play', onSound);
    socket.on('task:changed', onTaskChanged);
    return () => {
      socket.off('presence', onPresence); socket.off('voice:state', onVoice);
      socket.off('server:updated', onServerUpdated); socket.off('dm:new', onDmNew);
      socket.off('message:new', onMessageNew); socket.off('server:kicked', onKicked);
      socket.off('server:added', onServerAdded);
      socket.off('reminder:due', onReminder); socket.off('task:due', onTaskDue); socket.off('sound:play', onSound);
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
  function deleteChannel(channelId) {
    const ch = detail?.channels?.find((c) => c.id === channelId);
    askConfirm({
      title: `Supprimer le salon ${ch ? `« ${ch.name} »` : ''} ?`,
      message: 'Tous les messages de ce salon seront définitivement effacés pour tous les membres. Cette action est irréversible.',
      confirmLabel: 'Supprimer le salon', danger: true, requireText: 'supprimer',
      onConfirm: async () => { await api(`/channels/${channelId}`, { method: 'DELETE' }); await refreshDetail(activeServerId, activeChannelId !== channelId); },
    });
  }
  const openLeaveServer = () => detail?.server && setLeaveTarget(detail.server);
  async function startDm(username) { const { user: target } = await api('/dms/start', { method: 'POST', body: { username } }); openDm(target); }

  // ---- Tâches ----
  const openTaskFromMessage = (prefill) => setTaskModal({ prefill, members: detail?.members || [] });
  const openNewTask = () => setTaskModal({ prefill: {}, members: [] });
  const editTask = (task) => setTaskModal({ task });
  const toggleTask = async (task) => { await api(`/tasks/${task.id}`, { method: 'PATCH', body: { status: task.status === 'done' ? 'todo' : 'done' } }); refreshTasks(); };
  const setTaskStatus = async (task, status) => { await api(`/tasks/${task.id}`, { method: 'PATCH', body: { status } }); refreshTasks(); };
  const deleteTask = (task) => askConfirm({ title: 'Supprimer la tâche', message: `« ${task.title} » sera supprimée définitivement.`, confirmLabel: 'Supprimer', danger: true, onConfirm: async () => { await api(`/tasks/${task.id}`, { method: 'DELETE' }); refreshTasks(); } });

  function joinVoice(channel) { setVoiceInfo({ id: channel.id, name: channel.name }); voice.join(channel.id); }
  function leaveVoice() { voice.leave(); setVoiceInfo(null); }

  const activeChannel = detail?.channels.find((c) => c.id === activeChannelId) || null;

  return (
    <div className="pulsar-app">
      <TopBar
        user={user}
        onHome={goHome}
        onBack={goBack}
        onForward={goForward}
        canGoBack={history.length > 0}
        canGoForward={future.length > 0}
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
        onOpenSaved={() => setSavedModal('saved')}
        onOpenReminders={() => setSavedModal('reminders')}
        onOpenQuickSearch={() => setQuickOpen(true)}
      />

      <div className="pulsar-body">
        <NavRail
          section={section}
          servers={visibleServers}
          activeServerId={activeServerId}
          hasUnreadDm={hasUnreadDm}
          todoCount={todoCount}
          onSection={onSection}
          onSelectServer={openServer}
          onAddServer={() => setModal('create')}
          onFeedback={() => setModal('feedback')}
          onHelp={() => setModal('help')}
          serverMenu={serverMenu}
          currentUserId={user.id}
        />

        {section === 'server' && detail && (
          <ChannelSidebar
            detail={detail} isOwner={detail?.is_owner} can={can}
            activeChannelId={activeChannelId} voiceStates={voiceStates}
            connectedChannelId={voice.connectedChannelId}
            onSelectChannel={setActiveChannelId} onCreateChannel={createChannel} onDeleteChannel={deleteChannel}
            onManageAccess={setAccessChannel}
            onDeleteServer={openLeaveServer} onLeaveServer={openLeaveServer}
            onManageRoles={() => setModal('roles')} onServerSettings={() => setModal('serverSettings')}
          />
        )}
        {section === 'dm' && (
          <DmSidebar conversations={dmConversations} activeUserId={activeDm?.id} onlineIds={onlineIds} onSelect={openDm} onStartDm={startDm} convMenu={dmMenu} onCall={callContact} />
        )}

        <div className="pulsar-main">
          {section === 'home' && (
            <HomeView user={user} servers={visibleServers} dmConversations={dmConversations} onlineIds={onlineIds}
              onOpenServer={openServer} onOpenDm={openDm} onOpenFriends={openFriends} onOpenSaved={openSaved} onAddServer={() => setModal('create')}
              serverMenu={serverMenu} dmMenu={dmMenu}
              archivedServers={archivedServers} hiddenServers={hiddenServers}
              onRestoreServer={(sv) => setServerFlag(sv, { archived: 0, hidden: 0 })} />
          )}
          {section === 'friends' && <FriendsPanel onlineIds={onlineIds} onOpenDm={openDm} onOpenProfile={setProfileTarget} />}
          {section === 'saved' && (
            <ActionCenter
              currentUser={user} tasks={tasks} taskFilter={taskFilter} onTaskFilter={setTaskFilter}
              onToggleTask={toggleTask} onSetTaskStatus={setTaskStatus} onEditTask={editTask}
              onDeleteTask={deleteTask} onNewTask={openNewTask}
            />
          )}
          {section === 'dm' && (
            activeDm
              ? <DmChat peer={activeDm} currentUser={user} onlineIds={onlineIds} onCall={call.startCall} onOpenProfile={setProfileTarget} onCreateTask={openTaskFromMessage} onForward={setForwardMsg} reminderMsgIds={reminderMsgIds} taskMsgIds={taskMsgIds} savedMsgIds={savedMsgIds} savedByMsg={savedByMsg} aiEnabled={ai.enabled} />
              : <div className="main-content"><div className="empty-hero"><h2><Icon name="comment" /> Messages</h2><p>Choisissez une conversation à gauche, ou ajoutez un contact.</p></div></div>
          )}
          {section === 'server' && (
            activeChannel ? (
              <div className="main-content">
                <div className="content-header">
                  <span className="hash"><Icon name={activeChannel.type === 'voice' ? 'volume-high' : activeChannel.private ? 'lock' : 'align-left'} /></span>
                  <span>{activeChannel.name}</span>
                  {activeChannel.client_label && <span className="topic topic-client"><Icon name="folder-open" /> {activeChannel.client_label}</span>}
                  {activeChannel.type === 'text' && !activeChannel.client_label && <span className="topic">Salon textuel</span>}
                  <span className="spacer" />
                  {ai.enabled && activeChannel.type === 'text' && (
                    <button className="header-btn header-ai" title="Rattrapage : résumé IA des nouveaux messages" onClick={() => setAiAsk({ channelId: activeChannel.id, channelName: activeChannel.name })}><Icon name="wand-magic-sparkles" /></button>
                  )}
                  <button className="header-btn" title="Tâches du serveur" onClick={() => setServerTasksOpen(true)}><Icon name="list-check" /></button>
                  <button className="header-btn" title="Tableau blanc partagé" onClick={() => setWhiteboardOpen(true)}><Icon name="palette" /></button>
                  <button className="header-btn" title="Rechercher" onClick={() => setSearchOpen(true)}><Icon name="magnifying-glass" /></button>
                  <button className={`header-btn ${showMembers ? 'active' : ''}`} title="Membres" onClick={() => setShowMembers((v) => !v)}><Icon name="users" /></button>
                </div>
                <div className="content-body">
                  {activeChannel.type === 'voice' ? (
                    <VoiceView channel={activeChannel} members={voiceStates[activeChannel.id] || []} currentUser={user}
                      connected={voice.connectedChannelId === activeChannel.id} muted={voice.muted} canManage={can('MANAGE_CHANNELS')}
                      videoOn={voice.videoOn} localVideoStream={voice.localVideoStream} remoteStreams={voice.remoteStreams}
                      screenOn={voice.screenOn} localScreenStream={voice.localScreenStream} peerVolumes={voice.peerVolumes}
                      onJoin={() => joinVoice(activeChannel)} onLeave={leaveVoice} onToggleMute={voice.toggleMute} onToggleCamera={voice.toggleCamera}
                      onToggleScreen={voice.toggleScreen} onSetPeerVolume={voice.setPeerVolume}
                      onRaiseHand={voice.raiseHand} onLowerHand={voice.lowerHand} />
                  ) : (
                    <ChatView channel={activeChannel} currentUser={user} canManage={can('MANAGE_CHANNELS')} members={detail?.members} onCreateTask={openTaskFromMessage} onOpenProfile={setProfileTarget} onForward={setForwardMsg} reminderMsgIds={reminderMsgIds} taskMsgIds={taskMsgIds} savedMsgIds={savedMsgIds} savedByMsg={savedByMsg} aiEnabled={ai.enabled} onThreadToggle={setThreadOpen} />
                  )}
                </div>
              </div>
            ) : (
              <div className="main-content"><div className="empty-hero"><h2>Aucun salon</h2><p>Ce serveur n’a pas encore de salon.</p></div></div>
            )
          )}
        </div>

        {section === 'server' && showMembers && !threadOpen && detail && (
          <MemberList members={detail.members} onlineIds={onlineIds} ownerId={detail.server.owner_id} roles={detail.roles} onMemberClick={setMemberTarget} />
        )}
      </div>

      <div style={{ display: 'none' }}>
        {Object.entries(voice.remoteStreams).map(([sid, stream]) => (
          <RemoteAudio key={sid} stream={stream} volume={voice.peerVolumes[sid] ?? 1} />
        ))}
      </div>

      <CallOverlay call={call} />
      <ContextMenu />
      {whiteboardOpen && activeChannel && (
        <Whiteboard channelId={activeChannel.id} onClose={() => setWhiteboardOpen(false)}
          onPublish={(url) => getSocket().emit('message:send', { channelId: activeChannel.id, attachmentUrl: url, attachmentName: 'tableau-blanc.png', content: '' })} />
      )}
      {serverTasksOpen && detail && (
        <ServerTasksModal serverId={detail.server.id} serverName={detail.server.name}
          onOpenTask={(t) => { setServerTasksOpen(false); editTask(t); }} onClose={() => setServerTasksOpen(false)} />
      )}

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

      {setupOpen && <OnboardingSetup onDone={() => { setSetupOpen(false); setTourOpen(true); }} />}
      {!setupOpen && tourOpen && <Onboarding onClose={() => setTourOpen(false)} />}
      {quickOpen && (
        <QuickSearch
          onClose={() => setQuickOpen(false)}
          onGoServer={openServer}
          onGoChannel={openServerChannel}
          onGoDm={openDm}
        />
      )}
      {modal === 'create' && <CreateServerModal onClose={() => setModal(null)} onReady={handleServerReady} />}
      {modal === 'settings' && <SettingsModal onClose={() => setModal(null)} />}
      {modal === 'roles' && detail && <RolesModal serverId={detail.server.id} roles={detail.roles} onClose={() => setModal(null)} onChanged={() => refreshDetail(activeServerId, true)} />}
      {modal === 'serverSettings' && detail && <ServerSettingsModal server={detail.server} categories={detail.categories || []} channels={detail.channels} onClose={() => setModal(null)} onChanged={() => { refreshDetail(activeServerId, true); refreshServers(); }} />}
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
        <ProfileModal userId={profileTarget} servers={servers}
          onClose={() => setProfileTarget(null)} onMessage={openDm}
          onEditProfile={() => setModal('editProfile')} onLogout={logout}
          onOpenProfile={(id) => setProfileTarget(id)} onOpenServer={openServer}
          canAdmin={!!user.platform_admin} onOpenAdmin={() => { setProfileTarget(null); setAdminOpen(true); }} />
      )}
      {adminOpen && user.platform_admin && <AdminPanel onClose={() => setAdminOpen(false)} />}
      {modal === 'editProfile' && <EditProfileModal onClose={() => setModal(null)} />}
      {modal === 'feedback' && <FeedbackModal onClose={() => setModal(null)} />}
      {modal === 'help' && <HelpModal onClose={() => setModal(null)} onContact={() => setModal('feedback')} />}
      {aiAsk && (
        <AiConfirmModal
          title={`Rattrapage · ${aiAsk.channelName}`}
          description="L’assistant va lire les messages que vous n’avez pas lus dans ce salon et vous en faire un résumé."
          onConfirm={() => { setAiSummary(aiAsk); setAiAsk(null); }}
          onClose={() => setAiAsk(null)}
        />
      )}
      {aiSummary && <AiSummaryModal channelId={aiSummary.channelId} channelName={aiSummary.channelName} onClose={() => setAiSummary(null)} />}
      {savedModal && <SavedListModal mode={savedModal} currentUser={user} onClose={() => setSavedModal(null)} />}
      {leaveTarget && <LeaveServerModal server={leaveTarget} currentUserId={user.id} onDone={afterLeave} onClose={() => setLeaveTarget(null)} />}
      {confirmState && (
        <ConfirmModal
          title={confirmState.title}
          message={confirmState.message}
          confirmLabel={confirmState.confirmLabel}
          danger={confirmState.danger}
          requireText={confirmState.requireText}
          onConfirm={confirmState.onConfirm}
          onClose={() => setConfirmState(null)}
        />
      )}

      {forwardMsg && (
        <ForwardModal message={forwardMsg} onSend={forwardTo} onClose={() => setForwardMsg(null)} />
      )}
    </div>
  );
}
