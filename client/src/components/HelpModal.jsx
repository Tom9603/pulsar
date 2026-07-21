import { useMemo, useState } from 'react';
import Modal from './Modal.jsx';
import Icon from './Icon.jsx';

/**
 * Centre d'aide : une FAQ classée par thème, avec une recherche, et un accès
 * direct au support quand la réponse n'y est pas. Le contenu est volontairement
 * concret et pas à pas, pensé pour une personne qui découvre Pulsar.
 */
const FAQ = [
  {
    theme: 'Premiers pas', icon: 'rocket', items: [
      { q: 'Comment créer un serveur ?', a: 'Dans la colonne de gauche, cliquez sur le bouton « plus » sous vos serveurs, puis « Créer un serveur ». Donnez-lui un nom, une image si vous voulez, et il apparaît aussitôt. Vous en êtes le fondateur et pouvez tout y régler.' },
      { q: 'Comment inviter quelqu\'un sur mon serveur ?', a: 'Ouvrez le serveur, puis les réglages du serveur. Une invitation y est générée : copiez le lien et envoyez-le à la personne. Elle rejoint le serveur en un clic.' },
      { q: 'Comment ajouter un contact ?', a: 'Allez dans « Contacts » à gauche, puis « Ajouter un contact ». Saisissez le nom d\'utilisateur de la personne. Une fois qu\'elle accepte, vous pouvez discuter en privé et vous appeler.' },
    ],
  },
  {
    theme: 'Messages', icon: 'comment', items: [
      { q: 'Comment épingler un message important ?', a: 'Survolez le message, ouvrez son menu (les trois points), puis « Épingler ». Les messages épinglés restent accessibles en haut du salon et un clic vous y ramène.' },
      { q: 'Comment transférer un message ailleurs ?', a: 'Dans le menu du message, choisissez « Transférer », puis sélectionnez le salon ou le contact de destination. Le message part avec son contenu et ses éventuelles pièces jointes.' },
      { q: 'Comment retrouver un message plus tard ?', a: 'Vous pouvez l\'enregistrer (l\'icône marque-page) pour le ranger dans vos messages enregistrés, ou poser un rappel (l\'icône horloge) pour être notifié au bon moment.' },
      { q: 'Comment transformer un message en tâche ?', a: 'Dans le menu du message, choisissez « Créer une tâche ». Le message devient une tâche que vous retrouvez dans « Tasks », avec une échéance et un responsable si besoin.' },
    ],
  },
  {
    theme: 'Vocal et appels', icon: 'microphone', items: [
      { q: 'Comment rejoindre un salon vocal ?', a: 'Cliquez simplement sur un salon vocal dans la liste des salons. Vous y êtes connecté aussitôt, et les autres personnes présentes apparaissent à l\'écran.' },
      { q: 'Comment partager mon écran ?', a: 'Une fois dans un salon vocal, utilisez le bouton de partage d\'écran. Vous choisissez la fenêtre ou l\'écran entier à montrer, et vous l\'arrêtez d\'un clic quand vous voulez.' },
      { q: 'Comment appeler un contact en privé ?', a: 'Ouvrez la conversation avec la personne, puis lancez l\'appel depuis l\'icône d\'appel. Vous pouvez aussi passer l\'appel depuis la liste de vos conversations, au survol.' },
    ],
  },
  {
    theme: 'Tâches et organisation', icon: 'list-check', items: [
      { q: 'Où retrouver toutes mes tâches ?', a: 'Dans « Tasks », à gauche. Vous y voyez vos tâches personnelles et celles de vos serveurs, avec des filtres pour vous concentrer sur ce qui compte aujourd\'hui.' },
      { q: 'Comment fonctionne le tableau blanc ?', a: 'Dans un serveur, l\'icône du tableau blanc ouvre un espace de dessin partagé. Vous pouvez ensuite publier votre tableau dans le salon en une image.' },
    ],
  },
  {
    theme: 'Profil, compte et confidentialité', icon: 'user', items: [
      { q: 'Comment changer ma photo ou mon statut ?', a: 'Cliquez sur votre profil en haut à droite, puis « Modifier le profil ». Vous y changez votre photo, votre nom affiché, votre petite phrase et votre statut.' },
      { q: 'Comment régler mes notifications ?', a: 'Ouvrez les paramètres (l\'icône engrenage en haut à droite), rubrique des notifications. Vous choisissez ce qui vous alerte, et pouvez activer les notifications du bureau.' },
      { q: 'Comment bloquer une personne ?', a: 'Depuis son profil, ou depuis les paramètres, rubrique « Social ». Une personne bloquée ne peut plus vous contacter, et vous pouvez la débloquer à tout moment.' },
      { q: 'Comment mettre mon compte en pause ?', a: 'Dans les paramètres, tout en bas de la rubrique « Mon compte », vous pouvez désactiver temporairement votre compte. Il se réactive tout seul à votre prochaine connexion.' },
    ],
  },
];

export default function HelpModal({ onClose, onContact }) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(null); // clé "themeIndex-itemIndex" du panneau ouvert

  const q = query.trim().toLowerCase();
  const groups = useMemo(() => {
    if (!q) return FAQ;
    return FAQ
      .map((g) => ({ ...g, items: g.items.filter((it) => (it.q + ' ' + it.a).toLowerCase().includes(q)) }))
      .filter((g) => g.items.length);
  }, [q]);

  const nothing = q && groups.length === 0;

  return (
    <Modal onClose={onClose} className="modal-help">
      <div className="help-head">
        <h2><Icon name="life-ring" /> Centre d'aide</h2>
        <p className="modal-sub">Une question sur Pulsar&nbsp;? La réponse est probablement ici. Sinon, écrivez-nous, on vous répond.</p>
      </div>

      <div className="help-search">
        <Icon name="magnifying-glass" />
        <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Rechercher une question…" />
        {query && <button className="help-search-clear" title="Effacer" onClick={() => setQuery('')}><Icon name="xmark" /></button>}
      </div>

      <div className="help-body">
        {groups.map((g, gi) => (
          <div className="help-group" key={g.theme}>
            <div className="help-group-title"><Icon name={g.icon} /> {g.theme}</div>
            {g.items.map((it, ii) => {
              const key = `${gi}-${ii}`;
              const isOpen = open === key || !!q;
              return (
                <div className={`help-item ${isOpen ? 'open' : ''}`} key={it.q}>
                  <button className="help-q" onClick={() => setOpen(isOpen && !q ? null : key)}>
                    <span>{it.q}</span>
                    <Icon name="chevron-down" />
                  </button>
                  {isOpen && <div className="help-a">{it.a}</div>}
                </div>
              );
            })}
          </div>
        ))}

        {nothing && (
          <div className="help-empty">
            <Icon name="magnifying-glass" />
            <p>Aucune réponse ne correspond à « {query} ». Écrivez-nous, on s'en occupe.</p>
          </div>
        )}
      </div>

      <div className="help-contact">
        <div className="help-contact-text">
          <strong>Vous n'avez pas trouvé&nbsp;?</strong>
          <span>Décrivez-nous votre souci ou votre idée, on vous répond par email.</span>
        </div>
        <button className="btn" onClick={() => { onClose(); onContact(); }}><Icon name="paper-plane" /> Nous contacter</button>
      </div>
    </Modal>
  );
}
