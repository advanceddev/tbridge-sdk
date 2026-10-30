/**
 * Core protocol & domain types for TBridge.
 * Wire shapes compatible with TON wallet bridge protocol.
 * Pure types — no runtime deps.
 */

import type { PROTOCOL_VERSION } from './constants';

// ---------------------------------------------------------------------------
// Network
// ---------------------------------------------------------------------------

export type TonNetwork = 'mainnet' | 'testnet';

/** Official global_id values */
export const NETWORK_ID = {
  mainnet: '-239',
  testnet: '-3',
} as const;

// ---------------------------------------------------------------------------
// Wallet list (wallets-v2.json)
// ---------------------------------------------------------------------------

export type BridgeType = 'js' | 'sse';

export interface JsBridgeConfig {
  type: 'js';
  key: string;
}

export interface SseBridgeConfig {
  type: 'sse';
  url: string;
}

export type WalletBridgeConfig = JsBridgeConfig | SseBridgeConfig;

export interface WalletFeatureSendTransaction {
  name: 'SendTransaction';
  maxMessages: number;
  extraCurrencySupported?: boolean;
}

export interface WalletFeatureSignData {
  name: 'SignData';
  types: Array<'text' | 'binary' | 'cell'>;
}

export type WalletFeature =
  | WalletFeatureSendTransaction
  | WalletFeatureSignData
  | { name: string; [key: string]: unknown };

export interface WalletInfo {
  app_name: string;
  name: string;
  image: string;
  about_url: string;
  universal_url?: string;
  deepLink?: string;
  tondns?: string;
  bridge: WalletBridgeConfig[];
  platforms: string[];
  features: WalletFeature[];
}

// ---------------------------------------------------------------------------
// Device / Account
// ---------------------------------------------------------------------------

export type DevicePlatform =
  | 'iphone'
  | 'ipad'
  | 'android'
  | 'windows'
  | 'mac'
  | 'linux'
  | 'browser';

export interface DeviceInfo {
  platform: DevicePlatform;
  appName: string;
  appVersion: string;
  maxProtocolVersion: number;
  features: WalletFeature[];
}

export interface Account {
  address: string; // raw or user-friendly — we normalize later
  chain: string; // NETWORK_ID
  walletStateInit?: string;
  publicKey?: string;
}

// ---------------------------------------------------------------------------
// Connect protocol
// ---------------------------------------------------------------------------

export interface TonAddressItem {
  name: 'ton_addr';
  network?: string;
}

export interface TonProofItem {
  name: 'ton_proof';
  payload: string;
}

export type ConnectItem = TonAddressItem | TonProofItem;

export interface ConnectRequest {
  manifestUrl: string;
  items: ConnectItem[];
}

export interface TonAddressItemReply {
  name: 'ton_addr';
  address: string;
  network: string;
  walletStateInit: string;
  publicKey: string;
}

export interface TonProofItemReplySuccess {
  name: 'ton_proof';
  proof: {
    timestamp: number;
    domain: { lengthBytes: number; value: string };
    signature: string;
    payload: string;
  };
}

export interface TonProofItemReplyError {
  name: 'ton_proof';
  error: { code: number; message?: string };
}

export type ConnectItemReply =
  | TonAddressItemReply
  | TonProofItemReplySuccess
  | TonProofItemReplyError;

export interface ConnectEventSuccess {
  event: 'connect';
  id: number;
  payload: {
    items: ConnectItemReply[];
    device: DeviceInfo;
  };
}

export interface ConnectEventError {
  event: 'connect_error';
  id: number;
  payload: {
    code: number;
    message: string;
  };
}

export type ConnectEvent = ConnectEventSuccess | ConnectEventError;

// ---------------------------------------------------------------------------
// App requests / Wallet responses
// ---------------------------------------------------------------------------

export interface SendTransactionMessage {
  address: string;
  amount: string; // nanoton as string
  payload?: string; // base64 BOC
  stateInit?: string; // base64 BOC
  extraCurrency?: Record<number, string>;
}

export interface SendTransactionRequest {
  validUntil: number; // unix seconds
  from?: string;
  network?: string;
  messages: SendTransactionMessage[];
}

export interface AppRequestSendTransaction {
  method: 'sendTransaction';
  params: [string]; // JSON-stringified SendTransactionRequest
  id: string;
}

export interface AppRequestDisconnect {
  method: 'disconnect';
  params: [];
  id: string;
}

/** signData payload variants */
export type SignDataPayload =
  | { type: 'text'; text: string }
  | { type: 'binary'; bytes: string } // base64
  | { type: 'cell'; schema: string; cell: string }; // base64 BoC

