/**
 * TBridge — main SDK entry (framework-agnostic).
 * HTTP restore, signData, rate limiting, origin-bound sessions,
 * bridge health events, parallel discovery.
 */

import {
  DEFAULT_REQUEST_TIMEOUT_MS,
  DEFAULT_WALLETS_REGISTRY_URL,
  PROTOCOL_VERSION,
  RPC_RATE_CAPACITY,
  RPC_RATE_REFILL_PER_SEC,
  SESSION_MAX_AGE_MS,
  TBRIDGE_VERSION,
} from '../core/constants';
import type { CryptoProvider } from '../core/crypto';
import { SessionCrypto } from '../core/crypto';
import { TypedEventEmitter } from '../core/event-emitter';
import { assertBrowser, TBridgeError } from '../core/errors';
import { assertSafeManifestUrl, currentOrigin, RateLimiter } from '../core/security';
import { LocalStorageAdapter, type StorageAdapter } from '../core/storage';
import type {
  Account,
  BridgeHealth,
  ConnectionStatus,
  ConnectRequest,
  DeviceInfo,
  SendTransactionRequest,
  SignDataPayload,
  TBridgeEventMap,
  TBridgeOptions,
  WalletInfo,
} from '../core/types';
import { NETWORK_ID } from '../core/types';
import {
  connectHttpBridge,
  restoreHttpBridge,
  type HttpBridgeSession,
} from '../bridge/http-bridge';
import { connectJsBridge, restoreJsBridge, type JsBridgeSession } from '../bridge/js-bridge';
import { detectInjectedWallet, getInjectedBridge } from '../utils/browser';
import {
  assertDeviceInfo,
  extractAccountFromConnect,
  mapWalletError,
  validateSendTransaction,
  validateSignData,
} from '../utils/validation';
import { WalletDiscovery } from './discovery';
import { normalizeLocale, type TBridgeLocale } from '../ui/i18n';
import { normalizeTheme, type TBridgeTheme } from '../ui/theme';
import { showActionSheet, type ActionSheetHandle } from '../ui/action-sheet';
import {
  clearPersistedSession,
  loadPersistedSession,
  saveLastWallet,
  loadLastWallet,
  savePersistedSession,
  setSessionPersistence,
} from './session';

export interface TBridgeConnectOptions {
  appName?: string;
  onConnectLink?: (link: string) => void;
  tonProofPayload?: string;
}

type ActiveSession = JsBridgeSession | HttpBridgeSession;

export class TBridge {
  readonly version = TBRIDGE_VERSION;

  private readonly manifestUrl: string;
  private readonly network: 'mainnet' | 'testnet';
  private readonly requestTimeoutMs: number;
  private readonly debug: boolean;
  private readonly storage: StorageAdapter;
  private readonly cryptoProvider?: CryptoProvider;
  private readonly sessionMaxAgeMs: number;
  private readonly discovery: WalletDiscovery;
  private readonly emitter = new TypedEventEmitter<TBridgeEventMap>();
  private readonly rateLimiter = new RateLimiter(RPC_RATE_CAPACITY, RPC_RATE_REFILL_PER_SEC);

  private status: ConnectionStatus = { status: 'disconnected' };
  private account: Account | null = null;
  private device: DeviceInfo | null = null;
  private currentWallet: WalletInfo | null = null;
  private session: ActiveSession | null = null;
  private sessionCrypto: SessionCrypto | null = null;
  private requestId = 0;
  private locale: TBridgeLocale;
  private theme: TBridgeTheme;
  private connecting = false;
  private restoring = false;
  /** Cleanup for in-flight HTTP connect (SSE channel) */
  private pendingConnectCleanup: (() => void) | null = null;

  constructor(options: TBridgeOptions & { crypto?: CryptoProvider }) {
    assertBrowser();

    if (!options.manifestUrl || typeof options.manifestUrl !== 'string') {
      throw new TBridgeError(
        'INVALID_MANIFEST',
        'manifestUrl is required and must be a non-empty string',
      );
    }
    if (!options.allowInsecureManifest) {
      assertSafeManifestUrl(options.manifestUrl);
    }

    this.manifestUrl = options.manifestUrl;
    this.network = options.network ?? 'mainnet';
    this.requestTimeoutMs = options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
    this.debug = options.debug ?? false;
    this.storage = options.storage ?? new LocalStorageAdapter();
    this.cryptoProvider = options.crypto;
    this.sessionMaxAgeMs = options.sessionMaxAgeMs ?? SESSION_MAX_AGE_MS;
    setSessionPersistence(options.sessionPersistence === 'session' ? 'session' : 'local');
    this.locale = normalizeLocale(options.locale);
    this.theme = normalizeTheme(options.theme);
    this.discovery = new WalletDiscovery(
      options.walletsRegistry ?? DEFAULT_WALLETS_REGISTRY_URL,
      this.storage,
    );
  }

