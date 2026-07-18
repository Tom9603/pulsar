/**
 * Prépare une image choisie par l'utilisateur pour l'envoi au serveur.
 *
 * Deux rôles essentiels :
 *  1. NORMALISER le format. Les iPhone produisent du HEIC, que seuls les
 *     appareils Apple savent afficher. En redessinant l'image dans un canvas
 *     puis en l'exportant, on obtient toujours du JPEG/PNG, lisible partout.
 *  2. REDIMENSIONNER. Une photo de 4000 px n'a aucun intérêt pour un avatar :
 *     on la ramène à une taille raisonnable, ce qui allège fichier et base.
 *
 * Renvoie une « data URL » (image encodée) prête à passer à uploadImage().
 * Lève une erreur si le navigateur ne sait pas décoder le fichier (cas d'un
 * HEIC ouvert sur un navigateur non-Apple — rare, car l'expéditeur voit alors
 * lui-même que son image ne s'affiche pas).
 */
export function fileToImageDataUrl(file, { max = 512, square = false, type = 'image/jpeg', quality = 0.9 } = {}) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      try {
        let { width, height } = img;
        if (!width || !height) throw new Error('Image illisible');

        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        if (square) {
          // Avatar : on recadre au centre en carré, puis on met à la taille voulue.
          const side = Math.min(width, height);
          const sx = (width - side) / 2;
          const sy = (height - side) / 2;
          canvas.width = canvas.height = Math.min(max, side);
          ctx.drawImage(img, sx, sy, side, side, 0, 0, canvas.width, canvas.height);
        } else {
          // Bannière : on garde les proportions, borné par « max » sur le grand côté.
          const scale = Math.min(1, max / Math.max(width, height));
          canvas.width = Math.round(width * scale);
          canvas.height = Math.round(height * scale);
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        }

        const out = canvas.toDataURL(type, quality);
        // Un canvas vide (décodage échoué) ressort minuscule : on le refuse.
        if (!out || out.length < 200) throw new Error('Conversion de l’image impossible');
        resolve(out);
      } catch (e) {
        reject(e);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Ce format d’image n’est pas pris en charge. Essayez un JPEG ou un PNG.'));
    };
    img.src = url;
  });
}
