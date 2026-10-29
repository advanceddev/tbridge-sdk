/**
 * Encoding helpers — pure TypeScript, zero deps.
 * Used for client_id (hex), bridge payloads (base64), deep-link params.
 */

const HEX = '0123456789abcdef';

export function bytesToHex(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i]!;
    out += HEX[(b >>> 4) & 0xf]! + HEX[b & 0xf]!;
  }
  return out;
}

export function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith('0x') || hex.startsWith('0X') ? hex.slice(2) : hex;
  if (clean.length % 2 !== 0) {
    throw new Error('hex string must have even length');
  }
  if (!/^[0-9a-fA-F]*$/.test(clean)) {
    throw new Error('invalid hex string');
  }
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

export function isHex64(value: string): boolean {
  return typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
}

/** Standard base64 (not URL-safe) — used for bridge message bodies */
export function bytesToBase64(bytes: Uint8Array): string {
  if (typeof btoa === 'function') {
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]!);
    }
    return btoa(binary);
  }
  // Fallback for environments without btoa
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let result = '';
  let i = 0;
  while (i < bytes.length) {
    const a = bytes[i++]!;
    const b = i < bytes.length ? bytes[i++]! : 0;
    const c = i < bytes.length ? bytes[i++]! : 0;
    const triplet = (a << 16) | (b << 8) | c;
    result += chars[(triplet >> 18) & 63]!;
    result += chars[(triplet >> 12) & 63]!;
    result += i > bytes.length + 1 ? '=' : chars[(triplet >> 6) & 63]!;
    result += i > bytes.length ? '=' : chars[triplet & 63]!;
  }
  return result;
}

export function base64ToBytes(b64: string): Uint8Array {
  if (typeof atob === 'function') {
    const binary = atob(b64);
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      out[i] = binary.charCodeAt(i);
    }
    return out;
  }
  throw new Error('atob is not available');
}

/** URL-safe base64 without padding — for deep-link `r` and `e` params */
export function bytesToBase64Url(bytes: Uint8Array): string {
  return bytesToBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function utf8ToBytes(str: string): Uint8Array {
  return new TextEncoder().encode(str);
}

export function bytesToUtf8(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

/** URL-safe JSON string for deep-link `r` parameter */
export function encodeUrlSafeJson(value: unknown): string {
  const json = JSON.stringify(value);
  return bytesToBase64Url(utf8ToBytes(json));
}
