import { describe, expect, it } from 'vitest';
import { parseImageDimensions, sniffImageType } from '@/lib/map/imageMeta';

/** PNG: signature + IHDR chunk with the given dimensions. */
function pngBytes(width: number, height: number): Uint8Array {
  const b = new Uint8Array(24);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0); // signature
  b.set([0x00, 0x00, 0x00, 0x0d], 8); // IHDR length
  b.set([0x49, 0x48, 0x44, 0x52], 12); // "IHDR"
  new DataView(b.buffer).setUint32(16, width);
  new DataView(b.buffer).setUint32(20, height);
  return b;
}

/** JPEG: SOI + APP0 (skippable) + SOF0 with the given dimensions. */
function jpegBytes(width: number, height: number): Uint8Array {
  const b = new Uint8Array(2 + 4 + 2 + 2 + 2 + 1 + 4);
  const dv = new DataView(b.buffer);
  let i = 0;
  b.set([0xff, 0xd8], i); i += 2;              // SOI
  b.set([0xff, 0xe0], i); dv.setUint16(i + 2, 2); i += 4; // APP0, len 2 (empty)
  b.set([0xff, 0xc0], i);                       // SOF0
  dv.setUint16(i + 2, 11);                      // segment length
  b[i + 4] = 8;                                 // precision
  dv.setUint16(i + 5, height);
  dv.setUint16(i + 7, width);
  return b;
}

/** WebP: RIFF/WEBP + VP8X extended header with the given canvas size. */
function webpVp8xBytes(width: number, height: number): Uint8Array {
  const b = new Uint8Array(30);
  b.set([0x52, 0x49, 0x46, 0x46], 0);           // "RIFF"
  b.set([0x57, 0x45, 0x42, 0x50], 8);           // "WEBP"
  b.set([0x56, 0x50, 0x38, 0x58], 12);          // "VP8X"
  b.set([0x0a, 0x00, 0x00, 0x00], 16);          // chunk size 10
  const w = width - 1, h = height - 1;
  b.set([w & 0xff, (w >> 8) & 0xff, (w >> 16) & 0xff], 24);
  b.set([h & 0xff, (h >> 8) & 0xff, (h >> 16) & 0xff], 27);
  return b;
}

/** WebP lossy: VP8 bitstream with the sync code and 14-bit LE dimensions. */
function webpVp8Bytes(width: number, height: number): Uint8Array {
  const b = new Uint8Array(30);
  b.set([0x52, 0x49, 0x46, 0x46], 0);           // "RIFF"
  b.set([0x57, 0x45, 0x42, 0x50], 8);           // "WEBP"
  b.set([0x56, 0x50, 0x38, 0x20], 12);          // "VP8 " (lossy)
  b.set([0x9d, 0x01, 0x2a], 23);                // start code
  new DataView(b.buffer).setUint16(26, width & 0x3fff, true);
  new DataView(b.buffer).setUint16(28, height & 0x3fff, true);
  return b;
}

/** WebP lossless: VP8L with 14-bit packed dimensions. */
function webpVp8lBytes(width: number, height: number): Uint8Array {
  const b = new Uint8Array(25);
  b.set([0x52, 0x49, 0x46, 0x46], 0);
  b.set([0x57, 0x45, 0x42, 0x50], 8);
  b.set([0x56, 0x50, 0x38, 0x4c], 12);          // "VP8L"
  b[20] = 0x2f;                                  // signature byte
  const bits = (width - 1) | ((height - 1) << 14);
  b[21] = bits & 0xff;
  b[22] = (bits >> 8) & 0xff;
  b[23] = (bits >> 16) & 0xff;
  b[24] = (bits >> 24) & 0xff;
  return b;
}

describe('sniffImageType', () => {
  it('detects png / jpeg / webp by magic bytes', () => {
    expect(sniffImageType(pngBytes(1, 1))).toBe('image/png');
    expect(sniffImageType(jpegBytes(1, 1))).toBe('image/jpeg');
    expect(sniffImageType(webpVp8xBytes(1, 1))).toBe('image/webp');
  });

  it('rejects SVG, truncated, and arbitrary bytes', () => {
    expect(sniffImageType(new TextEncoder().encode('<svg xmlns='))).toBeNull();
    expect(sniffImageType(new Uint8Array([0x89, 0x50]))).toBeNull();
    expect(sniffImageType(new Uint8Array(64))).toBeNull();
    // RIFF but not WEBP (e.g. WAV) must not pass
    const wav = webpVp8xBytes(1, 1); wav.set([0x57, 0x41, 0x56, 0x45], 8);
    expect(sniffImageType(wav)).toBeNull();
  });
});

describe('parseImageDimensions', () => {
  it('reads PNG IHDR dimensions', () => {
    expect(parseImageDimensions(pngBytes(4000, 3000), 'image/png'))
      .toEqual({ width: 4000, height: 3000 });
  });

  it('walks JPEG markers to SOF', () => {
    expect(parseImageDimensions(jpegBytes(1234, 567), 'image/jpeg'))
      .toEqual({ width: 1234, height: 567 });
  });

  it('reads WebP VP8X and VP8L dimensions', () => {
    expect(parseImageDimensions(webpVp8xBytes(8000, 6000), 'image/webp'))
      .toEqual({ width: 8000, height: 6000 });
    expect(parseImageDimensions(webpVp8lBytes(1920, 1080), 'image/webp'))
      .toEqual({ width: 1920, height: 1080 });
  });

  it('reads WebP VP8 (lossy) dimensions', () => {
    expect(parseImageDimensions(webpVp8Bytes(640, 480), 'image/webp'))
      .toEqual({ width: 640, height: 480 });
  });

  it('rejects a WebP VP8 fixture with a corrupt sync code', () => {
    const corrupt = webpVp8Bytes(640, 480);
    corrupt[23] = 0x00;
    expect(parseImageDimensions(corrupt, 'image/webp')).toBeNull();
  });

  it('returns null on malformed data instead of throwing', () => {
    expect(parseImageDimensions(new Uint8Array(10), 'image/png')).toBeNull();
    expect(parseImageDimensions(new Uint8Array([0xff, 0xd8, 0x00]), 'image/jpeg')).toBeNull();
    expect(parseImageDimensions(new Uint8Array(16), 'image/webp')).toBeNull();
  });
});
