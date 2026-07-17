import { useState } from 'react';
import Modal from './Modal.jsx';
import Icon from './Icon.jsx';
import Logo from './Logo.jsx';

const KEY = 'pulsar.onboarding.hidden';

/** L'utilisateur a-t-il demandé à ne plus voir la présentation ? */
export const onboardingHidden = () => {
  try { return localStorage.getItem(KEY) === '1'; } catch { return false; }
};
const hideForever = () => {
  try { localStorage.setItem(KEY, '1'); } catch { /* sans conséquence */ }
};

const STEPS = [
  {
    icon: 'comments',
    title: 'Vos échanges, au bon endroit',
    text: 'Les serveurs regroupent vos équipes ou vos projets, et chaque serveur contient des salons pour séparer les sujets. Les messages privés restent à part, pour les échanges en tête à tête.',
    tip: 'Un point violet signale ce que vous n’avez pas encore lu.',
  },
  {
    icon: 'bolt',
    title: 'Écrire vite et bien',
    text: 'Collez directement une capture d’écran, glissez un fichier dans la conversation, mentionnez quelqu’un avec une arobase. Votre message commencé est conservé si vous changez de salon.',
    tip: 'La flèche à droite du champ ouvre les sondages, les messages programmés et le reste.',
  },
  {
    icon: 'video',
    title: 'Se parler et travailler ensemble',
    text: 'Rejoignez un salon vocal en un clic, activez la caméra ou partagez votre écran. Le tableau blanc et le visionnage commun permettent de réfléchir à plusieurs, en direct.',
    tip: 'Levez la main dans un salon vocal pour demander la parole sans couper les autres.',
  },
  {
    icon: 'wand-magic-sparkles',
    title: 'L’assistant, quand vous en avez besoin',
    text: 'Rattrapez une conversation trop longue en un résumé, ou faites reformuler un message avant de l’envoyer. Chaque action vous est toujours confirmée avant d’être lancée.',
    tip: 'Trois actions par jour sont offertes à chacun.',
  },
  {
    icon: 'sliders',
    title: 'Une application qui vous ressemble',
    text: 'Thème clair ou sombre, couleur d’accent, densité d’affichage, heures calmes pour couper les notifications le soir, statut personnalisé : tout se règle dans les paramètres.',
    tip: 'Ctrl+K (ou Cmd+K) ouvre la recherche rapide depuis n’importe où.',
  },
];

/**
 * Présentation des fonctionnalités, affichée à chaque connexion tant que
 * l'utilisateur n'a pas coché « Ne plus afficher ».
 * Volontairement impossible à quitter au clic à côté ou avec Échap : on en
 * sort par « Fermer », pour être sûr que le message a été vu.
 */
export default function Onboarding({ onClose }) {
  const [step, setStep] = useState(0);
  const last = step === STEPS.length - 1;
  const s = STEPS[step];

  function close(forever) {
    if (forever) hideForever();
    onClose();
  }

  return (
    <Modal className="onboarding" onClose={() => {}} escapable={false}>
      <div className="ob-head">
        <Logo size={34} />
        <span className="ob-count">{step + 1} sur {STEPS.length}</span>
      </div>

      <div className="ob-body">
        <span className="ob-ico"><Icon name={s.icon} /></span>
        <h2>{s.title}</h2>
        <p className="ob-text">{s.text}</p>
        <p className="ob-tip"><Icon name="lightbulb" /> {s.tip}</p>
      </div>

      <div className="ob-dots">
        {STEPS.map((_, i) => (
          <button
            key={i}
            className={`ob-dot ${i === step ? 'active' : ''}`}
            onClick={() => setStep(i)}
            aria-label={`Aller à l’étape ${i + 1}`}
          />
        ))}
      </div>

      {/* Dernière étape : les boutons de parcours laissent la place à la sortie. */}
      <div className="ob-nav">
        {last ? (
          <>
            <button className="btn-ghost" onClick={() => close(true)}>Ne plus afficher</button>
            <button className="btn" onClick={() => close(false)}>Fermer</button>
          </>
        ) : (
          <>
            {step > 0 && <button className="btn-ghost" onClick={() => setStep((v) => v - 1)}>Retour</button>}
            <button className="btn" onClick={() => setStep((v) => v + 1)}>Suivant</button>
          </>
        )}
      </div>
    </Modal>
  );
}
