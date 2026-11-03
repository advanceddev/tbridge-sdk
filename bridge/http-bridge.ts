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
import {
  createEventIdGate,
  isConnectEvent,
  isWalletResponse,
  mapWalletError,
} from '../utils/validation';

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
 * UUID v7 (time-ordered) for `trace_id`.
 * Spec allows any uuid; Telegram bridge analytics expect this shape in practice.
 *
 * Unlike SessionCrypto (which fails hard without Web Crypto), trace ids are
 * non-security correlation tokens — Math.random fallback is acceptable when
 * crypto.getRandomValues is unavailable. Prefer Web Crypto when present.
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
/** Wallet hosted in Telegram (Mini App / bot): t.me link or tg: scheme. */
export function isTelegramLink(href: string): boolean {
  try {
    const u = new URL(href);
    return u.protocol === 'tg:' || u.hostname === 't.me' || u.hostname.endsWith('.t.me');
  } catch {
    return false;
  }
}

/** Telegram allows only [A-Za-z0-9_-] in startapp: percent-encode !'()*~ too. */
function encodeParam(value: string): string {
  return encodeURIComponent(value).replace(
    /[!'()*~]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

/**
 * Telegram passes a Mini App nothing but `startapp` (<= 512 chars, [A-Za-z0-9_-]);
 * other query params are dropped by some clients (Telegram Desktop on Windows: the
 * connect never shows). Pack the whole query into it — same wire as @tonconnect/sdk
 * (generateTGUniversalLink / encodeTelegramUrlParameters), which wallets decode.
 */
function telegramStartAppLink(base: string, query: string): string {
  const startapp =
    'tonconnect-' +
    query
      .replaceAll('.', '%2E')
      .replaceAll('-', '%2D')
      .replaceAll('_', '%5F')
      .replaceAll('&', '-')
      .replaceAll('=', '__')
      .replaceAll('%', '--');
  const url = new URL(base);
  if (url.searchParams.has('attach')) {
    // legacy attach-menu link → direct Mini App link
    url.searchParams.delete('attach');
    url.pathname += '/start';
  }
  url.searchParams.append('startapp', startapp);
  return url.toString();
}

/**
 * Build wallet connect universal / deep link (deeplinks.md).
 * `r` is the URL-encoded ConnectRequest JSON. Telegram-hosted wallets get the
 * startapp form; launch path (TMA bridge vs browser) is handled by open-wallet-link.
 */
export function buildConnectLink(params: {
  universalUrl?: string;
  deepLink?: string;
  clientId: string;
  connectRequest: ConnectRequest;
  ret?: string;
}): string {
  const base = params.universalUrl || params.deepLink || 'tc://';
  const telegram = isTelegramLink(base);
  const query: Array<[string, string]> = [
    ['v', '2'],
    ['id', params.clientId],
    ['r', JSON.stringify(params.connectRequest)],
  ];
  // Telegram: the return target is Telegram itself; same as @tonconnect/sdk, no ret.
  if (params.ret && !telegram) query.push(['ret', params.ret]);
  const qs = query.map(([k, v]) => `${k}=${encodeParam(v)}`).join('&');
  if (telegram) return telegramStartAppLink(base, qs);
  return `${base}${base.includes('?') ? '&' : '?'}${qs}`;
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
  /** Last processed wallet event id (persisted) — baseline for rpc.md:56 ordering */
  lastWalletEventId?: number | null;
  timeoutMs: number;
  hooks?: HttpSessionHooks;
}): LiveHttpChannel {
  const crypto = params.sessionCrypto;
  const clientId = crypto.clientId;
  const bridgeUrl = params.bridgeUrl;
  const abort = new AbortController();
  const pending = new Map<string, PendingRequest>();
  let walletClientId = params.walletClientId;
  const acceptEventId = createEventIdGate(params.lastWalletEventId ?? null);
  let lastEventId: string | undefined;
  let eventSource: EventSource | null = null;
  let destroyed = false;
  /** True after hard-stop (max SSE reconnects). Blocks further send() from hanging. */
  let channelDead = false;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let reconnectAttempt = 0;
  /** Some stream (initial or a retry) has opened at least once. */
  let everOpened = false;
  const connectWaiters: Array<{
    resolve: (ev: ConnectEvent) => void;
    reject: (err: unknown) => void;
    timer: ReturnType<typeof setTimeout>;
  }> = [];

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
    const sender = from.toLowerCase();
    // Our client_id is public (QR / link / bridge URLs): anyone can encrypt to it.
    // Once paired, only the wallet's key may talk to us.
    if (walletClientId && sender !== walletClientId) return;

    let msg: unknown;
    try {
      msg = safeJsonParse(plaintext, 'bridge message');
    } catch {
      return;
    }
    if (
      msg &&
      typeof msg === 'object' &&
      'event' in msg &&
      !acceptEventId((msg as { id?: unknown }).id)
    ) {
      return; // stale / replayed wallet event (rpc.md:56)
    }

    if (isConnectEvent(msg)) {
      if (msg.event === 'connect') {
        walletClientId = sender;
      }
      for (const w of connectWaiters.splice(0)) {
        clearTimeout(w.timer);
        w.resolve(msg);
      }
      return;
    }

    if (!walletClientId) return; // not paired yet: nothing else is meaningful

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
        everOpened = true;
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
        cleanupEs();
        if (opened) {
          scheduleReconnect();
        } else {
          // Caller decides: initial open fails the channel, reconnect attempts retry.
          reject(new TBridgeError('HTTP_BRIDGE_ERROR', 'SSE connection failed'));
        }
      };

      eventSource.addEventListener('open', onOpen);
      eventSource.addEventListener('message', onMessage as EventListener);
      eventSource.addEventListener('error', onError);
    });

  function scheduleReconnect(): void {
    if (destroyed) return;
    if (reconnectAttempt >= SSE_MAX_RECONNECT_ATTEMPTS) {
      // Hard-stop: no further reconnects, fail pending RPCs, mark channel dead
      // so subsequent send() fails immediately instead of hanging on timeout.
      channelDead = true;
      setHealth('offline');
      const err = new TBridgeError(
        'HTTP_BRIDGE_ERROR',
        'Bridge offline after max reconnect attempts',
      );
      for (const [, p] of pending) {
        clearTimeout(p.timer);
        p.reject(err);
      }
      pending.clear();
      for (const w of connectWaiters.splice(0)) {
        clearTimeout(w.timer);
        w.reject(err);
      }
      return;
    }
    setHealth('reconnecting');
    const delay = backoffMs(reconnectAttempt++);
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      openSse().catch(scheduleReconnect);
    }, delay);
  }

  const waitConnectEvent = (timeoutMs: number): Promise<ConnectEvent> =>
    new Promise((resolve, reject) => {
      if (destroyed || channelDead) {
        reject(new TBridgeError('NOT_CONNECTED', 'Session destroyed'));
        return;
      }
      const entry: {
        resolve: (ev: ConnectEvent) => void;
        reject: (err: unknown) => void;
        timer: ReturnType<typeof setTimeout>;
      } = {
        resolve,
        reject,
        timer: setTimeout(() => {
          const idx = connectWaiters.indexOf(entry);
          if (idx >= 0) connectWaiters.splice(idx, 1);
          reject(new TBridgeError('TIMEOUT', 'Wallet did not respond in time'));
        }, timeoutMs),
      };
      connectWaiters.push(entry);
    });

  // Start SSE immediately (caller awaits openSse via connect/restore)
  const sseReady = openSse();
  // Initial open failed (often after connect's 2.5 s soft wait, with the QR already
  // shown): keep retrying in the background so the wallet's approval can still
  // arrive. Callers that give up destroy the channel, which stops the retries.
  sseReady.catch(() => {
    if (!destroyed) scheduleReconnect();
  });

  /** Encrypt + POST one request to the wallet. Resolves once the bridge accepted it. */
  const post = async (request: AppRequest, to: string): Promise<void> => {
    const body = crypto.encrypt(JSON.stringify(request), to);
    const topic =
      request.method === 'sendTransaction' ||
      request.method === 'disconnect' ||
      request.method === 'signData'
        ? request.method
        : undefined;
    const url = messageUrl(bridgeUrl, clientId, to, BRIDGE_MESSAGE_TTL_SEC, topic);
    let res: Response;
    try {
      // Body: base64(nonce||ciphertext). No Content-Type — matches bridge clients
      // that POST a bare string body (wallets / Telegram bridge).
      res = await fetch(url, {
        method: 'POST',
        body,
        signal: abort.signal,
        credentials: 'omit',
        cache: 'no-store',
      });
    } catch (e) {
      throw new TBridgeError('HTTP_BRIDGE_ERROR', 'Failed to post message', e);
    }
    if (!res.ok) {
      throw new TBridgeError('HTTP_BRIDGE_ERROR', `Bridge POST failed: HTTP ${res.status}`);
    }
  };

  const session: HttpBridgeSession = {
    kind: 'http',
    bridgeUrl,
    appName: params.appName,
    clientId,
    get walletClientId() {
      return walletClientId ?? '';
    },
    async send(request: AppRequest): Promise<WalletResponse> {
      // A failed first open must not poison a channel that has reconnected since.
      if (!everOpened) await sseReady;
      if (destroyed || !walletClientId) {
        throw new TBridgeError('NOT_CONNECTED', 'HTTP session not ready');
      }
      if (channelDead) {
        throw new TBridgeError('HTTP_BRIDGE_ERROR', 'Bridge channel offline — reconnect required');
      }

      const responsePromise = new Promise<WalletResponse>((resolve, reject) => {
        const timer = setTimeout(() => {
          pending.delete(request.id);
          reject(new TBridgeError('TIMEOUT', `Request ${request.id} timed out`));
        }, params.timeoutMs);
        pending.set(request.id, { resolve, reject, timer });
      });
      // destroy() during the POST may reject it before the caller awaits it.
      responsePromise.catch(() => undefined);

      try {
        await post(request, walletClientId);
      } catch (e) {
        const p = pending.get(request.id);
        if (p) {
          clearTimeout(p.timer);
          pending.delete(request.id);
        }
        throw e;
      }

      return responsePromise;
    },
    async disconnect(): Promise<void> {
      if (destroyed || !walletClientId) {
        session.destroy();
        return;
      }
      // Fire-and-forget like the reference SDK: the wallet may be closed and never
      // answer, so only wait for the bridge to accept the POST.
      try {
        await post({ method: 'disconnect', params: [], id: String(Date.now()) }, walletClientId);
      } catch {
        /* best-effort */
      }
      session.destroy();
    },
    destroy(): void {
      if (destroyed) return;
      destroyed = true;
      channelDead = true;
      abort.abort();
      cleanupEs();
      for (const [, p] of pending) {
        clearTimeout(p.timer);
        p.reject(new TBridgeError('NOT_CONNECTED', 'Session destroyed'));
      }
      pending.clear();
      for (const w of connectWaiters.splice(0)) {
        clearTimeout(w.timer);
        w.reject(new TBridgeError('NOT_CONNECTED', 'Session destroyed'));
      }
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
  let softWaitOver = false;
  await Promise.race([
    channel.sseReady.catch((e: unknown) => {
      // Failed inside the soft wait: give up (stops retries). Later failures are
      // retried in the background while we wait for the wallet.
      if (softWaitOver) return;
      channel.session.destroy();
      throw e;
    }),
    new Promise<void>((resolve) => {
      window.setTimeout(() => {
        softWaitOver = true;
        resolve();
      }, SSE_CONNECT_SOFT_TIMEOUT_MS);
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
  lastWalletEventId?: number | null;
  sessionCrypto: SessionCrypto;
  timeoutMs: number;
  hooks?: HttpSessionHooks;
}): Promise<HttpBridgeSession> {
  const channel = openHttpChannel({
    bridgeUrl: params.bridgeUrl,
    appName: params.appName,
    sessionCrypto: params.sessionCrypto,
    walletClientId: params.walletClientId,
    lastWalletEventId: params.lastWalletEventId,
    timeoutMs: params.timeoutMs,
    hooks: params.hooks,
  });

  try {
    await channel.sseReady;
  } catch (e) {
    channel.session.destroy(); // restore gives up: stop background retries
    throw e;
  }
  return channel.session;
}
