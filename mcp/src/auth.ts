/**
 * Access control for the MCP endpoint: the caller presents the space token the
 * app issued them, and that token is both the credential and the space
 * selector (`app_space_from_token` resolves it to a space and a role).
 *
 * This layer can only check the header's *shape*. Only Postgres can judge a
 * token, and it is first asked on a read RPC — inside a tool call, well after
 * `initialize` and `tools/list` have been answered. See the spec's §2.
 */

/** The bearer token from an Authorization header, or null if absent/malformed. */
export function bearerToken(request: Request): string | null {
  const header = request.headers.get('authorization') ?? '';
  const match = /^bearer\s+(\S+)$/i.exec(header.trim());
  return match ? match[1] : null;
}
