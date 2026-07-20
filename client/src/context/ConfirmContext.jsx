import { createContext, useCallback, useContext, useState } from 'react';
import ConfirmModal from '../components/ConfirmModal.jsx';

/**
 * Confirmation globale pour les actions lourdes de sens (retirer un contact,
 * bloquer, supprimer un salon, quitter un serveur…).
 *
 * Usage dans n'importe quel composant :
 *   const confirm = useConfirm();
 *   if (await confirm({ title, message, confirmLabel, danger })) { ... }
 *
 * Un seul ConfirmModal vit ici : pas besoin d'ajouter un état dans chaque écran.
 */
const ConfirmContext = createContext(() => Promise.resolve(false));

export const useConfirm = () => useContext(ConfirmContext);

export function ConfirmProvider({ children }) {
  const [state, setState] = useState(null); // { options, resolve } | null

  const confirm = useCallback((options) => new Promise((resolve) => {
    setState({ options: typeof options === 'string' ? { message: options } : options, resolve });
  }), []);

  const close = (result) => {
    setState((s) => { s?.resolve(result); return null; });
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {state && (
        <ConfirmModal
          title={state.options.title}
          message={state.options.message}
          confirmLabel={state.options.confirmLabel}
          danger={state.options.danger}
          requireText={state.options.requireText}
          onConfirm={() => close(true)}
          onClose={() => close(false)}
        />
      )}
    </ConfirmContext.Provider>
  );
}
