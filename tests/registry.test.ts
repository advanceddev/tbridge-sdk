import { describe, expect, it } from 'vitest';
import { parseWalletEntry, parseWalletsRegistry } from '../wallet/registry';
import { TBridgeError } from '../core/errors';

const validWallet = {
  app_name: 'keeper',
  name: 'Keeper',
  image: 'https://example.com/icon.png',
  about_url: 'https://example.com',
  universal_url: 'https://app.example.com/connect',
  deepLink: 'keeper-tc://',
  bridge: [
    { type: 'js', key: 'keeper' },
    { type: 'sse', url: 'https://bridge.example.com/bridge' },
  ],
  platforms: ['ios', 'android', 'chrome'],
  features: [
    { name: 'SendTransaction', maxMessages: 255, extraCurrencySupported: true },
    { name: 'SignData', types: ['text', 'binary', 'cell'] },
  ],
};

describe('parseWalletEntry', () => {
  it('parses a valid wallet', () => {
    const w = parseWalletEntry(validWallet);
    expect(w).not.toBeNull();
    expect(w!.app_name).toBe('keeper');
    expect(w!.bridge).toHaveLength(2);
    expect(w!.bridge[0]).toEqual({ type: 'js', key: 'keeper' });
    expect(w!.bridge[1]).toEqual({
      type: 'sse',
      url: 'https://bridge.example.com/bridge',
    });
    expect(w!.universal_url).toBe('https://app.example.com/connect');
    expect(w!.features.some((f) => f.name === 'SendTransaction')).toBe(true);
  });

  it('returns null for missing app_name', () => {
    expect(parseWalletEntry({ ...validWallet, app_name: '' })).toBeNull();
    expect(parseWalletEntry({ ...validWallet, app_name: 1 })).toBeNull();
  });

  it('returns null for missing name', () => {
    expect(parseWalletEntry({ ...validWallet, name: '' })).toBeNull();
  });

  it('returns null for empty bridge array', () => {
    expect(parseWalletEntry({ ...validWallet, bridge: [] })).toBeNull();
  });

  it('returns null when no valid bridge entries', () => {
    expect(
      parseWalletEntry({
        ...validWallet,
        bridge: [{ type: 'sse', url: 'not-a-url' }, { type: 'js' }],
      }),
    ).toBeNull();
  });

  it('returns null for non-object', () => {
    expect(parseWalletEntry(null)).toBeNull();
    expect(parseWalletEntry('x')).toBeNull();
    expect(parseWalletEntry(42)).toBeNull();
  });

  it('keeps only string platforms', () => {
    const w = parseWalletEntry({
      ...validWallet,
      platforms: ['ios', 1, null, 'chrome'],
    });
    expect(w!.platforms).toEqual(['ios', 'chrome']);
  });

  it('caps maxMessages at 255', () => {
    const w = parseWalletEntry({
      ...validWallet,
      features: [{ name: 'SendTransaction', maxMessages: 9999 }],
    });
    const f = w!.features.find((x) => x.name === 'SendTransaction') as {
      maxMessages: number;
    };
    expect(f.maxMessages).toBe(255);
  });

  it('accepts js-only bridge', () => {
    const w = parseWalletEntry({
      ...validWallet,
      bridge: [{ type: 'js', key: 'ext' }],
      universal_url: undefined,
      deepLink: undefined,
    });
    expect(w).not.toBeNull();
    expect(w!.bridge).toHaveLength(1);
  });
});

describe('parseWalletsRegistry', () => {
  it('parses a valid array', () => {
    const list = parseWalletsRegistry([validWallet], 'test');
    expect(list).toHaveLength(1);
    expect(list[0]!.app_name).toBe('keeper');
  });

  it('throws if not an array', () => {
    expect(() => parseWalletsRegistry({ wallets: [] }, 'test')).toThrow(TBridgeError);
    expect(() => parseWalletsRegistry(null, 'test')).toThrow(TBridgeError);
  });

  it('throws if zero valid entries', () => {
    expect(() => parseWalletsRegistry([{ foo: 1 }, null, 'x'], 'test')).toThrow(TBridgeError);
  });

  it('skips invalid entries and keeps valid ones', () => {
    const list = parseWalletsRegistry([{ bad: true }, validWallet, { app_name: 'x' }], 'test');
    expect(list).toHaveLength(1);
  });

  it('deduplicates by app_name', () => {
    const list = parseWalletsRegistry([validWallet, { ...validWallet, name: 'Keeper 2' }], 'test');
    expect(list).toHaveLength(1);
    expect(list[0]!.name).toBe('Keeper');
  });

  it('parses multiple distinct wallets', () => {
    const second = {
      ...validWallet,
      app_name: 'other',
      name: 'Other',
      bridge: [{ type: 'sse', url: 'https://b.example/bridge' }],
    };
    const list = parseWalletsRegistry([validWallet, second], 'test');
    expect(list).toHaveLength(2);
  });
});
