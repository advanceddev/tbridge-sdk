/**
 * HTTP / SSE Bridge transport.
 *
 * - Shared session factory for connect + restore (no duplicated SSE logic)
 * - Exponential backoff + jitter on reconnect
 * - bridgeHealth callbacks
 * - Wallet disconnect event detection
 * - AbortController + full listener teardown (no leaks)
 * - Safe JSON parse for envelopes
 */

import {
  BRIDGE_MESSAGE_TTL_SEC,
  SSE_MAX_RECONNECT_ATTEMPTS,
  SSE_CONNECT_SOFT_TIMEOUT_MS,
  SSE_RECONNECT_MS,
} from '../core/constants';
import { SessionCrypto } from '../core/crypto';
import { TBridgeError } from '../core/errors';
import { resolveReturnStrategy } from '../utils/open-wallet-link';
import { detectRuntimeEnv } from '../utils/runtime-env';
import { safeJsonParse } from '../core/security';
import type {
  AppRequest,
  BridgeHealth,
  ConnectEvent,
  ConnectRequest,
  WalletResponse,
} from '../core/types';
import { isConnectEvent, isWalletResponse, mapWalletError } from '../utils/validation';

export interface HttpBridgeSession {
  readonly kind: 'http';
  readonly bridgeUrl: string;
  readonly appName: string;
  readonly clientId: string;
  readonly walletClientId: string;
  send(request: AppRequest): Promise<WalletResponse>;
  disconnect(): Promise<void>;
  destroy(): void;
}

export interface HttpSessionHooks {
  onHealth?: (health: BridgeHealth) => void;
  onWalletDisconnect?: () => void;
}

interface PendingRequest {
  resolve: (value: WalletResponse) => void;
  reject: (reason: unknown) => void;
  timer: ReturnType<typeof setTimeout>;
}

function normalizeBridgeUrl(url: string): string {
  // Strip trailing '/' without regex (avoids ReDoS lints on long slash runs).
  let end = url.length;
  while (end > 0 && url.charCodeAt(end - 1) === 47 /* '/' */) {
    end -= 1;
  }
  return end === url.length ? url : url.slice(0, end);
}

/**
 * Correlation id for bridge analytics / wallet routing.
 * Spec: optional `trace_id=<uuid>` on GET /events and POST /message.
 * Some bridges (e.g. Telegram) effectively expect it on RPC posts.
 */
/**
 * UUID v7 (time-ordered) for `trace_id`.
 * Spec allows any uuid; Telegram bridge analytics expect this shape in practice.
 */
function createTraceId(): string {
  const bytes = new Uint8Array(16);
  if (typeof globalThis.crypto?.getRandomValues === 'function') {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 16; i++) bytes[i] = (Math.random() * 256) | 0;
  }
  // 48-bit unix timestamp in ms
  const ts = Date.now();
  bytes[0] = (ts / 2 ** 40) & 0xff;
  bytes[1] = (ts / 2 ** 32) & 0xff;
  bytes[2] = (ts / 2 ** 24) & 0xff;
  bytes[3] = (ts / 2 ** 16) & 0xff;
  bytes[4] = (ts / 2 ** 8) & 0xff;
  bytes[5] = ts & 0xff;
  // version 7
  bytes[6] = (bytes[6]! & 0x0f) | 0x70;
  // RFC 4122 variant
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  let hex = '';
  for (let i = 0; i < 16; i++) {
    hex += bytes[i]!.toString(16).padStart(2, '0');
  }
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function eventsUrl(
  bridgeUrl: string,
  clientId: string,
  lastEventId?: string,
  traceId?: string,
): string {
  const base = `${normalizeBridgeUrl(bridgeUrl)}/events`;
  const params = new URLSearchParams({ client_id: clientId });
  if (lastEventId) params.set('last_event_id', lastEventId);
  if (traceId) params.set('trace_id', traceId);
  return `${base}?${params.toString()}`;
}

function messageUrl(
  bridgeUrl: string,
  from: string,
  to: string,
  ttl: number,
  topic?: string,
  traceId?: string,
): string {
  const base = `${normalizeBridgeUrl(bridgeUrl)}/message`;
  const params = new URLSearchParams({
    client_id: from.toLowerCase(),
    to: to.toLowerCase(),
    ttl: String(ttl),
  });
  if (topic) params.set('topic', topic);
  params.set('trace_id', traceId ?? createTraceId());
  return `${base}?${params.toString()}`;
}