export interface SignDataRequest {
  /** Schema version used by wallets — payload is JSON-stringified in params */
  from?: string;
  network?: string;
  payload: SignDataPayload;
}

export interface AppRequestSignData {
  method: 'signData';
  params: [string]; // JSON-stringified SignDataRequest-like
  id: string;
}

export type AppRequest = AppRequestSendTransaction | AppRequestDisconnect | AppRequestSignData;

export interface WalletResponseSuccess {
  id: string;
  result: string | Record<string, unknown>; // BOC string or structured (signData)
}

export interface WalletResponseError {
  id: string;
  error: {
    code: number;
    message: string;
    data?: unknown;
  };
}

export type WalletResponse = WalletResponseSuccess | WalletResponseError;

// ---------------------------------------------------------------------------
// Injected JS bridge interface (wallet webview / extension binding)
// Runtime property name on window is wallet-defined (see registry bridge.key).
// ---------------------------------------------------------------------------

export interface InjectedWalletBridge {
  deviceInfo: DeviceInfo;
  walletInfo?: { name: string; image?: string; about_url?: string };
  protocolVersion: number;
  isWalletBrowser?: boolean;
  connect(protocolVersion: number, message: ConnectRequest): Promise<ConnectEvent>;
  restoreConnection(): Promise<ConnectEvent>;
  send(message: AppRequest): Promise<WalletResponse>;
  listen(callback: (event: WalletEvent) => void): () => void;
}

export type WalletEvent = ConnectEvent | { event: 'disconnect'; id: number; payload: {} };

// ---------------------------------------------------------------------------
// Session (HTTP bridge)
// ---------------------------------------------------------------------------

export interface SessionCryptoKeys {
  publicKey: string; // hex
  secretKey: string; // hex — never leave memory longer than needed
}

export interface PersistedSession {
  version: typeof PROTOCOL_VERSION;
  walletAppName: string;
  clientId: string; // our public key hex
  walletClientId: string; // remote public key hex
  bridgeUrl: string;
  account: Account;
  device: DeviceInfo;
  createdAt: number;
  /** Origin that created the session — restore only on same origin */
  origin?: string;
  /**
   * HTTP session secret (hex). In-memory / sessionStorage only —
   * never persisted to localStorage by session helpers.
   */
  secretKeyHex?: string;
  /** Monotonic RPC id counter (stringified integer) */
  lastRpcId?: number;
}

// ---------------------------------------------------------------------------
// Connection status (public)
// ---------------------------------------------------------------------------

export type ConnectionStatus =
  | { status: 'disconnected' }
  | { status: 'connecting' }
  | {
      status: 'connected';
      account: Account;
      device: DeviceInfo;
      wallet: WalletInfo;
    };

// ---------------------------------------------------------------------------
// TBridge options
// ---------------------------------------------------------------------------

export interface TBridgeOptions {
  /**
   * Required — dApp identity manifest URL (JSON with name, url, iconUrl).
   * Sent to the wallet during connect.
   */
  manifestUrl: string;
  /**
   * Optional wallets registry URL.
   * When omitted, defaults to the official TON wallets list.
   * Response is always strict-parsed; invalid payloads throw.
   */
  walletsRegistry?: string;
  /** Preferred network */
  network?: TonNetwork;
  /** Request timeout ms */
  requestTimeoutMs?: number;
  /** Custom storage adapter */
  storage?: import('./storage').StorageAdapter;
  /** Enable debug logs (never logs secrets) */
  debug?: boolean;
  /** Skip HTTPS-only manifest check (dev only) */
  allowInsecureManifest?: boolean;
  /** Max persisted session age ms (default 7d) */
  sessionMaxAgeMs?: number;
  /**
   * Where to store the HTTP session secret.
   * - `local` (default): survives Mini App / tab close (localStorage)
   * - `session`: tab-scoped only (sessionStorage) — stricter, worse UX
   */
  sessionPersistence?: 'local' | 'session';
  /** UI language: en | ru (default en) */
  locale?: 'en' | 'ru';
  /** UI palette: dark | light (default dark) */
  theme?: 'dark' | 'light';
}

// ---------------------------------------------------------------------------
// Events emitted by TBridge
// ---------------------------------------------------------------------------

export type BridgeHealth = 'connected' | 'reconnecting' | 'offline';

export type TBridgeEventMap = {
  statusChange: ConnectionStatus;
  error: import('./errors').TBridgeError;
  /** Wallet-initiated disconnect over the bridge */
  disconnect: { reason: 'wallet' | 'local' | 'session_expired' | 'user_cancel' };
  /** SSE / transport health */
  bridgeHealth: BridgeHealth;
};
