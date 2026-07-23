import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Icon from './Icon.jsx';
import { api, mediaUrl } from '../api.js';
import ContactLibraryModal from './ContactLibraryModal.jsx';
import WidgetCanvas, { firstFreeSpot, normalize } from './widgets/WidgetCanvas.jsx';
import WidgetGallery from './widgets/WidgetGallery.jsx';
import ShortcutPicker from './widgets/ShortcutPicker.jsx';
import { DEFAULT_LAYOUT } from './widgets/registry.jsx';

/** Identifiant court et unique pour un widget qu'on vient de poser. */
const newId = () => 'w-' + Math.random().toString(36).slice(2, 9);

/** Écran d'accueil : un tableau de widgets que chacun compose à sa main. */
export default function HomeView({
  user, servers, dmConversations, onlineIds, tasks = [],
  onOpenServer, onOpenDm, onOpenFriends, onOpenSaved, onAddServer, onQuickSearch, onOpenSection,
  serverMenu, archivedServers = [], hiddenServers = [], onRestoreServer,
}) {
  const putAway = [
    ...archivedServers.map((s) => ({ s, tag: 'Archivé' })),
    ...hiddenServers.map((s) => ({ s, tag: 'Caché' })),
  ];
  const [contacts, setContacts] = useState([]);
  const [library, setLibrary] = useState(false);
  const [layout, setLayout] = useState(null); // null = pas encore chargé
  const [editing, setEditing] = useState(false);
  const [gallery, setGallery] = useState(false);
  const [configuring, setConfiguring] = useState(null);
  const [cols, setCols] = useState(4);
  const wrapRef = useRef(null);
  const online = useMemo(() => new Set(onlineIds), [onlineIds]);

  const now = new Date();
  const hour = now.getHours();
  const greeting = hour < 6 ? 'Bonne nuit' : hour < 12 ? 'Bonjour' : hour < 18 ? 'Bon après-midi' : 'Bonsoir';

  useEffect(() => { api('/friends').then(({ friends }) => setContacts(friends || [])).catch(() => {}); }, []);

  // Nombre de colonnes selon la largeur : 4 au large, 2 à l'étroit.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => setCols(el.clientWidth < 720 ? 2 : 4);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Disposition enregistrée, sinon celle d'origine.
  useEffect(() => {
    let cancelled = false;
    api('/users/me/home')
      .then(({ layout: saved }) => { if (!cancelled) setLayout(Array.isArray(saved) && saved.length ? saved : DEFAULT_LAYOUT); })
      .catch(() => { if (!cancelled) setLayout(DEFAULT_LAYOUT); });
    return () => { cancelled = true; };
  }, []);

  // Enregistrement différé : on ne harcèle pas le serveur pendant les réglages.
  const saveTimer = useRef(null);
  const persist = useCallback((next) => {
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      api('/users/me/home', { method: 'PUT', body: { layout: next } }).catch(() => {});
    }, 600);
  }, []);

  const apply = useCallback((next) => {
    const clean = normalize(next, cols);
    setLayout(clean);
    persist(clean);
  }, [cols, persist]);

  // Affichage : la disposition est ramenée au nombre de colonnes courant
  // (fenêtre étroite = 2 colonnes) sans réécrire tout de suite l'original.
  const shownLayout = useMemo(() => (layout ? normalize(layout, cols) : null), [layout, cols]);

  const addWidget = (type, w, h) => {
    const base = layout || [];
    const spot = firstFreeSpot(base, Math.min(w, cols), h, cols);
    apply([...base, { id: newId(), type, x: spot.x, y: spot.y, w: Math.min(w, cols), h }]);
  };

  const openShortcut = (it) => {
    if (it.kind === 'server') onOpenServer(it.id);
    else if (it.kind === 'dm') {
      const conv = dmConversations.find((c) => c.id === it.id) || contacts.find((c) => c.id === it.id);
      if (conv) onOpenDm(conv);
    } else if (it.kind === 'section') {
      if (it.id === 'friends') onOpenFriends();
      else if (it.id === 'saved') onOpenSaved();
      else onOpenSection?.(it.id);
    }
  };

  const ctx = {
    user, servers, dmConversations, contacts, tasks, online, now, greeting,
    onOpenServer, onOpenDm, onOpenFriends, onOpenSaved, onAddServer,
    onQuickSearch: onQuickSearch || (() => {}),
    onShortcut: openShortcut,
  };

  return (
    <div className="home-view" ref={wrapRef}>
      <div className="home-inner">
        <div className="home-hero">
          <div className="home-hero-text">
            <h1>{greeting}, {user.display_name}</h1>
            <p className="home-today">
              Nous sommes le {now.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
            </p>
          </div>
          <div className="home-hero-tools">
            {editing && (
              <button className="home-edit-btn" onClick={() => setGallery(true)}>
                <Icon name="plus" /> Ajouter un widget
              </button>
            )}
            <button className={`home-edit-btn ${editing ? 'on' : ''}`} onClick={() => setEditing((v) => !v)}>
              <Icon name={editing ? 'check' : 'table-cells-large'} />
              {editing ? 'Terminer' : 'Personnaliser'}
            </button>
          </div>
        </div>

        {editing && (
          <p className="home-edit-hint">
            <Icon name="hand-pointer" /> Glissez un widget pour le déplacer : la grille s’allume sous votre souris et montre la place qu’il prendra.
          </p>
        )}

        {shownLayout && (
          <WidgetCanvas
            layout={shownLayout}
            editing={editing}
            cols={cols}
            ctx={ctx}
            onChange={apply}
            onConfigure={(item) => setConfiguring(item)}
          />
        )}

        {putAway.length > 0 && !editing && (
          <section className="home-section home-putaway">
            <h2>Serveurs rangés</h2>
            <div className="home-archived">
              {putAway.map(({ s, tag }) => (
                <div key={s.id} className="archived-row" onContextMenu={serverMenu?.(s)}>
                  <span className="ar-icon" style={{ background: s.icon_url ? undefined : s.icon_color }}>
                    {s.icon_url ? <img src={mediaUrl(s.icon_url)} alt="" /> : s.name.charAt(0).toUpperCase()}
                  </span>
                  <span className="ar-name">{s.name}</span>
                  <span className="ar-tag">{tag}</span>
                  <button className="ar-restore" title="Réafficher dans la liste" onClick={() => onRestoreServer?.(s)}>
                    <Icon name="rotate-left" /> Réafficher
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>

      {gallery && (
        <WidgetGallery
          layout={shownLayout || []}
          cols={cols}
          onAdd={addWidget}
          onRemove={(id) => apply((layout || []).filter((w) => w.id !== id))}
          onReset={() => apply(DEFAULT_LAYOUT.map((w) => ({ ...w })))}
          onClose={() => setGallery(false)}
        />
      )}

      {configuring && (
        <ShortcutPicker
          item={configuring}
          servers={servers}
          conversations={dmConversations.length ? dmConversations : contacts}
          onSave={(next) => { apply((layout || []).map((w) => (w.id === next.id ? next : w))); setConfiguring(null); }}
          onClose={() => setConfiguring(null)}
        />
      )}

      {library && (
        <ContactLibraryModal contacts={contacts} onlineIds={onlineIds} onOpenDm={(c) => { setLibrary(false); onOpenDm(c); }} onClose={() => setLibrary(false)} />
      )}
    </div>
  );
}
