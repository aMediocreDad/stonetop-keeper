import { describe, it, expect } from 'vitest';
import { bearerToken } from '../auth';

function tokenOf(header?: string): string | null {
  const request = new Request(
    'https://example.test/mcp',
    header ? { headers: { authorization: header } } : undefined,
  );
  return bearerToken(request);
}

describe('bearerToken', () => {
  it('extracts a bearer token', () => {
    expect(tokenOf('Bearer abc123')).toBe('abc123');
  });

  it('is case-insensitive on the scheme', () => {
    expect(tokenOf('bearer abc123')).toBe('abc123');
  });

  it('tolerates surrounding whitespace', () => {
    expect(tokenOf('  Bearer   abc123  ')).toBe('abc123');
  });

  it('returns null with no header', () => {
    expect(tokenOf()).toBeNull();
  });

  it('returns null for a non-bearer scheme', () => {
    expect(tokenOf('Basic abc123')).toBeNull();
  });

  it('returns null for a bearer with no token', () => {
    expect(tokenOf('Bearer')).toBeNull();
    expect(tokenOf('Bearer   ')).toBeNull();
  });
});
