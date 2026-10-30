/**
 * Persisted session helpers.
 * Origin-bound + max-age enforced at restore time in connector.
 *
 * Default layout (durable across Mini App / tab close):
 * - StorageAdapter (localStorage by default) holds the full session including
 *   secretKeyHex — required for HTTP bridge restore after process death.
 *
 * Threat model: same-origin XSS can read localStorage. Mitigate with CSP on
 * the host app. sessionStorage-only mode is available via options if a product
 * prefers stricter volatility over UX.
 */

import { PROTOCOL_VERSION, STORAGE_KEYS } from '../core/constants';
import { safeJsonParse } from '../core/security';
import type { StorageAdapter } from '../core/storage';
import type { PersistedSession } from '../core/types';

const SESSION_SECRET_PREFIX = 'enc:v1:';
const SESSION_SECRET_SALT = 'wallet-session-secret-salt';

export type SessionPersistence = 'local' | 'session';

let persistenceMode: SessionPersistence = 'local';

/** Configure where HTTP session secrets live. Default: `local` (survives relaunch). */
export function setSessionPersistence(mode: SessionPersistence): void {
  persistenceMode = mode === 'session' ? 'session' : 'local';
}

export function getSessionPersistence(): SessionPersistence {
  return persistenceMode;
}

function readSessionStorage(key: string): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function getSessionEncryptionPassphrase(): string | null {
  if (typeof window === 'undefined') return null;
  const maybe = (window as typeof window & { __WALLET_SESSION_SECRET__?: unknown })
    .__WALLET_SESSION_SECRET__;
  return typeof maybe === 'string' && maybe.length > 0 ? maybe : null;
}

async function deriveAesKey(passphrase: string): Promise<CryptoKey | null> {
  if (typeof window === 'undefined' || !window.crypto?.subtle) return null;
  const enc = new TextEncoder();
  const baseKey = await window.crypto.subtle.importKey(
    'raw',
    enc.encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return window.crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: enc.encode(SESSION_SECRET_SALT), iterations: 100000, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

async function encryptSecretForStorage(secret: string): Promise<string | null> {
  const passphrase = getSessionEncryptionPassphrase();
  if (!passphrase || typeof window === 'undefined' || !window.crypto?.getRandomValues) return null;
  const key = await deriveAesKey(passphrase);
  if (!key) return null;
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const enc = new TextEncoder();
  const ciphertext = await window.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    enc.encode(secret),
  );
  return `${SESSION_SECRET_PREFIX}${bytesToBase64(iv)}:${bytesToBase64(new Uint8Array(ciphertext))}`;
}

async function decryptSecretFromStorage(payload: string): Promise<string | null> {
  const passphrase = getSessionEncryptionPassphrase();
  if (!passphrase || !payload.startsWith(SESSION_SECRET_PREFIX) || typeof window === 'undefined') {
    return null;
  }
  const body = payload.slice(SESSION_SECRET_PREFIX.length);
  const parts = body.split(':');
  if (parts.length !== 2) return null;
  const iv = base64ToBytes(parts[0]);
  const data = base64ToBytes(parts[1]);
  const key = await deriveAesKey(passphrase);
  if (!key) return null;
  const plain = await window.crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data);
  return new TextDecoder().decode(plain);
}

async function readEncryptedSessionSecret(key: string): Promise<string | null> {
  const stored = readSessionStorage(key);
  if (!stored) return null;
  try {
    return await decryptSecretFromStorage(stored);
  } catch {
    removeSessionStorage(key);
    return null;
  }
}

async function writeEncryptedSessionSecret(key: string, value: string): Promise<void> {
  try {
    const encrypted = await encryptSecretForStorage(value);
    if (encrypted) writeSessionStorage(key, encrypted);
  } catch {
    /* ignore */
  }
}

function writeSessionStorage(key: string, value: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(key, value);
  } catch {
    /* private mode / quota */
  }
}

function removeSessionStorage(key: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

function stripSecret(session: PersistedSession): PersistedSession {
  const { secretKeyHex: _s, ...rest } = session;
  return rest;
}

export async function loadPersistedSession(
  storage: StorageAdapter,
): Promise<PersistedSession | null> {
  try {
    const raw = await storage.getItem(STORAGE_KEYS.SESSION);
    if (!raw) return null;
    const data = safeJsonParse<PersistedSession>(raw, 'session');
    if (data.version !== PROTOCOL_VERSION) return null;
    if (!data.account?.address || !data.walletAppName) return null;

    if (persistenceMode === 'session') {
      // Volatile: secret only from sessionStorage
      let secret = await readEncryptedSessionSecret(STORAGE_KEYS.SESSION_SECRET);
      if (!secret && typeof data.secretKeyHex === 'string' && data.secretKeyHex.length > 0) {
        // Migrate legacy full blob → sessionStorage
        secret = data.secretKeyHex;
        await writeEncryptedSessionSecret(STORAGE_KEYS.SESSION_SECRET, secret);
        try {
          await storage.setItem(STORAGE_KEYS.SESSION, JSON.stringify(stripSecret(data)));
        } catch {
          /* ignore */
        }
      }
      if (secret) return { ...stripSecret(data), secretKeyHex: secret };
      return stripSecret(data);
    }

    // Durable (default): secret lives in the adapter blob (localStorage)
    const secret =
      (typeof data.secretKeyHex === 'string' && data.secretKeyHex.length > 0
        ? data.secretKeyHex
        : null) ?? (await readEncryptedSessionSecret(STORAGE_KEYS.SESSION_SECRET));

    // Promote sessionStorage secret into local blob once (upgrade path)
    if (
      secret &&
      (!data.secretKeyHex || data.secretKeyHex.length === 0) &&
      persistenceMode === 'local'
    ) {
      const merged = { ...data, secretKeyHex: secret };
      try {
        await storage.setItem(STORAGE_KEYS.SESSION, JSON.stringify(merged));
      } catch {
        /* ignore */
      }
      return merged;
    }

    if (secret) return { ...data, secretKeyHex: secret };
    return data;
  } catch {
    return null;
  }
}

export async function savePersistedSession(
  storage: StorageAdapter,
  session: PersistedSession,
): Promise<void> {
  const secret = session.secretKeyHex;

  if (persistenceMode === 'session') {
    if (secret) await writeEncryptedSessionSecret(STORAGE_KEYS.SESSION_SECRET, secret);
    else removeSessionStorage(STORAGE_KEYS.SESSION_SECRET);
    await storage.setItem(STORAGE_KEYS.SESSION, JSON.stringify(stripSecret(session)));
    return;
  }

  // local (default): persist full session including secret
  await storage.setItem(STORAGE_KEYS.SESSION, JSON.stringify(session));
  // Clear any leftover tab-scoped copy to avoid split-brain
  removeSessionStorage(STORAGE_KEYS.SESSION_SECRET);
}

export async function clearPersistedSession(storage: StorageAdapter): Promise<void> {
  await storage.removeItem(STORAGE_KEYS.SESSION);
  removeSessionStorage(STORAGE_KEYS.SESSION_SECRET);
  await storage.removeItem(STORAGE_KEYS.LAST_WALLET);
}

export async function saveLastWallet(storage: StorageAdapter, appName: string): Promise<void> {
  await storage.setItem(STORAGE_KEYS.LAST_WALLET, appName);
}

export async function loadLastWallet(storage: StorageAdapter): Promise<string | null> {
  return storage.getItem(STORAGE_KEYS.LAST_WALLET);
}
