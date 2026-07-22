// Avatars prêts à l'emploi : illustrations LIBRES DE DROIT, embarquées dans
// l'application (aucun appel externe à l'usage). Rangés par STYLE.
// Fichiers nommés « <style>-NN.png » ; le style donne le groupe affiché.
const modules = import.meta.glob('./assets/avatars/*.png', { eager: true, query: '?url', import: 'default' });

const GROUP_LABELS = {
  people: 'Personnes',
  sketch: 'Personnages dessinés',
  illus: 'Illustrations',
  robot: 'Robots',
  shape: 'Formes colorées',
};
const GROUP_ORDER = ['people', 'sketch', 'illus', 'robot', 'shape'];

const byGroup = {};
for (const path of Object.keys(modules).sort()) {
  const file = path.split('/').pop();          // ex. « people-03.png »
  const key = file.split('-')[0];              // ex. « people »
  (byGroup[key] ||= []).push(modules[path]);
}

// Groupes ordonnés, prêts pour un affichage rangé par style.
export const AVATAR_GROUPS = GROUP_ORDER
  .filter((k) => byGroup[k]?.length)
  .map((k) => ({ key: k, label: GROUP_LABELS[k] || k, avatars: byGroup[k] }));

// Liste à plat (tous les avatars), utile pour un aperçu court.
export const PRESET_AVATARS = AVATAR_GROUPS.flatMap((g) => g.avatars);

// Convertit un avatar embarqué en « data URL » pour l'enregistrer comme photo
// de profil (même chemin d'upload qu'une image importée).
export async function assetToDataUrl(url) {
  const res = await fetch(url);
  const blob = await res.blob();
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}
