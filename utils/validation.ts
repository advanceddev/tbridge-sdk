/**
 * Runtime validation — no external schema library.
 * Fail closed: reject malformed wallet / bridge payloads.
 */

import { TBridgeError } from '../core/errors';
import type {
  ConnectEvent,
  ConnectItemReply,
  DeviceInfo,
  SendTransactionRequest,
  WalletResponse,
} from '../core/types';

export function assertNonEmptyString(value: unknown, field: string): asserts value is string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new TBridgeError('INVALID_PAYLOAD', `${field} must be a non-empty string`);
  }
}

export function isConnectEvent(value: unknown): value is ConnectEvent {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  if (v.event !== 'connect' && v.event !== 'connect_error') return false;
  if (typeof v.id !== 'number') return false;
  if (!v.payload || typeof v.payload !== 'object') return false;
  return true;
}

export function isWalletResponse(value: unknown): value is WalletResponse {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  if (typeof v.id !== 'string' && typeof v.id !== 'number') return false;
  if ('result' in v) return true;
  if ('error' in v && v.error && typeof v.error === 'object') return true;
  return false;
}

export function extractAccountFromConnect(items: ConnectItemReply[]): {
  address: string;
  network: string;
  walletStateInit: string;
  publicKey: string;
} {
  const addr = items.find((i) => i.name === 'ton_addr');
  if (!addr || addr.name !== 'ton_addr') {
    throw new TBridgeError('PROTOCOL_ERROR', 'Connect reply missing ton_addr');
  }
  assertNonEmptyString(addr.address, 'ton_addr.address');
  assertNonEmptyString(addr.network, 'ton_addr.network');
  return {
    address: addr.address,
    network: addr.network,
    walletStateInit: addr.walletStateInit ?? '',
    publicKey: addr.publicKey ?? '',
  };
}

export function assertDeviceInfo(value: unknown): asserts value is DeviceInfo {
  if (!value || typeof value !== 'object') {
    throw new TBridgeError('INVALID_PAYLOAD', 'device info missing');
  }
  const d = value as Record<string, unknown>;
  if (typeof d.platform !== 'string' || typeof d.appName !== 'string') {
    throw new TBridgeError('INVALID_PAYLOAD', 'device info malformed');
  }
}

export function validateSignData(payload: import('../core/types').SignDataPayload): void {
  if (!payload || typeof payload !== 'object' || !('type' in payload)) {
    throw new TBridgeError('INVALID_PAYLOAD', 'signData payload required');
  }
  if (payload.type === 'text') {
    assertNonEmptyString(payload.text, 'signData.text');
    if (payload.text.length > 128_000) {
      throw new TBridgeError('INVALID_PAYLOAD', 'signData text too long');
    }
  } else if (payload.type === 'binary') {
    assertNonEmptyString(payload.bytes, 'signData.bytes');
  } else if (payload.type === 'cell') {
    assertNonEmptyString(payload.schema, 'signData.schema');
    assertNonEmptyString(payload.cell, 'signData.cell');
  } else {
    throw new TBridgeError('INVALID_PAYLOAD', 'Unknown signData type');
  }
}

export function validateSendTransaction(tx: SendTransactionRequest): void {
  if (!tx || typeof tx !== 'object') {
    throw new TBridgeError('INVALID_PAYLOAD', 'transaction must be an object');
  }
  if (typeof tx.validUntil !== 'number' || tx.validUntil <= 0) {
    throw new TBridgeError('INVALID_PAYLOAD', 'validUntil must be a positive unix timestamp');
  }
  // rpc.md:90 — Unix *seconds*. A Date.now()-style value (ms) would read as a
  // deadline tens of millennia away, i.e. a request that never expires.
  if (tx.validUntil >= 1e12) {
    throw new TBridgeError('INVALID_PAYLOAD', 'validUntil must be in seconds, not milliseconds');
  }
  if (tx.validUntil < Math.floor(Date.now() / 1000)) {
    throw new TBridgeError('INVALID_PAYLOAD', 'validUntil is in the past');
  }
  if (!Array.isArray(tx.messages) || tx.messages.length === 0) {
    throw new TBridgeError('INVALID_PAYLOAD', 'messages must be a non-empty array');
  }
  if (tx.messages.length > 255) {
    throw new TBridgeError('INVALID_PAYLOAD', 'too many messages (max 255)');
  }
  for (const m of tx.messages) {
    assertNonEmptyString(m.address, 'message.address');
    assertNonEmptyString(m.amount, 'message.amount');
    if (!/^\d+$/.test(m.amount)) {
      throw new TBridgeError('INVALID_PAYLOAD', 'message.amount must be decimal string');
    }
  }
}

