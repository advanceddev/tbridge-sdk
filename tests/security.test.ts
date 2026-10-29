import { describe, expect, it } from 'vitest';
import {
  safeJsonParse,
  assertSafeManifestUrl,
  RateLimiter,
  isSafeImageUrl,
} from '../core/security';
import { TBridgeError } from '../core/errors';

describe('safeJsonParse', () => {
  it('parses normal JSON', () => {
    expect(safeJsonParse<{ a: number }>('{"a":1}')).toEqual({ a: 1 });
  });

  it('strips __proto__ pollution', () => {
    const raw = '{"ok":true,"__proto__":{"polluted":true}}';
    const parsed = safeJsonParse<Record<string, unknown>>(raw);
    expect(parsed.ok).toBe(true);
    expect(Object.prototype.hasOwnProperty.call(parsed, '__proto__')).toBe(false);
    expect(({} as { polluted?: boolean }).polluted).toBeUndefined();
  });

  it('throws on invalid JSON', () => {
    expect(() => safeJsonParse('{')).toThrow(TBridgeError);
  });
});

describe('assertSafeManifestUrl', () => {
  it('allows https', () => {
    expect(() => assertSafeManifestUrl('https://app.example/manifest.json')).not.toThrow();
  });

  it('allows http on localhost', () => {
    expect(() => assertSafeManifestUrl('http://localhost:5173/manifest.json')).not.toThrow();
  });

  it('rejects http on public host', () => {
    expect(() => assertSafeManifestUrl('http://example.com/manifest.json')).toThrow(TBridgeError);
  });

  it('rejects non-http schemes', () => {
    expect(() => assertSafeManifestUrl('javascript:alert(1)')).toThrow(TBridgeError);
  });
});

describe('RateLimiter', () => {
  it('allows up to capacity then blocks', () => {
    const rl = new RateLimiter(3, 0);
    expect(rl.tryRemove()).toBe(true);
    expect(rl.tryRemove()).toBe(true);
    expect(rl.tryRemove()).toBe(true);
    expect(rl.tryRemove()).toBe(false);
  });
});

describe('isSafeImageUrl', () => {
  it('accepts https', () => {
    expect(isSafeImageUrl('https://cdn.example/a.png')).toBe(true);
  });

  it('rejects javascript:', () => {
    expect(isSafeImageUrl('javascript:alert(1)')).toBe(false);
  });

  it('rejects remote http', () => {
    expect(isSafeImageUrl('http://cdn.example/a.png')).toBe(false);
  });

  it('allows localhost http', () => {
    expect(isSafeImageUrl('http://localhost:5173/icon.png')).toBe(true);
  });
});