  get connectionStatus(): ConnectionStatus {
    return this.status;
  }

  get isConnected(): boolean {
    return this.status.status === 'connected';
  }

  get isRestoring(): boolean {
    return this.restoring;
  }

  get connectedAccount(): Account | null {
    return this.account;
  }

  get connectedWallet(): WalletInfo | null {
    return this.currentWallet;
  }

  on<K extends keyof TBridgeEventMap>(
    event: K,
    handler: (payload: TBridgeEventMap[K]) => void,
  ): () => void {
    return this.emitter.on(event, handler);
  }

  async getWallets(forceRefresh = false): Promise<WalletInfo[]> {
    return this.discovery.getWallets(forceRefresh);
  }

  async getWallet(appName: string): Promise<WalletInfo | null> {
    return this.discovery.getWalletByAppName(appName);
  }

  getLocale(): TBridgeLocale {
    return this.locale;
  }

  setLocale(locale: TBridgeLocale | string): void {
    this.locale = normalizeLocale(locale);
  }

  getTheme(): TBridgeTheme {
    return this.theme;
  }

  setTheme(theme: TBridgeTheme | string): void {
    this.theme = normalizeTheme(theme);
  }

  async getLastWalletAppName(): Promise<string | null> {
    return loadLastWallet(this.storage);
  }

  async detectInjected(): Promise<{ appName: string; key: string } | null> {
    const wallets = await this.discovery.getWallets();
    const detected = detectInjectedWallet(wallets);
    if (!detected) return null;
    return { appName: detected.appName, key: detected.key };
  }

  async connect(options: TBridgeConnectOptions = {}): Promise<ConnectionStatus> {
    assertBrowser();
    if (this.isConnected) {
      throw new TBridgeError('ALREADY_CONNECTED', 'Already connected');
    }
    if (this.connecting || this.restoring) {
      throw new TBridgeError('PROTOCOL_ERROR', 'Connection already in progress');
    }

    this.connecting = true;
    this.setStatus({ status: 'connecting' });

    try {
      // Parallel: wallets list + nothing else blocking
      const wallets = await this.discovery.getWallets();
      const connectRequest = this.buildConnectRequest(options.tonProofPayload);

      const injected = detectInjectedWallet(wallets);
      if (injected && (!options.appName || options.appName === injected.appName)) {
        const wallet =
          wallets.find((w) => w.app_name === injected.appName) ??
          syntheticWallet(injected.appName, injected.key);

        const { event, session } = await connectJsBridge({
          bridgeKey: injected.key,
          appName: injected.appName,
          connectRequest,
          timeoutMs: this.requestTimeoutMs,
        });

        this.applyConnectSuccess(event, wallet, session);
        await saveLastWallet(this.storage, wallet.app_name);
        return this.status;
      }

      if (!options.appName) {
        throw new TBridgeError(
          'WALLET_NOT_FOUND',
          'No injected wallet and appName not provided. Use UI picker or pass appName.',
        );
      }

      const wallet = wallets.find((w) => w.app_name === options.appName);
      if (!wallet) {
        throw new TBridgeError('WALLET_NOT_FOUND', `Wallet "${options.appName}" not in list`);
      }

      const jsBridge = wallet.bridge.find((b) => b.type === 'js');
      if (jsBridge && jsBridge.type === 'js' && getInjectedBridge(jsBridge.key)) {
        const { event, session } = await connectJsBridge({
          bridgeKey: jsBridge.key,
          appName: wallet.app_name,
          connectRequest,
          timeoutMs: this.requestTimeoutMs,
        });
        this.applyConnectSuccess(event, wallet, session);
        await saveLastWallet(this.storage, wallet.app_name);
        return this.status;
      }

      const sse = wallet.bridge.find((b) => b.type === 'sse');
      if (!sse || sse.type !== 'sse') {
        throw new TBridgeError(
          'WALLET_NOT_SUPPORTED',
          `Wallet "${wallet.app_name}" has no SSE bridge and is not injected`,
        );
      }

      if (!options.onConnectLink) {
        throw new TBridgeError(
          'PROTOCOL_ERROR',
          'onConnectLink is required for HTTP bridge (open universal link / show QR)',
        );
      }

      const sessionCrypto = await SessionCrypto.create(this.cryptoProvider);
      this.sessionCrypto = sessionCrypto;

      const hooks = this.createHttpHooks();

      const { event, session } = await connectHttpBridge({
        bridgeUrl: sse.url,
        appName: wallet.app_name,
        universalUrl: wallet.universal_url,
        deepLink: wallet.deepLink,
        connectRequest,
        timeoutMs: this.requestTimeoutMs,
        sessionCrypto,
        onConnectLink: options.onConnectLink,
        hooks,
        onChannel: (httpSession) => {
          this.session = httpSession;
          this.pendingConnectCleanup = () => {
            try {
              httpSession.destroy();
            } catch {
              /* ignore */
            }
          };
        },
      });
      this.pendingConnectCleanup = null;

      this.applyConnectSuccess(event, wallet, session);

      const keys = sessionCrypto.exportKeys();
      await savePersistedSession(this.storage, {
        version: PROTOCOL_VERSION,
        walletAppName: wallet.app_name,
        clientId: keys.publicKeyHex,
        walletClientId: session.kind === 'http' ? session.walletClientId : '',
        bridgeUrl: sse.url,
        account: this.account!,
        device: this.device!,
        createdAt: Date.now(),
        origin: currentOrigin(),
        secretKeyHex: keys.secretKeyHex,
        lastRpcId: this.requestId,
      });
      await saveLastWallet(this.storage, wallet.app_name);

      return this.status;
    } catch (e) {
      this.teardownSession();
      this.setStatus({ status: 'disconnected' });
      const err = TBridgeError.is(e) ? e : new TBridgeError('UNKNOWN', 'Connect failed', e);
      this.emitter.emit('error', err);
      throw err;
    } finally {
      this.connecting = false;
    }
  }

