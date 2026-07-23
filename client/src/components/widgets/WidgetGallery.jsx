import { useState } from 'react';
import Modal from '../Modal.jsx';
import Icon from '../Icon.jsx';
import { WIDGETS, SIZE_LABELS, sizeKey } from './registry.jsx';

/**
 * Centre des widgets : on y ajoute ce qu'on veut sur l'accueil, on choisit la
 * taille de départ, on retire ce qui ne sert plus et on peut tout remettre à
 * zéro. Le placement, lui, se fait directement sur la grille.
 */
export default function WidgetGallery({ layout, cols, onAdd, onRemove, onReset, onClose }) {
  const [tab, setTab] = useState('ajouter');
  const [sizes, setSizes] = useState({}); // type -> "2x2" choisi dans la galerie
  const posed = layout.reduce((m, w) => { m[w.type] = (m[w.type] || 0) + 1; return m; }, {});

  const entries = Object.entries(WIDGETS);

  return (
    <Modal className="modal-widgets" onClose={onClose}>
      <h2>Centre des widgets</h2>
      <p className="modal-sub">Composez votre accueil : ajoutez ce qui vous est utile, puis glissez les blocs sur la grille pour les placer.</p>

      <div className="seg wg-gal-tabs">
        <button className={tab === 'ajouter' ? 'active' : ''} onClick={() => setTab('ajouter')}>Ajouter</button>
        <button className={tab === 'poses' ? 'active' : ''} onClick={() => setTab('poses')}>Sur l’accueil · {layout.length}</button>
      </div>

      {tab === 'ajouter' && (
        <div className="wg-gal-list">
          {entries.map(([type, def]) => {
            const choices = def.sizes.filter(([w]) => w <= cols);
            const chosen = sizes[type] || sizeKey(choices[0][0], choices[0][1]);
            const [cw, ch] = chosen.split('x').map(Number);
            return (
              <div className="wg-gal-item" key={type}>
                <span className="wg-gal-icon"><Icon name={def.icon} /></span>
                <div className="wg-gal-main">
                  <div className="wg-gal-name">
                    {def.name}
                    {posed[type] ? <span className="wg-gal-tag">déjà posé{posed[type] > 1 ? ` ×${posed[type]}` : ''}</span> : null}
                  </div>
                  <div className="wg-gal-desc">{def.description}</div>
                  <div className="seg wg-gal-sizes">
                    {choices.map(([w, h]) => (
                      <button
                        key={sizeKey(w, h)}
                        className={chosen === sizeKey(w, h) ? 'active' : ''}
                        onClick={() => setSizes((s) => ({ ...s, [type]: sizeKey(w, h) }))}
                      >{SIZE_LABELS[sizeKey(w, h)] || `${w}×${h}`}</button>
                    ))}
                  </div>
                </div>
                <button className="btn wg-gal-add" onClick={() => onAdd(type, cw, ch)}>
                  <Icon name="plus" /> Ajouter
                </button>
              </div>
            );
          })}
        </div>
      )}

      {tab === 'poses' && (
        <div className="wg-gal-list">
          {layout.length === 0 && <p className="wg-gal-empty">Aucun widget sur l’accueil. Ajoutez-en depuis l’onglet « Ajouter ».</p>}
          {layout.map((item) => {
            const def = WIDGETS[item.type];
            if (!def) return null;
            return (
              <div className="wg-gal-item" key={item.id}>
                <span className="wg-gal-icon"><Icon name={def.icon} /></span>
                <div className="wg-gal-main">
                  <div className="wg-gal-name">{def.name}</div>
                  <div className="wg-gal-desc">
                    {SIZE_LABELS[sizeKey(item.w, item.h)] || `${item.w}×${item.h}`} · colonne {item.x + 1}, ligne {item.y + 1}
                  </div>
                </div>
                <button className="btn btn-ghost wg-gal-remove" onClick={() => onRemove(item.id)}>
                  <Icon name="trash" /> Retirer
                </button>
              </div>
            );
          })}
        </div>
      )}

      <div className="modal-actions wg-gal-actions">
        <button className="btn btn-ghost" onClick={onReset}><Icon name="rotate-left" /> Disposition d’origine</button>
        <button className="btn" onClick={onClose}>Terminé</button>
      </div>
    </Modal>
  );
}
