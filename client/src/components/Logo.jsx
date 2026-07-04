/** Logo Pulsar : signal qui pulse (arcs) en dégradé violet→bleu + mot-symbole. */
export default function Logo({ size = 62, wordmark = true }) {
  return (
    <div className="brand-logo">
      <svg width={size} height={(size * 110) / 120} viewBox="0 0 120 110" aria-hidden="true">
        <defs>
          <linearGradient id="sig" x1="0" y1="1" x2="1" y2="0">
            <stop offset="0%" stopColor="#8B5CF6" />
            <stop offset="100%" stopColor="#3B82F6" />
          </linearGradient>
        </defs>
        <g fill="none" stroke="url(#sig)" strokeWidth="9" strokeLinecap="round">
          <path d="M25.3 56.9 A44 44 0 0 1 94.7 56.9" />
          <path d="M36.4 65.5 A30 30 0 0 1 83.6 65.5" />
          <path d="M47.4 74.1 A16 16 0 0 1 72.6 74.1" />
        </g>
        <circle cx="60" cy="86" r="6.5" fill="url(#sig)" />
      </svg>
      {wordmark && <span className="brand-word">PULSAR</span>}
    </div>
  );
}
