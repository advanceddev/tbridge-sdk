import { describe, expect, it } from 'vitest';
import {
  validateSendTransaction,
  validateSignData,
  isConnectEvent,
  isWalletResponse,
  mapWalletError,
} from '../utils/validation';
import { TBridgeError } from '../core/errors';

describe('validateSendTransaction', () => {
  const future = Math.floor(Date.now() / 1000) + 600;

  it('accepts valid tx', () => {
    expect(() =>
      validateSendTransaction({
        validUntil: future,
        messages: [{ address: 'EQA', amount: '1000' }],
      }),
    ).not.toThrow();
  });

  it('rejects past validUntil', () => {
    expect(() =>
      validateSendTransaction({
        validUntil: 1,
        messages: [{ address: 'EQA', amount: '1000' }],
      }),
    ).toThrow(TBridgeError);
  });

  it('rejects empty messages', () => {
    expect(() => validateSendTransaction({ validUntil: future, messages: [] })).toThrow(
      TBridgeError,
    );
  });

  it('rejects non-decimal amount', () => {
    expect(() =>
      validateSendTransaction({
        validUntil: future,
        messages: [{ address: 'EQA', amount: '1.5' }],
      }),
    ).toThrow(TBridgeError);
  });
});

describe('validateSignData', () => {
  it('accepts text', () => {
    expect(() => validateSignData({ type: 'text', text: 'hello' })).not.toThrow();
  });

  it('rejects empty text', () => {
    expect(() => validateSignData({ type: 'text', text: '' })).toThrow(TBridgeError);
  });

  it('accepts cell', () => {
    expect(() => validateSignData({ type: 'cell', schema: 'x', cell: 'te6c...' })).not.toThrow();
  });
});

describe('protocol guards', () => {
  it('isConnectEvent', () => {
    expect(
      isConnectEvent({
        event: 'connect',
        id: 1,
        payload: { items: [], device: {} },
      }),
    ).toBe(true);
    expect(isConnectEvent({ event: 'nope' })).toBe(false);
  });

  it('isWalletResponse', () => {
    expect(isWalletResponse({ id: '1', result: 'boc' })).toBe(true);
    expect(isWalletResponse({ id: '1', error: { code: 300, message: 'no' } })).toBe(true);
    expect(isWalletResponse({ id: 1 })).toBe(false);
  });

  it('mapWalletError codes', () => {
    expect(mapWalletError(300, 'x').code).toBe('USER_REJECTED');
    expect(mapWalletError(100, 'x').code).toBe('NOT_CONNECTED');
    expect(mapWalletError(1, 'x').code).toBe('INVALID_PAYLOAD');
  });
});
