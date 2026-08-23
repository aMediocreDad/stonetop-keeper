// KEEP IN SYNC with app/src/lib/imageMeta.ts (canonical copy — edit there first).
// =====================================================================
// Validation d'images de carte — PURE et web-standard (pas de DOM, pas
// d'import) : ce module est aussi importé par l'Edge Function Deno
// (`supabase/functions/map-image/index.ts`) via chemin relatif. Toute la
// décision de sécurité upload (OWASP file upload) s'appuie dessus :
// sniffing par octets magiques (jamais le Content-Type déclaré) et
// dimensions lues dans l'en-tête (bombe de décompression).
// =====================================================================

export type SniffedImageType = 'image/png' | 'image/jpeg' | 'image/webp';

export const ALLOWED_IMAGE_TYPES: SniffedImageType[] = [
  'image/png',
  'image/jpeg',
  'image/webp',
];
export const MAX_IMAGE_BYTES = 20971520; // 20 MB — aligné sur le bucket
export const MAX_IMAGE_DIMENSION = 12000; // px par côté

export function sniffImageType(bytes: Uint8Array): SniffedImageType | null {
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
    bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a
  ) {
    return 'image/png';
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg';
  }
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) {
    return 'image/webp';
  }
  return null;
}

export function parseImageDimensions(
  bytes: Uint8Array,
  type: SniffedImageType,
): { width: number; height: number } | null {
  switch (type) {
    case 'image/png':
      return parsePng(bytes);
    case 'image/jpeg':
      return parseJpeg(bytes);
    case 'image/webp':
      return parseWebp(bytes);
  }
}

function view(b: Uint8Array): DataView {
  return new DataView(b.buffer, b.byteOffset, b.byteLength);
}

// IHDR est obligatoirement le premier chunk : largeur/hauteur à 16/20.
function parsePng(b: Uint8Array): { width: number; height: number } | null {
  if (b.length < 24) return null;
  if (!(b[12] === 0x49 && b[13] === 0x48 && b[14] === 0x44 && b[15] === 0x52)) return null;
  const dv = view(b);
  const width = dv.getUint32(16);
  const height = dv.getUint32(20);
  return width > 0 && height > 0 ? { width, height } : null;
}

// Parcourt les segments jusqu'au SOF (C0..CF sauf C4/C8/CC) : h à +5, w à +7.
function parseJpeg(b: Uint8Array): { width: number; height: number } | null {
  const dv = view(b);
  let i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) return null;
    const marker = b[i + 1];
    // Marqueurs sans segment (padding, RSTn, TEM)
    if (marker === 0xff) { i += 1; continue; }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue; }
    const len = dv.getUint16(i + 2);
    if (len < 2) return null;
    const isSof =
      marker >= 0xc0 && marker <= 0xcf &&
      marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isSof) {
      const height = dv.getUint16(i + 5);
      const width = dv.getUint16(i + 7);
      return width > 0 && height > 0 ? { width, height } : null;
    }
    i += 2 + len;
  }
  return null;
}

// Trois variantes : VP8X (canvas 24-bit LE -1), VP8 (lossy, 14-bit LE après
// le start code 9D 01 2A), VP8L (lossless, 14-bit packés après 0x2F).
function parseWebp(b: Uint8Array): { width: number; height: number } | null {
  if (b.length < 16) return null;
  const fourcc = String.fromCharCode(b[12], b[13], b[14], b[15]);
  const dv = view(b);
  if (fourcc === 'VP8X') {
    if (b.length < 30) return null;
    const width = 1 + (b[24] | (b[25] << 8) | (b[26] << 16));
    const height = 1 + (b[27] | (b[28] << 8) | (b[29] << 16));
    return { width, height };
  }
  if (fourcc === 'VP8 ') {
    if (b.length < 30) return null;
    if (!(b[23] === 0x9d && b[24] === 0x01 && b[25] === 0x2a)) return null;
    const width = dv.getUint16(26, true) & 0x3fff;
    const height = dv.getUint16(28, true) & 0x3fff;
    return width > 0 && height > 0 ? { width, height } : null;
  }
  if (fourcc === 'VP8L') {
    if (b.length < 25) return null;
    if (b[20] !== 0x2f) return null;
    const bits = b[21] | (b[22] << 8) | (b[23] << 16) | (b[24] << 24);
    const width = (bits & 0x3fff) + 1;
    const height = ((bits >> 14) & 0x3fff) + 1;
    return { width, height };
  }
  return null;
}
