/**
 * Textes légaux, en un seul endroit : ils sont affichés à l'inscription
 * (fenêtre d'acceptation) et dans les paramètres (rubrique « À propos »).
 *
 * TERMS_VERSION : à incrémenter à chaque modification de fond. L'acceptation
 * est enregistrée avec cette version, ce qui permet de savoir plus tard qui a
 * accepté quoi, et de redemander l'accord si les conditions changent.
 */
export const TERMS_VERSION = 1;
export const TERMS_DATE = '17 juillet 2026';

// Identité de l'éditeur. Pulsar est édité à titre individuel par Tom Ochietti ;
// pour une adresse de contact dédiée (plutôt que l'email personnel), il suffit
// de remplacer « contact » ci-dessous.
export const EDITOR = {
  name: 'Tom Ochietti',
  contact: 'tom.ochietti@gmail.com',
  publisher: 'Tom Ochietti',
  host: 'Hetzner Online GmbH, Industriestr. 25, 91710 Gunzenhausen, Allemagne',
  hostCountry: 'Allemagne (Union européenne)',
};

export function Terms() {
  return (
    <>
      <p className="legal-date">Version {TERMS_VERSION}, en vigueur au {TERMS_DATE}.</p>

      <h4>1. Objet</h4>
      <p>
        Les présentes conditions générales d'utilisation encadrent l'accès à Pulsar et son usage.
        Pulsar est un service de messagerie destiné aux équipes : salons de discussion, messages
        privés, appels, partage de fichiers et outils de travail associés.
      </p>

      <h4>2. Acceptation</h4>
      <p>
        La création d'un compte vaut acceptation pleine et entière des présentes conditions.
        Si vous n'y consentez pas, n'utilisez pas le service. En cas de modification de fond,
        votre accord vous sera redemandé.
      </p>

      <h4>3. Votre compte</h4>
      <p>
        Vous devez avoir au moins 15 ans pour créer un compte. Vous vous engagez à fournir une
        adresse email valide et des informations exactes. Vous êtes responsable de la
        confidentialité de votre mot de passe et des actions menées depuis votre compte.
        Prévenez-nous sans délai en cas d'utilisation non autorisée.
      </p>

      <h4>4. Usages interdits</h4>
      <p>Il est notamment interdit d'utiliser Pulsar pour :</p>
      <ul>
        <li>diffuser des contenus illicites, haineux, violents, diffamatoires ou pornographiques ;</li>
        <li>harceler, menacer ou usurper l'identité d'autrui ;</li>
        <li>diffuser des logiciels malveillants, ou tenter d'accéder à des données ou comptes qui ne vous appartiennent pas ;</li>
        <li>envoyer des messages non sollicités en masse, ou automatiser des envois pour nuire au service ;</li>
        <li>porter atteinte aux droits de propriété intellectuelle de tiers ;</li>
        <li>perturber le fonctionnement du service ou contourner ses limitations techniques.</li>
      </ul>

      <h4>5. Vos contenus</h4>
      <p>
        Vous restez propriétaire des contenus que vous publiez. Vous nous accordez uniquement le
        droit technique de les héberger, stocker et afficher aux destinataires que vous visez,
        dans le seul but de faire fonctionner le service. Nous ne les exploitons à aucune autre
        fin, et nous ne les vendons pas.
      </p>
      <p>
        Vous êtes seul responsable de ce que vous publiez et devez disposer des droits nécessaires.
      </p>

      <h4>6. Assistant (fonctions d'intelligence artificielle)</h4>
      <p>
        Certaines fonctions facultatives (résumé de conversation, reformulation d'un message)
        transmettent le texte concerné à notre prestataire Anthropic pour produire une réponse.
        Ces fonctions ne se déclenchent jamais seules : une confirmation vous est demandée à
        chaque fois. Les résultats sont générés automatiquement et peuvent comporter des erreurs :
        ils ne constituent ni un conseil professionnel, ni une vérité établie.
      </p>

      <h4>7. Disponibilité</h4>
      <p>
        Nous nous efforçons d'assurer un service continu, sans pouvoir le garantir. Le service
        peut être interrompu pour maintenance, mise à jour, ou en cas d'incident technique.
        Il est fourni « en l'état », sans garantie d'absence d'erreur.
      </p>

      <h4>8. Suspension et résiliation</h4>
      <p>
        Vous pouvez supprimer votre compte à tout moment depuis les paramètres. Nous pouvons
        suspendre ou fermer un compte en cas de manquement grave aux présentes conditions,
        après information de la personne concernée sauf urgence ou obligation légale.
      </p>

      <h4>9. Responsabilité</h4>
      <p>
        Notre responsabilité ne saurait être engagée pour les contenus publiés par les
        utilisateurs, ni pour les dommages indirects résultant de l'utilisation du service.
        Aucune stipulation des présentes ne vise à écarter une responsabilité qui ne peut
        légalement l'être.
      </p>

      <h4>10. Modification des conditions</h4>
      <p>
        Ces conditions peuvent évoluer. Toute modification de fond fera l'objet d'une information
        et d'une nouvelle acceptation avant de continuer à utiliser le service.
      </p>

      <h4>11. Droit applicable</h4>
      <p>
        Les présentes conditions sont soumises au droit français. À défaut de résolution amiable,
        les tribunaux français seront compétents. Vous pouvez recourir gratuitement à un médiateur
        de la consommation si vous êtes consommateur.
      </p>
    </>
  );
}

export function Privacy() {
  return (
    <>
      <p className="legal-date">Version {TERMS_VERSION}, en vigueur au {TERMS_DATE}.</p>

      <h4>1. Qui traite vos données</h4>
      <p>
        Le responsable du traitement est {EDITOR.name}. Pour toute question relative à vos
        données : {EDITOR.contact}.
      </p>

      <h4>2. Données que nous traitons</h4>
      <ul>
        <li><strong>Compte :</strong> nom d'utilisateur, nom affiché, adresse email, mot de passe (conservé sous forme chiffrée, jamais en clair), avatar.</li>
        <li><strong>Profil (facultatif) :</strong> poste, entreprise, localisation, site, téléphone, compétences, CV, pronoms, bannière.</li>
        <li><strong>Contenus :</strong> messages, fichiers envoyés, réactions, sondages, tâches, notes et rappels.</li>
        <li><strong>Usage :</strong> statut de connexion, appartenance aux serveurs et salons, messages lus.</li>
        <li><strong>Technique :</strong> sessions ouvertes (type d'appareil et navigateur, date de dernière activité), adresse IP le temps de la connexion, à des fins de sécurité.</li>
      </ul>

      <h4>3. Pourquoi, et sur quelle base</h4>
      <ul>
        <li><strong>Fournir le service</strong> (compte, messagerie, appels) : exécution du contrat qui nous lie.</li>
        <li><strong>Sécuriser le service</strong> (confirmation d'adresse, limitation des abus, journal des sessions) : intérêt légitime et obligation de sécurité.</li>
        <li><strong>Fonctions d'assistant</strong> : votre demande explicite, confirmée à chaque usage.</li>
        <li><strong>Répondre à vos demandes</strong> (support, exercice de vos droits) : obligation légale.</li>
      </ul>
      <p>Nous ne faisons ni publicité ciblée, ni revente de données, ni profilage.</p>

      <h4>4. Qui y a accès</h4>
      <ul>
        <li><strong>Les destinataires que vous choisissez</strong> : membres de vos serveurs, personnes à qui vous écrivez.</li>
        <li><strong>{EDITOR.host}</strong> : hébergement des serveurs et de la base de données. Données stockées en {EDITOR.hostCountry}.</li>
        <li><strong>Anthropic</strong> : uniquement le texte que vous soumettez volontairement à une fonction d'assistant.</li>
        <li><strong>Notre prestataire d'envoi d'emails</strong> : votre adresse email, pour vous transmettre un code de confirmation ou un lien de réinitialisation.</li>
      </ul>
      <p>Aucune autre communication n'est faite, sauf obligation légale.</p>

      <h4>5. Combien de temps</h4>
      <ul>
        <li><strong>Compte et contenus :</strong> tant que votre compte existe.</li>
        <li><strong>Après suppression du compte :</strong> vos données personnelles sont effacées. Les messages envoyés dans un salon partagé peuvent subsister chez leurs destinataires, dissociés de votre profil.</li>
        <li><strong>Codes de confirmation :</strong> 15 minutes. <strong>Liens de réinitialisation :</strong> 1 heure.</li>
        <li><strong>Sauvegardes techniques :</strong> 30 jours au maximum, puis effacement automatique.</li>
      </ul>

      <h4>6. Vos droits</h4>
      <p>
        Vous disposez d'un droit d'accès, de rectification, d'effacement, de limitation,
        d'opposition et de portabilité de vos données.
      </p>
      <ul>
        <li><strong>Accès et portabilité :</strong> le bouton « Exporter mes données » dans les paramètres vous remet immédiatement l'ensemble de vos données dans un fichier lisible.</li>
        <li><strong>Rectification :</strong> vos informations sont modifiables à tout moment dans votre profil.</li>
        <li><strong>Effacement :</strong> la suppression du compte est disponible dans les paramètres.</li>
        <li><strong>Autres demandes :</strong> écrivez à {EDITOR.contact}.</li>
      </ul>
      <p>
        Si vous estimez que vos droits ne sont pas respectés, vous pouvez saisir la CNIL
        (Commission nationale de l'informatique et des libertés, www.cnil.fr).
      </p>

      <h4>7. Stockage sur votre appareil</h4>
      <p>
        Pulsar n'utilise pas de cookie publicitaire ni de traceur tiers. L'application conserve
        sur votre appareil uniquement ce qui lui est nécessaire : votre jeton de connexion, vos
        préférences d'affichage et vos brouillons de messages. Vous pouvez les effacer en vidant
        les données du site dans votre navigateur.
      </p>

      <h4>8. Sécurité</h4>
      <p>
        Les échanges sont chiffrés en transit (HTTPS). Les mots de passe sont stockés sous forme
        d'empreinte non réversible. L'accès aux serveurs est restreint et les sauvegardes sont
        automatisées. Aucun système n'étant infaillible, nous vous informerons sans délai en cas
        de violation de données présentant un risque pour vos droits.
      </p>
    </>
  );
}

export function LegalNotice() {
  return (
    <>
      <p><strong>Éditeur :</strong> {EDITOR.name}</p>
      <p><strong>Contact :</strong> {EDITOR.contact}</p>
      <p><strong>Directeur de la publication :</strong> {EDITOR.publisher}</p>
      <p><strong>Hébergeur :</strong> {EDITOR.host}</p>
    </>
  );
}
