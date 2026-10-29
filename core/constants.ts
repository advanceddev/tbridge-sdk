/**
 * TBridge constants — versioned & namespaced.
 * Never change storage key prefix without migration path.
 */

export const TBRIDGE_VERSION = '0.3.0' as const;

/** Wire protocol version spoken with wallets */
export const PROTOCOL_VERSION = 2 as const;

/** Default wallets registry URL (official TON list) */
export const DEFAULT_WALLETS_REGISTRY_URL = 'https://config.ton.org/wallets-v2.json' as const;

/** @deprecated Use DEFAULT_WALLETS_REGISTRY_URL */
export const DEFAULT_WALLETS_LIST_URL = DEFAULT_WALLETS_REGISTRY_URL;

/** Storage namespace — all keys start with this */
export const STORAGE_PREFIX = 'tbridge:v1:' as const;

export const STORAGE_KEYS = {
  /** Public session metadata (localStorage) — no secret key */
  SESSION: `${STORAGE_PREFIX}session`,
  /**
   * HTTP session secret key hex — sessionStorage only (tab-scoped).
   * Never write this to localStorage.
   */
  SESSION_SECRET: `${STORAGE_PREFIX}session-secret`,
  LAST_WALLET: `${STORAGE_PREFIX}last-wallet`,
  WALLETS_CACHE: `${STORAGE_PREFIX}wallets-cache`,
} as const;

/** Default request timeout (ms) */
export const DEFAULT_REQUEST_TIMEOUT_MS = 5 * 60 * 1000; // 5 min

/** SSE reconnect base backoff (ms); actual uses exponential with jitter */
export const SSE_RECONNECT_MS = 1_500;

/** Max SSE reconnect attempts before hard-stop (no further reconnect) */
export const SSE_MAX_RECONNECT_ATTEMPTS = 12;

/**
 * Soft wait for initial SSE open before proceeding with connect UI.
 * Does not abort the stream — only unblocks onConnectLink / parallel flow.
 */
export const SSE_CONNECT_SOFT_TIMEOUT_MS = 2_500;

/** Max age of a persisted HTTP session (7 days) */
export const SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/** Max messages we accept in SendTransaction */
export const MAX_MESSAGES_HARD_LIMIT = 255;

/** Outbound RPC rate limit: capacity & refill/sec */
export const RPC_RATE_CAPACITY = 8;
export const RPC_RATE_REFILL_PER_SEC = 2;

/** Bridge message TTL (seconds) — protocol minimum support is 300 */
export const BRIDGE_MESSAGE_TTL_SEC = 300;
