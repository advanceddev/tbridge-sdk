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
      let secret = readSessionStorage(STORAGE_KEYS.SESSION_SECRET);
      if (!secret && typeof data.secretKeyHex === 'string' && data.secretKeyHex.length > 0) {
        // Migrate legacy full blob → sessionStorage
        secret = data.secretKeyHex;
        writeSessionStorage(STORAGE_KEYS.SESSION_SECRET, secret);
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
        : null) ?? readSessionStorage(STORAGE_KEYS.SESSION_SECRET);

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
    if (secret) writeSessionStorage(STORAGE_KEYS.SESSION_SECRET, secret);
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
