import { InvalidTokenError } from './fetch';

export type ToolResult = { content: { type: 'text'; text: string }[]; isError?: boolean };

export function text(body: string): ToolResult {
  return { content: [{ type: 'text' as const, text: body }] };
}

export function fail(body: string): ToolResult {
  return { content: [{ type: 'text' as const, text: body }], isError: true };
}

/** What the caller actually reads when their token has stopped working. */
export const TOKEN_HELP =
  'This campaign link is no longer valid. Open Ink & Stone, sign in to the space, and copy a fresh "Connect to Claude" command from the grimoire menu.';

/**
 * Turns a token Postgres refused into a readable tool error. It cannot be an
 * HTTP status: the token is first judged on an RPC, which happens inside a
 * tool call, long after `initialize` and `tools/list` were answered.
 *
 * Only this one error is caught. `McpServer`'s own `tools/call` handler already
 * converts any thrown error into an `isError` result, so every other failure
 * (a timeout, an unexpected RPC) reaches the client as a tool error without
 * help from us — re-throwing keeps its message intact. This wrapper exists
 * solely to replace a bare `INVALID_TOKEN` with something actionable.
 */
export function guard<A>(
  handler: (args: A) => Promise<ToolResult>,
): (args: A) => Promise<ToolResult> {
  return async (args) => {
    try {
      return await handler(args);
    } catch (error) {
      if (error instanceof InvalidTokenError) return fail(TOKEN_HELP);
      throw error;
    }
  };
}
