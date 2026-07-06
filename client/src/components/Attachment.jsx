import { mediaUrl, isAudio } from '../api.js';
import Icon from './Icon.jsx';
import VoiceMessage from './VoiceMessage.jsx';

const isImage = (u) => /\.(png|jpe?g|gif|webp)$/i.test(u || '');

/** Affiche une pièce jointe : image, audio (message vocal), ou carte de fichier. */
export default function Attachment({ url, name }) {
  if (!url) return null;
  const full = mediaUrl(url);
  if (isImage(url)) {
    return <img className="msg-image" src={full} alt={name || 'image'} onClick={() => window.open(full, '_blank')} />;
  }
  if (isAudio(url)) {
    return <VoiceMessage src={full} />;
  }
  return (
    <a className="msg-file" href={full} target="_blank" rel="noopener noreferrer">
      <span className="file-icon"><Icon name="file-lines" /></span>
      <span className="file-name">{name || 'fichier'}</span>
      <span className="file-dl"><Icon name="download" /></span>
    </a>
  );
}
