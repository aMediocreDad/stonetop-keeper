// =====================================================================
// Préparation client des images de carte (UX seulement — la validation
// qui compte est côté Edge Function). Réduit au besoin, ré-encode en
// WebP, génère l'aperçu `thumb` et la data-URL du repli localStorage.
// =====================================================================
import { ALLOWED_IMAGE_TYPES, MAX_IMAGE_BYTES, sniffImageType } from '@/lib/map/imageMeta';
import type { MapImageUpload } from '@/types';

const MAX_EDGE = 8192;   // réduction au-delà (le zoom reste confortable)
const THUMB_EDGE = 320;
const LOCAL_EDGE = 2048; // data-URL du repli localStorage (quota ~5 Mo)

export type PreparedMapImage = MapImageUpload & { thumb: string };

function draw(bitmap: ImageBitmap, maxEdge: number): HTMLCanvasElement {
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function toBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('ENCODE_FAILED'))),
      'image/webp',
      quality,
    ),
  );
}

export async function prepareMapImage(file: File): Promise<PreparedMapImage> {
  // Sniffing local (même module que le serveur) pour un échec précoce lisible.
  const head = new Uint8Array(await file.slice(0, 32).arrayBuffer());
  if (!sniffImageType(head)) throw new Error('IMAGE_BAD_TYPE');

  const bitmap = await createImageBitmap(file);
  try {
    const needsRescale = Math.max(bitmap.width, bitmap.height) > MAX_EDGE;
    let blob: Blob;
    let width = bitmap.width;
    let height = bitmap.height;

    if (!needsRescale && file.size <= MAX_IMAGE_BYTES &&
        (ALLOWED_IMAGE_TYPES as string[]).includes(file.type)) {
      blob = file;
    } else {
      const canvas = draw(bitmap, MAX_EDGE);
      width = canvas.width;
      height = canvas.height;
      blob = await toBlob(canvas, 0.85);
      if (blob.size > MAX_IMAGE_BYTES) throw new Error('IMAGE_TOO_LARGE');
    }

    const thumb = draw(bitmap, THUMB_EDGE).toDataURL('image/webp', 0.7);
    const dataUrl = draw(bitmap, LOCAL_EDGE).toDataURL('image/webp', 0.8);
    return { blob, width, height, thumb, dataUrl };
  } finally {
    bitmap.close();
  }
}
