/** Logo Pulsar : étoile à pulsations + mot-symbole. */
export default function Logo({ size = 52, wordmark = true }) {
  return (
    <div className="brand-logo">
      <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden="true">
        <defs>
          <linearGradient id="lg-pulse" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#67E8F9" />
            <stop offset="60%" stopColor="#22D3EE" />
            <stop offset="100%" stopColor="#7C5CFF" />
          </linearGradient>
          <radialGradient id="lg-core" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#FFFFFF" />
            <stop offset="60%" stopColor="#A9F4FB" />
            <stop offset="100%" stopColor="#22D3EE" />
          </radialGradient>
        </defs>
        <g transform="translate(50,50)">
          <circle r="18" fill="none" stroke="url(#lg-pulse)" strokeWidth="4" opacity="0.95" />
          <circle r="29" fill="none" stroke="url(#lg-pulse)" strokeWidth="2.6" opacity="0.5" />
          <circle r="39" fill="none" stroke="url(#lg-pulse)" strokeWidth="1.6" opacity="0.24" />
          <circle r="7" fill="url(#lg-core)" />
        </g>
      </svg>
      {wordmark && <span className="brand-word">Pulsar</span>}
    </div>
  );
}