  /**
   * Abort an in-flight connect (user closed picker / cancelled QR).
   * Safe to call anytime; no-op if not connecting.
   */
  cancelConnect(): void {
    if (!this.connecting && !this.pendingConnectCleanup) return;
    try {
      this.pendingConnectCleanup?.();
    } catch {
      /* ignore */
    }
    this.pendingConnectCleanup = null;
    this.teardownSession();
    this.connecting = false;
    this.setStatus({ status: 'disconnected' });
    this.emitter.emit('disconnect', { reason: 'user_cancel' });
  }

  /**
   * Restore prior session (JS inject restore + HTTP SSE re-attach).
   * Safe to call on app start. Origin-bound + max-age checked.
   */
  async restoreConnection(): Promise<ConnectionStatus> {
    assertBrowser();
    if (this.isConnected || this.connecting || this.restoring) {
      return this.status;
    }

    this.restoring = true;
    try {
      const wallets = await this.discovery.getWallets();

      // 1. Injected JS bridge — fastest path (Telegram Mini-App etc.)
      const injected = detectInjectedWallet(wallets);
      if (injected) {
        const restored = await restoreJsBridge({
          bridgeKey: injected.key,
          appName: injected.appName,
          timeoutMs: Math.min(this.requestTimeoutMs, 12_000),
        });
        if (restored) {
          const wallet =
            wallets.find((w) => w.app_name === injected.appName) ??
            syntheticWallet(injected.appName, injected.key);
          this.applyConnectSuccess(restored.event, wallet, restored.session);
          return this.status;
        }
      }

      // 2. Persisted HTTP session
      const persisted = await loadPersistedSession(this.storage);
      if (!persisted?.secretKeyHex || !persisted.bridgeUrl || !persisted.walletClientId) {
        return this.status;
      }

      if (Date.now() - persisted.createdAt > this.sessionMaxAgeMs) {
        this.log('session expired by max-age');
        await clearPersistedSession(this.storage);
        this.emitter.emit('disconnect', { reason: 'session_expired' });
        return this.status;
      }

      if (persisted.origin && persisted.origin !== currentOrigin()) {
        this.log('session origin mismatch — refusing restore');
        await clearPersistedSession(this.storage);
        return this.status;
      }

      const wallet = wallets.find((w) => w.app_name === persisted.walletAppName) ?? null;
      if (!wallet) {
        await clearPersistedSession(this.storage);
        return this.status;
      }

      const sessionCrypto = await SessionCrypto.create(this.cryptoProvider, {
        publicKeyHex: persisted.clientId,
        secretKeyHex: persisted.secretKeyHex,
      });
      this.sessionCrypto = sessionCrypto;

      const hooks = this.createHttpHooks();
      const session = await restoreHttpBridge({
        bridgeUrl: persisted.bridgeUrl,
        appName: persisted.walletAppName,
        walletClientId: persisted.walletClientId,
        sessionCrypto,
        timeoutMs: this.requestTimeoutMs,
        hooks,
      });

      this.session = session;
      this.account = persisted.account;
      if (typeof persisted.lastRpcId === 'number' && persisted.lastRpcId >= 0) {
        this.requestId = persisted.lastRpcId;
      }
      this.device = persisted.device;
      this.currentWallet = wallet;
      this.setStatus({
        status: 'connected',
        account: persisted.account,
        device: persisted.device,
        wallet,
      });

      return this.status;
    } catch (e) {
      this.log('restoreConnection failed', e);
      this.teardownSession();
      await clearPersistedSession(this.storage).catch(() => undefined);
      return this.status;
    } finally {
      this.restoring = false;
    }
  }

