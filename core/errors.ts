/**
 * Typed error hierarchy for TBridge.
 * Consumers can switch on `code` for i18n / UX.
 */

export type TBridgeErrorCode =
  | 'NOT_BROWSER'
  | 'NOT_INITIALIZED'
  | 'ALREADY_CONNECTED'
  | 'NOT_CONNECTED'
  | 'WALLET_NOT_FOUND'
  | 'WALLET_NOT_SUPPORTED'
  | 'BRIDGE_UNAVAILABLE'
  | 'JS_BRIDGE_MISSING'
  | 'HTTP_BRIDGE_ERROR'
  | 'TIMEOUT'
  | 'USER_REJECTED'
  | 'INVALID_MANIFEST'
  | 'INVALID_PAYLOAD'
  | 'CRYPTO_ERROR'
  | 'STORAGE_ERROR'
  | 'PROTOCOL_ERROR'
  | 'NETWORK_MISMATCH'
  | 'UNKNOWN';

export class TBridgeError extends Error {
  readonly code: TBridgeErrorCode;
  readonly cause?: unknown;

  constructor(code: TBridgeErrorCode, message: string, cause?: unknown) {
    super(message);
    this.name = 'TBridgeError';
    this.code = code;
    this.cause = cause;
    Object.setPrototypeOf(this, new.target.prototype);
  }

  static is(error: unknown): error is TBridgeError {
    return error instanceof TBridgeError;
  }
}

export function assertBrowser(): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    throw new TBridgeError(
      'NOT_BROWSER',
      'TBridge is client-side only and must run in a browser environment',
    );
  }
}