/**
 * Spec rpc.md:56: wallet event ids MUST strictly increase; the dApp MUST reject
 * events that violate this. Returns a predicate: false = stale event, drop it.
 * Events without a numeric id are let through (same as @tonconnect/sdk).
 */
export function createEventIdGate(baseline: number | null = null): (id: unknown) => boolean {
  let last = baseline;
  return (id) => {
    if (typeof id !== 'number') return true;
    if (last !== null && id <= last) return false;
    last = id;
    return true;
  };
}

function findFeature(features: readonly unknown[], name: string): Record<string, unknown> | null {
  const f = features.find(
    (x) => !!x && typeof x === 'object' && (x as { name?: unknown }).name === name,
  );
  return (f as Record<string, unknown> | undefined) ?? null;
}

/**
 * Spec connect.md:103: "SDKs MUST treat absent features as unsupported and refuse
 * to send the corresponding request." Mirrors @tonconnect/sdk checkSendTransactionSupport,
 * including the legacy string feature 'SendTransaction'.
 */
export function assertSendTransactionSupported(
  features: readonly unknown[],
  tx: SendTransactionRequest,
): void {
  const feature = findFeature(features, 'SendTransaction');
  if (!feature && !features.includes('SendTransaction')) {
    throw new TBridgeError('WALLET_NOT_SUPPORTED', "Wallet doesn't support SendTransaction");
  }
  const needsExtra = tx.messages.some(
    (m) => m.extraCurrency && Object.keys(m.extraCurrency).length > 0,
  );
  if (needsExtra && feature?.extraCurrencySupported !== true) {
    throw new TBridgeError('WALLET_NOT_SUPPORTED', "Wallet doesn't support extra currencies");
  }
  if (typeof feature?.maxMessages === 'number' && tx.messages.length > feature.maxMessages) {
    throw new TBridgeError(
      'WALLET_NOT_SUPPORTED',
      `Wallet supports at most ${feature.maxMessages} messages, got ${tx.messages.length}`,
    );
  }
}

/** Spec connect.md:103 — SignData must be listed with the requested payload type. */
export function assertSignDataSupported(features: readonly unknown[], type: string): void {
  const types = findFeature(features, 'SignData')?.types;
  if (!Array.isArray(types) || !types.includes(type)) {
    throw new TBridgeError(
      'WALLET_NOT_SUPPORTED',
      `Wallet doesn't support signData type "${type}"`,
    );
  }
}

/** Map wallet RPC error codes to TBridgeError */
export function mapWalletError(code: number, message: string): TBridgeError {
  switch (code) {
    case 300:
      return new TBridgeError('USER_REJECTED', message || 'User rejected the request');
    case 100:
      return new TBridgeError('NOT_CONNECTED', message || 'Unknown app / session');
    case 1:
      return new TBridgeError('INVALID_PAYLOAD', message || 'Bad request');
    case 2: // MANIFEST_NOT_FOUND
    case 3: // MANIFEST_CONTENT_ERROR
      return new TBridgeError('INVALID_MANIFEST', message || 'App manifest not found or invalid');
    case 400:
      return new TBridgeError('WALLET_NOT_SUPPORTED', message || 'Method not supported');
    default:
      return new TBridgeError('PROTOCOL_ERROR', message || `Wallet error ${code}`);
  }
}
