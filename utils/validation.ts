/**
 * Runtime validation — no external schema library.
 * Fail closed: reject malformed wallet / bridge payloads.
 */

import { TBridgeError } from '../core/errors';
import { isHex64 } from '../core/encoding';
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

export function assertClientId(value: unknown): asserts value is string {
  if (!isHex64(String(value ?? ''))) {
    throw new TBridgeError('INVALID_PAYLOAD', 'client_id must be 64-char lowercase hex');
  }
}

export function parseJsonSafe<T = unknown>(raw: string, label: string): T {
  try {
    return JSON.parse(raw) as T;
  } catch (e) {
    throw new TBridgeError('INVALID_PAYLOAD', `${label} is not valid JSON`, e);
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
  if (typeof v.id !== 'string') return false;
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

/** Map wallet RPC error codes to TBridgeError */
export function mapWalletError(code: number, message: string): TBridgeError {
  switch (code) {
    case 300:
      return new TBridgeError('USER_REJECTED', message || 'User rejected the request');
    case 100:
      return new TBridgeError('NOT_CONNECTED', message || 'Unknown app / session');
    case 1:
      return new TBridgeError('INVALID_PAYLOAD', message || 'Bad request');
    case 400:
      return new TBridgeError('WALLET_NOT_SUPPORTED', message || 'Method not supported');
    default:
      return new TBridgeError('PROTOCOL_ERROR', message || `Wallet error ${code}`);
  }
}