function backoffMs(attempt: number): number {
  const exp = Math.min(SSE_RECONNECT_MS * 2 ** attempt, 30_000);
  const jitter = Math.floor(Math.random() * 400);
  return exp + jitter;
}

/**
 * Detect if running inside Telegram WebApp (Mini App)
 */
/**
 * Build wallet connect universal / deep link.
 * Wire format used by wallet apps: `r` is URL-encoded ConnectRequest JSON
 * (wallets decodeURIComponent + JSON.parse — not base64).
 * Launch path (TMA bridge vs browser) is handled by open-wallet-link.
 */
export function buildConnectLink(params: {
  universalUrl?: string;
  deepLink?: string;
  clientId: string;
  connectRequest: ConnectRequest;
  ret?: string;
}): string {
  const base = params.universalUrl || params.deepLink || 'tc://';
  const r = encodeURIComponent(JSON.stringify(params.connectRequest));
  const sep = base.includes('?') ? '&' : '?';
  let link = `${base}${sep}v=2&id=${params.clientId}&r=${r}`;
  if (params.ret) {
    link += `&ret=${encodeURIComponent(params.ret)}`;
  }
  return link;
}

interface LiveHttpChannel {
  session: HttpBridgeSession;
  /** Resolves when the initial SSE connection is open */
  sseReady: Promise<void>;
  /** For first-time connect: wait for ConnectEvent */
  waitConnectEvent: (timeoutMs: number) => Promise<ConnectEvent>;
}

/**
 * Open encrypted HTTP channel (SSE + send).
 * Used by both first connect and restore.
 */
