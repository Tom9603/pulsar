// Préférences d'apparence (thème, couleur, densité, taille), stockées sur l'appareil.
const KEY = 'pulsar-appearance';

export const DEFAULTS = { theme: 'dark', accent: 'violet', density: 'cozy', textSize: 'normal', reduceMotion: false, highContrast: false };

// Palettes d'accent proposées à l'utilisateur.
export const ACCENTS = {
  violet:   { label: 'Violet',   accent: '#8b5cf6', accent2: '#3b82f6', hover: '#9d70ff' },
  bleu:     { label: 'Bleu',     accent: '#3b82f6', accent2: '#06b6d4', hover: '#5a9bff' },
  cyan:     { label: 'Cyan',     accent: '#06b6d4', accent2: '#0ea5e9', hover: '#22d3ee' },
  emeraude: { label: 'Émeraude', accent: '#10b981', accent2: '#22c55e', hover: '#34d399' },
  ambre:    { label: 'Ambre',    accent: '#f59e0b', accent2: '#f97316', hover: '#fbbf24' },
  corail:   { label: 'Corail',   accent: '#fb7185', accent2: '#f43f5e', hover: '#fda4af' },
  rose:     { label: 'Rose',     accent: '#ec4899', accent2: '#f43f5e', hover: '#f472b6' },
  indigo:   { label: 'Indigo',   accent: '#6366f1', accent2: '#7c3aed', hover: '#818cf8' },
};

const ZOOM = { petit: 0.92, normal: 1, grand: 1.12 };

export function loadAppearance() {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; }
  catch { return { ...DEFAULTS }; }
}

export function saveAppearance(a) {
  try { localStorage.setItem(KEY, JSON.stringify(a)); } catch { /* stockage indisponible */ }
}

// Applique les préférences au document (couleurs, thème clair/sombre, densité, zoom).
export function applyAppearance(a = loadAppearance()) {
  const root = document.documentElement;
  const resolved = a.theme === 'system'
    ? (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark')
    : a.theme;
  root.setAttribute('data-theme', resolved);
  root.setAttribute('data-density', a.density || 'cozy');
  root.setAttribute('data-motion', a.reduceMotion ? 'reduce' : 'normal');
  root.setAttribute('data-contrast', a.highContrast ? 'high' : 'normal');
  root.style.zoom = ZOOM[a.textSize] || 1;

  const ac = ACCENTS[a.accent] || ACCENTS.violet;
  root.style.setProperty('--accent', ac.accent);
  root.style.setProperty('--accent-2', ac.accent2);
  root.style.setProperty('--accent-hover', ac.hover);
  root.style.setProperty('--grad', `linear-gradient(135deg, ${ac.accent} 0%, ${ac.accent2} 100%)`);
}
