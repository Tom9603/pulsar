/**
 * Icône Font Awesome (remplace les emojis dans toute l'interface).
 * <Icon name="arrow-left" /> → <i class="fa-solid fa-arrow-left" />
 * `brand` pour les logos, `regular` pour la variante fine.
 */
export default function Icon({ name, brand, regular, className = '', style, title, onClick }) {
  const family = brand ? 'fa-brands' : regular ? 'fa-regular' : 'fa-solid';
  return (
    <i
      className={`${family} fa-${name} ${className}`.trim()}
      style={style}
      title={title}
      onClick={onClick}
      aria-hidden="true"
    />
  );
}