function openHttpChannel(params: {
  bridgeUrl: string;
  appName: string;
  sessionCrypto: SessionCrypto;
  walletClientId: string | null;
  timeoutMs: number;
  hooks?: HttpSessionHooks;
}): LiveHttpChannel {
  const crypto = params.sessionCrypto;
  const clientId = crypto.clientId;
  const bridgeUrl = params.bridgeUrl;
  const abort = new AbortController();
  const pending = new Map<string, PendingRequest>();
  let walletClientId = params.walletClientId;
  let lastEventId: string | undefined;
  let eventSource: EventSource | null = null;
  let destroyed = false;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let reconnectAttempt = 0;
  const connectWaiters: Array<(ev: ConnectEvent) => void> = [];

  const setHealth = (h: BridgeHealth) => {
    params.hooks?.onHealth?.(h);
  };

  let onOpen: ((ev: Event) => void) | null = null;
  let onMessage: ((ev: MessageEvent) => void) | null = null;
  let onError: ((ev: Event) => void) | null = null;

  const cleanupEs = () => {
    if (eventSource) {
      if (onOpen) eventSource.removeEventListener('open', onOpen);
      if (onMessage) eventSource.removeEventListener('message', onMessage as EventListener);
      if (onError) eventSource.removeEventListener('error', onError);
      eventSource.close();
      eventSource = null;
    }
    onOpen = null;
    onMessage = null;
    onError = null;
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  };

  function handlePlaintext(plaintext: string, from: string): void {
    let msg: unknown;
    try {
      msg = safeJsonParse(plaintext, 'bridge message');
    } catch {
      return;
    }

    if (isConnectEvent(msg)) {
      if (msg.event === 'connect') {
        walletClientId = from.toLowerCase();
      }
      for (const w of connectWaiters.splice(0)) {
        w(msg);
      }
      return;
    }

    // Wallet-initiated disconnect event
    if (msg && typeof msg === 'object' && (msg as { event?: string }).event === 'disconnect') {
      params.hooks?.onWalletDisconnect?.();
      return;
    }

    if (isWalletResponse(msg)) {
      const rid = String((msg as { id: string | number }).id);
      const p = pending.get(rid);
      if (p) {
        clearTimeout(p.timer);
        pending.delete(rid);
        p.resolve({ ...msg, id: rid } as WalletResponse);
      }
    }
  }

  const openSse = (): Promise<void> =>
    new Promise((resolve, reject) => {
      if (destroyed) {
        reject(new TBridgeError('NOT_CONNECTED', 'Session destroyed'));
        return;
      }
      cleanupEs();
      const url = eventsUrl(bridgeUrl, clientId, lastEventId, createTraceId());
      try {
        eventSource = new EventSource(url);
      } catch (e) {
        reject(new TBridgeError('HTTP_BRIDGE_ERROR', 'Failed to open EventSource', e));
        return;
      }

      let opened = false;

      onOpen = () => {
        opened = true;
        reconnectAttempt = 0;
        setHealth('connected');
        resolve();
      };

      onMessage = (ev: MessageEvent) => {
        if (destroyed) return;
        if (ev.lastEventId) lastEventId = ev.lastEventId;
        const data = typeof ev.data === 'string' ? ev.data : '';
        if (!data || data === 'heartbeat') return;

        let envelope: { from?: string; message?: string };
        try {
          envelope = safeJsonParse(data, 'SSE envelope');
        } catch {
          return;
        }
        if (!envelope.from || !envelope.message) return;

        let plaintext: string;
        try {
          plaintext = crypto.decrypt(envelope.message, envelope.from);
        } catch {
          return; // auth failure — discard
        }
        handlePlaintext(plaintext, envelope.from);
      };

      onError = () => {
        if (destroyed) return;
        if (!opened) {
          cleanupEs();
          reject(new TBridgeError('HTTP_BRIDGE_ERROR', 'SSE connection failed'));
          return;
        }
        setHealth('reconnecting');
        cleanupEs();
        if (reconnectAttempt >= SSE_MAX_RECONNECT_ATTEMPTS) {
          // Hard-stop: no further reconnects, fail pending RPCs
          setHealth('offline');
          for (const [, p] of pending) {
            clearTimeout(p.timer);
            p.reject(
              new TBridgeError('HTTP_BRIDGE_ERROR', 'Bridge offline after max reconnect attempts'),
            );
          }
          pending.clear();
          return;
        }
        const delay = backoffMs(reconnectAttempt++);
        reconnectTimer = setTimeout(() => {
          openSse().catch(() => {
            setHealth('offline');
          });
        }, delay);
      };

      eventSource.addEventListener('open', onOpen);
      eventSource.addEventListener('message', onMessage as EventListener);
      eventSource.addEventListener('error', onError);
    });

  const waitConnectEvent = (timeoutMs: number): Promise<ConnectEvent> =>
    new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const idx = connectWaiters.indexOf(onEvent);
        if (idx >= 0) connectWaiters.splice(idx, 1);
        reject(new TBridgeError('TIMEOUT', 'Wallet did not respond in time'));
      }, timeoutMs);

      const onEvent = (ev: ConnectEvent) => {
        clearTimeout(timer);
        resolve(ev);
      };
      connectWaiters.push(onEvent);
    });

  // Start SSE immediately (caller awaits openSse via connect/restore)
  const sseReady = openSse();

  const session: HttpBridgeSession = {
    kind: 'http',
    bridgeUrl,
    appName: params.appName,
    clientId,
    get walletClientId() {
      return walletClientId ?? '';
    },
    async send(request: AppRequest): Promise<WalletResponse> {
      await sseReady;
      if (destroyed || !walletClientId) {
        throw new TBridgeError('NOT_CONNECTED', 'HTTP session not ready');
      }
      const body = crypto.encrypt(JSON.stringify(request), walletClientId);
      const topic =
        request.method === 'sendTransaction' ||
        request.method === 'disconnect' ||
        request.method === 'signData'
          ? request.method
          : undefined;

      const url = messageUrl(bridgeUrl, clientId, walletClientId, BRIDGE_MESSAGE_TTL_SEC, topic);

      const responsePromise = new Promise<WalletResponse>((resolve, reject) => {
        const timer = setTimeout(() => {
          pending.delete(request.id);
          reject(new TBridgeError('TIMEOUT', `Request ${request.id} timed out`));
        }, params.timeoutMs);
        pending.set(request.id, { resolve, reject, timer });
      });

      try {
        // Body: base64(nonce||ciphertext). No Content-Type — matches bridge clients
        // that POST a bare string body (wallets / Telegram bridge).
        const res = await fetch(url, {
          method: 'POST',
          body,
          signal: abort.signal,
          credentials: 'omit',
          cache: 'no-store',
        });
        if (!res.ok) {
          pending.delete(request.id);
          throw new TBridgeError('HTTP_BRIDGE_ERROR', `Bridge POST failed: HTTP ${res.status}`);
        }
      } catch (e) {
        const p = pending.get(request.id);
        if (p) {
          clearTimeout(p.timer);
          pending.delete(request.id);
        }
        if (TBridgeError.is(e)) throw e;
        throw new TBridgeError('HTTP_BRIDGE_ERROR', 'Failed to post message', e);
      }

      return responsePromise;
    },
    async disconnect(): Promise<void> {
      if (destroyed || !walletClientId) {
        session.destroy();
        return;
      }
      try {
        await session.send({
          method: 'disconnect',
          params: [],
          id: String(Date.now()),
        });
      } catch {
        /* best-effort */
      }
      session.destroy();
    },
    destroy(): void {
      if (destroyed) return;
      destroyed = true;
      abort.abort();
      cleanupEs();
      for (const [, p] of pending) {
        clearTimeout(p.timer);
        p.reject(new TBridgeError('NOT_CONNECTED', 'Session destroyed'));
      }
      pending.clear();
      connectWaiters.length = 0;
      crypto.dispose();
      setHealth('offline');
    },
  };

  return {
    session,
    sseReady,
    waitConnectEvent,
  };
}

