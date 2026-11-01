/**
 * Abstract storage for session persistence.
 * Default implementation uses localStorage (browser-only).
 *
 * Threat model for AES-GCM at-rest encryption:
 * - Protects against offline reads of localStorage (other process, device backup,
 *   filesystem dump) when the page is not running.
 * - Does NOT protect against same-origin XSS: any script on the origin can call
 *   the same Web Crypto APIs and derive the key. For high-value dApps prefer
 *   `sessionPersistence: 'session'` so secrets die with the tab.
 * - Fallback key material is origin-bound (`${origin}:tbridge:storage:fallback`).
 *   Hosts may set `window.__TBRIDGE_STORAGE_SECRET__` before first storage access
 *   for a stronger secret; it is read once and cached.
 */

import { assertBrowser, TBridgeError } from './errors';
import { bytesToBase64, base64ToBytes } from './encoding';

const ENC_PREFIX = 'enc:v1:';
const IV_LENGTH = 12;
let cachedStorageKey: Promise<CryptoKey> | null = null;

/**
 * Derive the AES-GCM key used for at-rest storage encryption.
 *
 * `window.__TBRIDGE_STORAGE_SECRET__` is read once on first access and cached
 * for the lifetime of the page. Setting the global after the first
 * getItem/setItem has no effect — inject the secret before creating TBridge.
 */
async function getStorageCryptoKey(): Promise<CryptoKey> {
  if (!cachedStorageKey) {
    cachedStorageKey = (async () => {
      const secret =
        typeof (globalThis as { __TBRIDGE_STORAGE_SECRET__?: string })
          .__TBRIDGE_STORAGE_SECRET__ === 'string'
          ? (globalThis as { __TBRIDGE_STORAGE_SECRET__?: string }).__TBRIDGE_STORAGE_SECRET__!
          : `${window.location.origin}:tbridge:storage:fallback`;
      const material = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret));
      return crypto.subtle.importKey('raw', material, 'AES-GCM', false, ['encrypt', 'decrypt']);
    })();
  }
  return cachedStorageKey;
}

async function encryptForStorage(plain: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const key = await getStorageCryptoKey();
  const data = new TextEncoder().encode(plain);
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data);
  const payload = new Uint8Array(iv.length + encrypted.byteLength);
  payload.set(iv, 0);
  payload.set(new Uint8Array(encrypted), iv.length);
  return `${ENC_PREFIX}${bytesToBase64(payload)}`;
}

async function decryptFromStorage(stored: string): Promise<string> {
  if (!stored.startsWith(ENC_PREFIX)) return stored;
  const payload = base64ToBytes(stored.slice(ENC_PREFIX.length));
  if (payload.length <= IV_LENGTH) throw new Error('Invalid encrypted payload');
  const iv = payload.slice(0, IV_LENGTH);
  const ciphertext = payload.slice(IV_LENGTH);
  const key = await getStorageCryptoKey();
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
  return new TextDecoder().decode(decrypted);
}

export interface StorageAdapter {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

/**
 * localStorage-backed adapter.
 * All operations are async to keep the interface uniform
 * (future IndexedDB / secure storage can implement the same contract).
 */
export class LocalStorageAdapter implements StorageAdapter {
  async getItem(key: string): Promise<string | null> {
    assertBrowser();
    try {
      const stored = window.localStorage.getItem(key);
      if (stored === null) return null;
      return await decryptFromStorage(stored);
    } catch (e) {
      throw new TBridgeError('STORAGE_ERROR', 'Failed to read from localStorage', e);
    }
  }

  async setItem(key: string, value: string): Promise<void> {
    assertBrowser();
    try {
      const encrypted = await encryptForStorage(value);
      window.localStorage.setItem(key, encrypted);
    } catch (e) {
      throw new TBridgeError('STORAGE_ERROR', 'Failed to write to localStorage', e);
    }
  }

  async removeItem(key: string): Promise<void> {
    assertBrowser();
    try {
      window.localStorage.removeItem(key);
    } catch (e) {
      throw new TBridgeError('STORAGE_ERROR', 'Failed to remove from localStorage', e);
    }
  }
}

/** In-memory adapter — useful for tests and ephemeral sessions */
export class MemoryStorageAdapter implements StorageAdapter {
  private readonly map = new Map<string, string>();

  async getItem(key: string): Promise<string | null> {
    return this.map.get(key) ?? null;
  }

  async setItem(key: string, value: string): Promise<void> {
    this.map.set(key, value);
  }

  async removeItem(key: string): Promise<void> {
    this.map.delete(key);
  }
}
