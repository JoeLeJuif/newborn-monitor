// Redimensionnement + compression d'une photo côté client, avant stockage.
// Ne touche jamais aux photos déjà enregistrées (appliqué aux nouveaux imports).
import { computeResizeDimensions } from './dataops.js';

// Renvoie une data URL JPEG redimensionnée (max ~1024 px, qualité 0,8).
export function resizeImageFile(file, { maxDim = 1024, quality = 0.8 } = {}) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('lecture du fichier impossible'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('image illisible'));
      img.onload = () => {
        try {
          const { width, height } = computeResizeDimensions(
            img.naturalWidth,
            img.naturalHeight,
            maxDim,
          );
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL('image/jpeg', quality));
        } catch (e) {
          reject(e);
        }
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}
