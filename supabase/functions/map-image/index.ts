// =====================================================================
// map-image — private-bucket broker for map illustrations.
//
// The app has no Supabase Auth users: access is proven by a per-space
// session token validated in SQL (map_image_access). This function is the
// ONLY path to the private `map-images` bucket:
//   POST /upload    raw bytes; validates size, magic bytes (PNG/JPEG/WebP
//                   only — SVG banned), declared-vs-sniffed type, and
//                   header-parsed dimensions BEFORE writing to Storage.
//   POST /view-url  short-lived signed download URL for visible maps.
//   POST /delete    removes the object (GM only).
// =====================================================================
import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  MAX_IMAGE_BYTES,
  MAX_IMAGE_DIMENSION,
  parseImageDimensions,
  sniffImageType,
} from './imageMeta.ts';

const BUCKET = 'map-images';
const SIGNED_URL_TTL = 3600; // seconds

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-space-token, x-map-id',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const service = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

function errorResponse(e: unknown): Response {
  const msg = e instanceof Error ? e.message : String(e);
  if (msg.includes('INVALID_TOKEN')) return json(401, { error: 'INVALID_TOKEN' });
  if (msg.includes('FORBIDDEN')) return json(403, { error: 'FORBIDDEN' });
  if (msg.includes('NOT_FOUND')) return json(404, { error: 'NOT_FOUND' });
  console.error('map-image error:', msg);
  return json(500, { error: 'INTERNAL' });
}

/** Authorize via SQL — the access rules live with the rest of the model. */
async function access(token: string, mapId: string, write: boolean) {
  const { data, error } = await service.rpc('map_image_access', {
    p_token: token,
    p_map_id: mapId,
    p_write: write,
  });
  if (error) throw new Error(error.message);
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error('NOT_FOUND');
  return row as { o_space: string; o_path: string | null };
}

/** Buffer the body with a hard cap — never trust Content-Length alone. */
async function readBodyCapped(req: Request, cap: number): Promise<Uint8Array | null> {
  const reader = req.body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > cap) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out;
}

async function handleUpload(req: Request): Promise<Response> {
  const token = req.headers.get('x-space-token') ?? '';
  const mapId = req.headers.get('x-map-id') ?? '';
  if (!token || !mapId) return json(400, { error: 'BAD_REQUEST' });

  const { o_space } = await access(token, mapId, true);

  const declaredLength = Number(req.headers.get('content-length') ?? '0');
  if (declaredLength > MAX_IMAGE_BYTES) return json(400, { error: 'IMAGE_TOO_LARGE' });

  const bytes = await readBodyCapped(req, MAX_IMAGE_BYTES);
  if (!bytes || bytes.byteLength === 0) return json(400, { error: 'IMAGE_TOO_LARGE' });

  const sniffed = sniffImageType(bytes);
  if (!sniffed) return json(400, { error: 'INVALID_IMAGE' });
  const declaredType = (req.headers.get('content-type') ?? '').split(';')[0].trim();
  if (declaredType !== sniffed) return json(400, { error: 'TYPE_MISMATCH' });

  const dims = parseImageDimensions(bytes, sniffed);
  if (!dims) return json(400, { error: 'INVALID_IMAGE' });
  if (dims.width > MAX_IMAGE_DIMENSION || dims.height > MAX_IMAGE_DIMENSION) {
    return json(400, { error: 'IMAGE_TOO_BIG_DIMENSIONS' });
  }

  const path = `spaces/${o_space}/${mapId}`;
  const { error: upErr } = await service.storage.from(BUCKET).upload(path, bytes, {
    contentType: sniffed, // sniffed, never the client's header
    upsert: true,
  });
  if (upErr) throw new Error(upErr.message);

  const { data: map, error: rowErr } = await service
    .from('maps')
    .update({
      image_path: path,
      image_width: dims.width,
      image_height: dims.height,
      updated_at: new Date().toISOString(),
    })
    .eq('id', mapId)
    .select()
    .single();
  if (rowErr) throw new Error(rowErr.message);

  return json(200, { map });
}

async function handleViewUrl(req: Request): Promise<Response> {
  const { token, mapId } = await req.json();
  if (!token || !mapId) return json(400, { error: 'BAD_REQUEST' });
  const { o_path } = await access(token, mapId, false);
  if (!o_path) return json(404, { error: 'NO_IMAGE' });
  const { data, error } = await service.storage
    .from(BUCKET)
    .createSignedUrl(o_path, SIGNED_URL_TTL);
  if (error) throw new Error(error.message);
  return json(200, { url: data.signedUrl, expiresIn: SIGNED_URL_TTL });
}

async function handleDelete(req: Request): Promise<Response> {
  const { token, mapId } = await req.json();
  if (!token || !mapId) return json(400, { error: 'BAD_REQUEST' });
  const { o_path } = await access(token, mapId, true);
  if (o_path) {
    const { error } = await service.storage.from(BUCKET).remove([o_path]);
    if (error) throw new Error(error.message);
    const { error: rowErr } = await service
      .from('maps')
      .update({ image_path: null, image_width: null, image_height: null })
      .eq('id', mapId);
    if (rowErr) throw new Error(rowErr.message);
  }
  return json(200, { ok: true });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json(405, { error: 'METHOD_NOT_ALLOWED' });
  const route = new URL(req.url).pathname.split('/').filter(Boolean).pop();
  try {
    if (route === 'upload') return await handleUpload(req);
    if (route === 'view-url') return await handleViewUrl(req);
    if (route === 'delete') return await handleDelete(req);
    return json(404, { error: 'NOT_FOUND' });
  } catch (e) {
    return errorResponse(e);
  }
});
