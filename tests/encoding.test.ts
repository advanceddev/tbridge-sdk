import { describe, expect, it } from 'vitest';
import {
  bytesToHex,
  hexToBytes,
  isHex64,
  bytesToBase64,
  base64ToBytes,
  utf8ToBytes,
  bytesToUtf8,
  encodeUrlSafeJson,
} from '../core/encoding';

describe('encoding', () => {
  it('hex roundtrip', () => {
    const bytes = new Uint8Array([0, 15, 16, 255]);
    const hex = bytesToHex(bytes);
    expect(hex).toBe('000f10ff');
    expect(Array.from(hexToBytes(hex))).toEqual([0, 15, 16, 255]);
  });

  it('hexToBytes accepts 0x prefix', () => {
    expect(Array.from(hexToBytes('0x0a0b'))).toEqual([10, 11]);
  });

  it('hexToBytes rejects odd length', () => {
    expect(() => hexToBytes('abc')).toThrow();
  });

  it('hexToBytes rejects non-hex', () => {
    expect(() => hexToBytes('zz')).toThrow();
  });

  it('isHex64', () => {
    expect(isHex64('a'.repeat(64))).toBe(true);
    expect(isHex64('A'.repeat(64))).toBe(false);
    expect(isHex64('a'.repeat(63))).toBe(false);
  });

  it('base64 roundtrip', () => {
    const bytes = utf8ToBytes('hello TBridge');
    const b64 = bytesToBase64(bytes);
    expect(bytesToUtf8(base64ToBytes(b64))).toBe('hello TBridge');
  });

  it('encodeUrlSafeJson produces no padding', () => {
    const out = encodeUrlSafeJson({ a: 1 });
    expect(out).not.toMatch(/[+/=]/);
  });
});
