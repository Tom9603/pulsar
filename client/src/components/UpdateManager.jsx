import { useUpdate, beginUpdate, dismissUpdate } from '../update.js';
import Icon from './Icon.jsx';

// Petit logo « signal qui pulse » réutilisé dans la fenêtre de téléchargement.
function PulseMark({ size = 66 }) {
  return (
    <svg width={size} height={(size * 110) / 120} viewBox="0 0 120 110" aria-hidden="true" className="ut-mark">
      <defs>
        <linearGradient id="ut-grad" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0%" stopColor="#8B5CF6" />
          <stop offset="100%" stopColor="#3B82F6" />
        </linearGradient>
      </defs>
      <g fill="none" stroke="url(#ut-grad)" strokeWidth="9" strokeLinecap="round">
        <path d="M25.3 56.9 A44 44 0 0 1 94.7 56.9" />
        <path d="M36.4 65.5 A30 30 0 0 1 83.6 65.5" />
        <path d="M47.4 74.1 A16 16 0 0 1 72.6 74.1" />
      </g>
      <circle cx="60" cy="86" r="6.5" fill="url(#ut-grad)" />
    </svg>
  );
}

/** Gère l'invitation à mettre à jour et la fenêtre de téléchargement (desktop). */
export default function UpdateManager() {
  const u = useUpdate();

  // Fenêtre de téléchargement : prend tout l'écran, progression, puis redémarrage auto.
  if (u.phase === 'downloading' || u.phase === 'downloaded') {
    const done = u.phase === 'downloaded';
    const pct = done ? 100 : u.progress;
    return (
      <div className="update-takeover">
        <div className="ut-card">
          <PulseMark />
          <h2>{done ? 'Mise à jour prête' : 'Mise à jour en cours'}</h2>
          <p className="ut-sub">
            {done
              ? 'Redémarrage de Pulsar en cours, veuillez patienter.'
              : 'Téléchargement de la nouvelle version. Pulsar redémarrera tout seul une fois terminé.'}
          </p>
          <div className="ut-bar"><i style={{ width: `${pct}%` }} /></div>
          <div className="ut-meta">
            <span>{pct}%</span>
            {u.version && <span>Version {u.version}</span>}
          </div>
        </div>
      </div>
    );
  }

  if (!u.available || !u.open) return null;

  return (
    <div className="modal-backdrop" onClick={dismissUpdate}>
      <div className="modal update-modal" onClick={(e) => e.stopPropagation()}>
        <div className="um-badge"><Icon name="arrows-rotate" /></div>
        <h2>Nouvelle version disponible</h2>
        {u.version
          ? <p className="um-ver">Pulsar {u.version} est prête à être installée.</p>
          : <p className="um-ver">Une nouvelle version de Pulsar est prête.</p>}
        <p className="um-desc">
          {u.isDesktop
            ? 'La mise à jour se télécharge, puis Pulsar redémarre automatiquement. Vos données restent en place.'
            : 'Rechargez pour profiter de la dernière version. Vos données restent en place.'}
        </p>
        <div className="um-actions">
          <button className="btn-ghost" onClick={dismissUpdate}>Plus tard</button>
          <button className="btn um-go" onClick={beginUpdate}>
            <Icon name="arrows-rotate" /> Mettre à jour maintenant
          </button>
        </div>
      </div>
    </div>
  );
}