  async disconnect(): Promise<void> {
    assertBrowser();
    const session = this.session;
    this.teardownSession();
    this.setStatus({ status: 'disconnected' });
    this.emitter.emit('disconnect', { reason: 'local' });
    await clearPersistedSession(this.storage).catch(() => undefined);

    if (session) {
      try {
        await session.disconnect();
      } catch {
        session.destroy();
      }
    }
  }

  async sendTransaction(tx: SendTransactionRequest): Promise<{ boc: string }> {
    assertBrowser();
    this.assertCanRpc();
    validateSendTransaction(tx);

    const payload = {
      valid_until: tx.validUntil,
      network: tx.network ?? NETWORK_ID[this.network],
      from: tx.from ?? this.account?.address,
      messages: tx.messages.map((m) => ({
        address: m.address,
        amount: m.amount,
        payload: m.payload,
        stateInit: m.stateInit,
        extra_currency: m.extraCurrency,
      })),
    };

    const clientId =
      this.sessionCrypto?.clientId ??
      (this.session?.kind === 'http' ? this.session.clientId : '') ??
      '';

    let sheet: ActionSheetHandle | null = null;
    let rejectCancel: ((err: TBridgeError) => void) | null = null;
    const cancelPromise = new Promise<never>((_, reject) => {
      rejectCancel = reject;
    });

    if (this.session?.kind === 'http' && clientId) {
      sheet = showActionSheet({
        locale: this.locale,
        theme: this.theme,
        wallet: this.currentWallet,
        clientId,
        onCancel: () => {
          rejectCancel?.(new TBridgeError('USER_REJECTED', 'User rejected the request'));
        },
      });
    }

    try {
      const response = await Promise.race([
        this.session!.send({
          method: 'sendTransaction',
          params: [JSON.stringify(payload)],
          id: this.nextId(),
        }),
        cancelPromise,
      ]);

      sheet?.close();

      if ('error' in response) {
        throw mapWalletError(response.error.code, response.error.message);
      }

      const boc =
        typeof response.result === 'string' ? response.result : String(response.result ?? '');
      await this.bumpPersistedRpcId();
      return { boc };
    } catch (e) {
      sheet?.close();
      throw e;
    }
  }

  /**
   * Sign opaque data (text / binary / cell) without broadcasting.
   */
  async signData(
    payload: SignDataPayload,
    opts?: { from?: string; network?: string },
  ): Promise<{ signature: string; [key: string]: unknown }> {
    assertBrowser();
    this.assertCanRpc();
    validateSignData(payload);

    const body = {
      network: opts?.network ?? NETWORK_ID[this.network],
      from: opts?.from ?? this.account?.address,
      ...payload,
    };

    const response = await this.session!.send({
      method: 'signData',
      params: [JSON.stringify(body)],
      id: this.nextId(),
    });

    if ('error' in response) {
      throw mapWalletError(response.error.code, response.error.message);
    }

    if (typeof response.result === 'string') {
      await this.bumpPersistedRpcId();
      return { signature: response.result };
    }
    await this.bumpPersistedRpcId();
    return response.result as { signature: string };
  }

