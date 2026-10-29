/**
 * TBridge — pure TypeScript TON wallet connector SDK.
 * Browser-only. Framework-agnostic. Zero hard dependencies.
 */

export { TBRIDGE_VERSION, PROTOCOL_VERSION, DEFAULT_WALLETS_REGISTRY_URL } from './core/constants';
export { TBridgeError, type TBridgeErrorCode } from './core/errors';
export type {
  Account,
  BridgeHealth,
  ConnectionStatus,
  DeviceInfo,
  InjectedWalletBridge,
  SendTransactionRequest,
  SendTransactionMessage,
  SignDataPayload,
  SignDataRequest,
  TBridgeOptions,
  WalletInfo,
  WalletFeature,
  ConnectRequest,
  TonNetwork,
} from './core/types';
export { NETWORK_ID } from './core/types';
export { LocalStorageAdapter, MemoryStorageAdapter, type StorageAdapter } from './core/storage';
export {
  SessionCrypto,
  NaclCryptoProvider,
  type CryptoProvider,
  type KeyPair,
} from './core/crypto';
export { assertSafeManifestUrl, safeJsonParse, RateLimiter, isSafeImageUrl } from './core/security';

export { TBridge, createTBridge, type TBridgeConnectOptions } from './wallet/connector';
export { WalletDiscovery } from './wallet/discovery';
export { parseWalletsRegistry, parseWalletEntry, fetchWalletsRegistry } from './wallet/registry';

export {
  isBrowser,
  detectInjectedWallet,
  getInjectedBridge,
  INJECTED_BRIDGE_PROP,
} from './utils/browser';
export { encodeQrMatrix, renderQrToDataUrl } from './utils/qr';

export { connectWithUi, type ConnectWithUiOptions } from './ui/connect-ui';
export { openWalletModal, createConnectButton } from './ui/modal';
export type { WalletModalOptions, WalletModalHandle } from './ui/modal';
export { ensureStyles, removeStyles } from './ui/styles';
export { t, normalizeLocale, type TBridgeLocale } from './ui/i18n';
export { normalizeTheme, type TBridgeTheme } from './ui/theme';

export {
  openWalletLink,
  withReturnStrategy,
  resolveReturnStrategy,
  shouldPreferQr,
} from './utils/open-wallet-link';
export {
  detectRuntimeEnv,
  isTelegramClient,
  isMobileOs,
  type RuntimeEnv,
  type HostKind,
} from './utils/runtime-env';
