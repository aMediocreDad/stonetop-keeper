import { createMcpHandler, type McpHttpHandler } from '@modelcontextprotocol/server';
import { bearerToken } from './auth';
import { buildServer } from './tools';
import type { Env } from './fetch';

/**
 * MCP server over the campaign wiki, one endpoint for every space: read tools
 * for session planning, write tools for post-session reconciliation (all
 * writes go through the same p_token RPCs as the app, so role checks and the
 * revision ledger apply unchanged). Mounted at /mcp (and /mcp/*) by the host
 * repo's wrangler.jsonc (`assets.run_worker_first`); every other path is
 * served straight from the SPA's static assets and never reaches this Worker.
 *
 * The credential is the caller's own space token, presented per request — the
 * deployment holds no invite code, password, or shared secret.
 */
let handler: McpHttpHandler | null = null;

/**
 * Built once per isolate. `env` is fixed for a deployment so it is captured by
 * closure; the per-request part is the token, which arrives as `authInfo`.
 */
function getHandler(env: Env): McpHttpHandler {
  handler ??= createMcpHandler(
    (ctx) => {
      // `fetch` below rejects credential-less requests and is the only caller,
      // so a missing token here is a bug in this file rather than a client
      // error. Throwing beats defaulting: an empty-string token would become a
      // cache key in fetch.ts, shared by every future caller that hit this path.
      const token = ctx.authInfo?.token;
      if (!token) throw new Error('mcp handler built without a token');
      return buildServer(env, token);
    },
    {
      legacy: 'stateless',
      onerror: (error) => console.error('mcp handler error', error),
    },
  );
  return handler;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Defensive: wrangler.jsonc already scopes this Worker to /mcp and /mcp/*,
    // so this only matters if that route is ever widened.
    if (!url.pathname.startsWith('/mcp')) return new Response('Not found', { status: 404 });

    // 404, not 401: a 401 is what makes MCP clients start an OAuth discovery
    // handshake we do not implement, and the SPA answers /.well-known/* with
    // index.html. Validity is judged later, by Postgres, inside the tool call.
    const token = bearerToken(request);
    if (!token) return new Response('Not found', { status: 404 });

    // `authInfo` is strict pass-through — the handler verifies nothing itself
    // and never reads headers. clientId/scopes are required by the type and
    // unused here.
    return getHandler(env).fetch(request, {
      authInfo: { token, clientId: 'ink-stone-mcp', scopes: [] },
    });
  },
};
