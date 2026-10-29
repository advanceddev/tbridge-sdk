/**
 * Persisted session helpers.
 * Origin-bound + max-age enforced at restore time in connector.
 *
 * Storage layout (security):
 * - localStorage SESSION: public metadata only (no secretKeyHex)
 * - sessionStorage SESSION_SECRET: HTTP session secret (tab-scoped)
 *
 * Same-tab reload → restore works.
 * New tab / browser restart → secret absent → HTTP restore skipped (safe).
 * Custom StorageAdapter still holds public metadata; secret always uses
 * sessionStorage when available (never written to adapter / localStorage).
 */

import { PROTOCOL_VERSION, STORAGE_KEYS } from '../core/constants';
import { safeJsonParse } from '../core/security';
import type { StorageAdapter } from '../core/storage';
import type { PersistedSession } from '../core/types';

function readSessionStorage(key: string): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeSessionStorage(key: string, value: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(key, value);
  } catch {}
}

function removeSessionStorage(key: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(key);
  } catch {}
}

/** Public fields only — strip secret before localStorage */
function publicSession(session: PersistedSession): PersistedSession {
  const { secretKeyHex: _secret, ...rest } = session;
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

    let secret = readSessionStorage(STORAGE_KEYS.SESSION_SECRET);

    if (!secret && typeof data.secretKeyHex === 'string' && data.secretKeyHex.length > 0) {
      secret = data.secretKeyHex;
      writeSessionStorage(STORAGE_KEYS.SESSION_SECRET, secret);

      try {
        await storage.setItem(STORAGE_KEYS.SESSION, JSON.stringify(publicSession(data)));
      } catch {}
    }

    if (secret) {
      return { ...publicSession(data), secretKeyHex: secret };
    }

    // Metadata without secret — HTTP restore impossible; return null for HTTP path
    // Caller checks secretKeyHex. Returning data without secret would break restore
    // guards; keep null when secret is required by callers.
    return { ...publicSession(data) };
  } catch {
    return null;
  }
}

export async function savePersistedSession(
  storage: StorageAdapter,
  session: PersistedSession,
): Promise<void> {
  const secret = session.secretKeyHex;
  if (secret) {
    writeSessionStorage(STORAGE_KEYS.SESSION_SECRET, secret);
  } else {
    removeSessionStorage(STORAGE_KEYS.SESSION_SECRET);
  }
  await storage.setItem(STORAGE_KEYS.SESSION, JSON.stringify(publicSession(session)));
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