export async function connectHttpBridge(params: {
  bridgeUrl: string;
  appName: string;
  universalUrl?: string;
  deepLink?: string;
  connectRequest: ConnectRequest;
  timeoutMs: number;
  sessionCrypto: SessionCrypto;
  onConnectLink: (link: string) => void;
  hooks?: HttpSessionHooks;
  /** Called once the SSE channel is live (for cancel / teardown) */
  onChannel?: (session: HttpBridgeSession) => void;
}): Promise<{ event: ConnectEvent; session: HttpBridgeSession }> {
  const channel = openHttpChannel({
    bridgeUrl: params.bridgeUrl,
    appName: params.appName,
    sessionCrypto: params.sessionCrypto,
    walletClientId: null,
    timeoutMs: params.timeoutMs,
    hooks: params.hooks,
  });

  params.onChannel?.(channel.session);

  // Build + surface the connect link immediately so the UI can open the wallet
  // without waiting for SSE. EventSource still connects in parallel; the wallet
  // only replies after the user confirms, which is usually after SSE is up.
  const link = buildConnectLink({
    universalUrl: params.universalUrl,
    deepLink: params.deepLink,
    clientId: params.sessionCrypto.clientId,
    connectRequest: params.connectRequest,
    ret: resolveReturnStrategy(detectRuntimeEnv()),
  });
  params.onConnectLink(link);

  // Soft-wait for SSE: do not block the link forever if the bridge is slow.
  // waitConnectEvent still requires a live stream to receive the response.
  await Promise.race([
    channel.sseReady,
    new Promise<void>((resolve) => {
      window.setTimeout(resolve, SSE_CONNECT_SOFT_TIMEOUT_MS);
    }),
  ]);

  const event = await channel.waitConnectEvent(params.timeoutMs);

  if (event.event === 'connect_error') {
    channel.session.destroy();
    throw mapWalletError(event.payload.code, event.payload.message);
  }

  if (!channel.session.walletClientId) {
    channel.session.destroy();
    throw new TBridgeError('PROTOCOL_ERROR', 'Missing wallet client_id after connect');
  }

  return { event, session: channel.session };
}

/**
 * Restore a previously persisted HTTP session.
 * Re-opens SSE with the same client_id keys. Does not re-prompt the wallet.
 * Live send works only if the wallet still has the matching session.
 */
export async function restoreHttpBridge(params: {
  bridgeUrl: string;
  appName: string;
  walletClientId: string;
  sessionCrypto: SessionCrypto;
  timeoutMs: number;
  hooks?: HttpSessionHooks;
}): Promise<HttpBridgeSession> {
  const channel = openHttpChannel({
    bridgeUrl: params.bridgeUrl,
    appName: params.appName,
    sessionCrypto: params.sessionCrypto,
    walletClientId: params.walletClientId,
    timeoutMs: params.timeoutMs,
    hooks: params.hooks,
  });

  await channel.sseReady;
  return channel.session;
}