  destroy(): void {
    // Release runtime resources only — do NOT clear persisted session
    // (reload / remount can restore). Use disconnect() to end the session.
    try {
      this.discovery.cancelPrefetch();
    } catch {
      /* ignore */
    }
    try {
      this.pendingConnectCleanup?.();
    } catch {
      /* ignore */
    }
    this.pendingConnectCleanup = null;
    this.connecting = false;
    this.restoring = false;
    this.teardownSession();
    this.emitter.removeAllListeners();
    this.setStatus({ status: 'disconnected' });
  }

  private createHttpHooks() {
    return {
      onHealth: (health: BridgeHealth) => {
        this.emitter.emit('bridgeHealth', health);
      },
      onWalletDisconnect: () => {
        this.teardownSession();
        this.setStatus({ status: 'disconnected' });
        this.emitter.emit('disconnect', { reason: 'wallet' });
        void clearPersistedSession(this.storage);
      },
    };
  }

  private assertCanRpc(): void {
    if (!this.session || !this.isConnected) {
      throw new TBridgeError('NOT_CONNECTED', 'Wallet is not connected');
    }
    if (!this.rateLimiter.tryRemove(1)) {
      throw new TBridgeError('PROTOCOL_ERROR', 'Rate limit exceeded — slow down RPC calls');
    }
  }

  /**
   * RPC request id — MUST be a decimal integer string, strictly increasing
   * per session. Wallets reject non-numeric / non-monotonic ids (often with
   * no UI). Spec: rpc.md AppRequest.id
   */
  private nextId(): string {
    const id = String(this.requestId);
    this.requestId += 1;
    return id;
  }

  private async bumpPersistedRpcId(): Promise<void> {
    try {
      const current = await loadPersistedSession(this.storage);
      if (!current) return;
      await savePersistedSession(this.storage, { ...current, lastRpcId: this.requestId });
    } catch {
      /* non-fatal */
    }
  }

  /**
   * Re-open the wallet app/session so it consumes the pending bridge message.
   * Required when push notifications are missing or ignored (common for Telegram).
   */

  private buildConnectRequest(tonProofPayload?: string): ConnectRequest {
    const items: ConnectRequest['items'] = [
      { name: 'ton_addr', network: NETWORK_ID[this.network] },
    ];
    if (tonProofPayload) {
      items.push({ name: 'ton_proof', payload: tonProofPayload });
    }
    return { manifestUrl: this.manifestUrl, items };
  }

  private applyConnectSuccess(
    event: import('../core/types').ConnectEvent,
    wallet: WalletInfo,
    session: ActiveSession,
  ): void {
    if (event.event !== 'connect') {
      throw new TBridgeError('PROTOCOL_ERROR', 'Expected connect event');
    }
    assertDeviceInfo(event.payload.device);
    const accountData = extractAccountFromConnect(event.payload.items);
    const account: Account = {
      address: accountData.address,
      chain: accountData.network,
      walletStateInit: accountData.walletStateInit,
      publicKey: accountData.publicKey,
    };

    this.session = session;
    this.account = account;
    this.device = event.payload.device;
    this.currentWallet = wallet;

    if (typeof event.id === 'number' && event.id >= this.requestId) {
      this.requestId = event.id + 1;
    }

    this.setStatus({
      status: 'connected',
      account,
      device: event.payload.device,
      wallet,
    });
  }

  private teardownSession(): void {
    if (this.session) {
      try {
        this.session.destroy();
      } catch {
        /* ignore */
      }
      this.session = null;
    }
    if (this.sessionCrypto) {
      this.sessionCrypto.dispose();
      this.sessionCrypto = null;
    }
    this.account = null;
    this.device = null;
    this.currentWallet = null;
  }

  private setStatus(next: ConnectionStatus): void {
    this.status = next;
    this.emitter.emit('statusChange', next);
  }

  private log(...args: unknown[]): void {
    if (this.debug) {
      console.debug('[TBridge]', ...args);
    }
  }
}

function syntheticWallet(appName: string, key: string): WalletInfo {
  return {
    app_name: appName,
    name: appName,
    image: '',
    about_url: '',
    bridge: [{ type: 'js', key }],
    platforms: [],
    features: [],
  };
}

export function createTBridge(options: TBridgeOptions & { crypto?: CryptoProvider }): TBridge {
  return new TBridge(options);
}
