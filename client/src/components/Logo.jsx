import logoUrl from '../assets/pulsar-logo.png';
import wordUrl from '../assets/pulsar-wordmark.png';

// Logo Pulsar : le « P » de la charte + la marque « PULSAR » (votre fichier exact).
// wordmark ajoute la marque à côté ; row = disposition horizontale.
export default function Logo({ size = 62, wordmark = true, row = false }) {
  return (
    <div className={`brand-logo ${row ? 'brand-row' : ''}`}>
      <img className="brand-mark" src={logoUrl} alt="" width={size} height={size} />
      {wordmark && <img className="brand-word-img" src={wordUrl} alt="Pulsar" style={{ height: Math.round(size * 0.4) }} />}
    </div>
  );
}
