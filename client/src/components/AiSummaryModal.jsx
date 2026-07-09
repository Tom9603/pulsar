import { useEffect, useState } from 'react';
import Modal from './Modal.jsx';
import Icon from './Icon.jsx';
import { aiSummarize } from '../ai.js';

/** « Rattrapage » : résumé IA des messages non lus d'un salon. */
export default function AiSummaryModal({ channelId, channelName, onClose }) {
  const [state, setState] = useState({ loading: true });

  useEffect(() => {
    let cancelled = false;
    aiSummarize(channelId)
      .then((d) => { if (!cancelled) setState({ loading: false, ...d }); })
      .catch((e) => { if (!cancelled) setState({ loading: false, error: e.message }); });
    return () => { cancelled = true; };
  }, [channelId]);

  return (
    <Modal onClose={onClose} className="modal-ai">
      <h2><span className="ai-spark"><Icon name="wand-magic-sparkles" /></span> Rattrapage {channelName ? `· ${channelName}` : ''}</h2>

      {state.loading && <p className="modal-sub"><Icon name="spinner" /> L'assistant lit les nouveaux messages…</p>}

      {!state.loading && state.error && <div className="error-msg">{state.error}</div>}

      {!state.loading && state.empty && (
        <p className="modal-sub">Rien de nouveau à résumer ici : vous êtes à jour.</p>
      )}

      {!state.loading && state.summary && (
        <>
          <div className="ai-result">{state.summary}</div>
          <div className="ai-foot">
            <span><Icon name="circle-info" /> Généré par l'assistant à partir de {state.count} message{state.count > 1 ? 's' : ''}. Peut se tromper.</span>
            {typeof state.remaining === 'number' && <span className="ai-quota">{state.remaining} action{state.remaining > 1 ? 's' : ''} IA restante{state.remaining > 1 ? 's' : ''} aujourd'hui</span>}
          </div>
        </>
      )}

      <div className="modal-actions">
        <button className="btn btn-ghost" onClick={onClose}>Fermer</button>
      </div>
    </Modal>
  );
}
