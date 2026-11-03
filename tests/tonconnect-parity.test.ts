/**
 * Regression tests: TON Connect spec requirements (ton-blockchain/ton-connect spec/*.md)
 * and bugs reported against @tonconnect/sdk (github.com/ton-connect/sdk/issues).
 */
import nacl from 'tweetnacl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SessionCrypto } from '../core/crypto';
import { MemoryStorageAdapter } from '../core/storage';
import { DEFAULT_WALLETS_REGISTRY_URL, STORAGE_KEYS } from '../core/constants';
import { connectHttpBridge } from '../bridge/http-bridge';
import { saveLastWallet } from '../wallet/session';
import { validateSendTransaction } from '../utils/validation';
import { connectWithUi, walletsForEnv } from '../ui/connect-ui';
import {
  ADDRESS,
  DEVICE,
  FakeEventSource,
  REGISTRY,
  connectEvent,
  dispatchWindowEvent,
  g,
  installBrowserFakes,
  lastEs,
  makeBridge,
  makeInjected,
  mockFetch,
  restoreHttp,
  sealFrom,
  seedHttpSession,
  tick,
  uninstallBrowserFakes,
} from './helpers/browser-fakes';

beforeEach(installBrowserFakes);
afterEach(() => uninstallBrowserFakes(['a', 'b']));

const validUntil = () => Math.floor(Date.now() / 1000) + 60;
const tx = (n = 1, extra: Record<string, unknown> = {}) => ({
  validUntil: validUntil(),
  messages: Array.from({ length: n }, () => ({ address: ADDRESS, amount: '1', ...extra })),
});
const sentMethods = (send: { mock: { calls: Array<[{ method?: string }]> } }) =>
  send.mock.calls.map(([r]) => r.method);

async function connectInjected(device: unknown, eventId = 1) {
  mockFetch();
  const wallet = makeInjected(async () => connectEvent(eventId, device));
  const bridge = makeBridge();
  await bridge.connect();
  return { bridge, ...wallet };
}

function addExtensions() {
  REGISTRY.push(
    { ...REGISTRY[0]!, app_name: 'a', name: 'A', bridge: [{ type: 'js', key: 'a' }] },
    { ...REGISTRY[0]!, app_name: 'b', name: 'B', bridge: [{ type: 'js', key: 'b' }] },
  );
}

// ---------------------------------------------------------------------------
// connect.md:103 — "SDKs MUST treat absent features as unsupported and refuse
// to send the corresponding request."
// ---------------------------------------------------------------------------
describe('wallet feature checks (connect.md:103)', () => {
  it('refuses sendTransaction when the wallet does not list SendTransaction', async () => {
    const { bridge, send } = await connectInjected({ ...DEVICE, features: [] });
    await expect(bridge.sendTransaction(tx())).rejects.toMatchObject({
      code: 'WALLET_NOT_SUPPORTED',
    });
    expect(sentMethods(send)).not.toContain('sendTransaction');
  });

  it('refuses more messages than SendTransaction.maxMessages', async () => {
    const { bridge, send } = await connectInjected({
      ...DEVICE,
      features: [{ name: 'SendTransaction', maxMessages: 1 }],
    });
    await expect(bridge.sendTransaction(tx(2))).rejects.toMatchObject({
      code: 'WALLET_NOT_SUPPORTED',
    });
    expect(sentMethods(send)).not.toContain('sendTransaction');
  });

  it('allows exactly SendTransaction.maxMessages messages', async () => {
    const { bridge, send } = await connectInjected({
      ...DEVICE,
      features: [{ name: 'SendTransaction', maxMessages: 2 }],
    });
    await bridge.sendTransaction(tx(2));
    expect(sentMethods(send)).toContain('sendTransaction');
  });

  it('refuses extra currencies when extraCurrencySupported is not true', async () => {
    const { bridge, send } = await connectInjected(DEVICE); // extraCurrencySupported: false
    await expect(
      bridge.sendTransaction(tx(1, { extraCurrency: { 100: '1' } })),
    ).rejects.toMatchObject({ code: 'WALLET_NOT_SUPPORTED' });
    expect(sentMethods(send)).not.toContain('sendTransaction');
  });

  it('accepts the legacy string feature "SendTransaction"', async () => {
    const { bridge, send } = await connectInjected({ ...DEVICE, features: ['SendTransaction'] });
    await bridge.sendTransaction(tx());
    expect(sentMethods(send)).toContain('sendTransaction');
  });

  it('refuses signData when the wallet does not list SignData', async () => {
    const { bridge, send } = await connectInjected({
      ...DEVICE,
      features: [{ name: 'SendTransaction', maxMessages: 4 }],
    });
    await expect(bridge.signData({ type: 'text', text: 'hi' })).rejects.toMatchObject({
      code: 'WALLET_NOT_SUPPORTED',
    });
    expect(sentMethods(send)).not.toContain('signData');
  });

  it('refuses a signData type missing from SignData.types', async () => {
    const { bridge, send } = await connectInjected({
      ...DEVICE,
      features: [{ name: 'SignData', types: ['text'] }],
    });
    await expect(bridge.signData({ type: 'binary', bytes: 'AA==' })).rejects.toMatchObject({
      code: 'WALLET_NOT_SUPPORTED',
    });
    expect(sentMethods(send)).not.toContain('signData');
  });
});

// ---------------------------------------------------------------------------
// rpc.md:56 — "for every subsequent event the id MUST be strictly greater than
// the last id the dApp has processed … the dApp MUST reject events that violate this."
// ---------------------------------------------------------------------------
describe('wallet event id ordering (rpc.md:56)', () => {
  it('HTTP: ignores a disconnect event whose id is not greater than the connect event id', async () => {
    mockFetch();
    const onWalletDisconnect = vi.fn();
    const p = connectHttpBridge({
      bridgeUrl: 'https://bridge.test',
      appName: 'w',
      universalUrl: 'https://w.test/tc',
      connectRequest: { manifestUrl: 'https://app.test/m.json', items: [{ name: 'ton_addr' }] },
      timeoutMs: 5_000,
      sessionCrypto: await SessionCrypto.create(),
      onConnectLink() {},
      hooks: { onWalletDisconnect },
    });
    const es = lastEs();
    es.fire('open');
    await tick();
    const wallet = nacl.box.keyPair();
    es.fire('message', sealFrom(wallet, es.clientId, connectEvent(5)));
    const { session } = await p;

    es.fire('message', sealFrom(wallet, es.clientId, { event: 'disconnect', id: 5, payload: {} }));
    expect(onWalletDisconnect).not.toHaveBeenCalled();
    es.fire('message', sealFrom(wallet, es.clientId, { event: 'disconnect', id: 6, payload: {} }));
    expect(onWalletDisconnect).toHaveBeenCalledTimes(1);
    session.destroy();
  });

  it('HTTP: persists the connect event id so a restored session keeps the baseline', async () => {
    mockFetch();
    const storage = new MemoryStorageAdapter();
    const bridge = makeBridge(storage);
    const p = bridge.connect({ appName: 'w', onConnectLink() {} });
    await vi.waitFor(() => expect(FakeEventSource.instances.length).toBe(1));
    const es = lastEs();
    es.fire('open');
    await tick();
    await tick();
    const wallet = nacl.box.keyPair();
    es.fire('message', sealFrom(wallet, es.clientId, connectEvent(5)));
    await p;
    bridge.destroy();

    const restored = makeBridge(storage);
    FakeEventSource.instances = [];
    await restoreHttp(restored);
    const es2 = lastEs();
    es2.fire(
      'message',
      sealFrom(wallet, es2.clientId, { event: 'disconnect', id: 4, payload: {} }),
    );
    expect(restored.isConnected).toBe(true); // replayed / stale event rejected
    es2.fire(
      'message',
      sealFrom(wallet, es2.clientId, { event: 'disconnect', id: 6, payload: {} }),
    );
    expect(restored.isConnected).toBe(false);
  });

  it('JS bridge: ignores a disconnect event whose id is not greater than the connect event id', async () => {
    const { bridge, emit } = await connectInjected(DEVICE, 5);
    emit({ event: 'disconnect', id: 3, payload: {} });
    expect(bridge.isConnected).toBe(true);
    emit({ event: 'disconnect', id: 6, payload: {} });
    expect(bridge.isConnected).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// connect.md:165-166 — connect error codes 2 MANIFEST_NOT_FOUND, 3 MANIFEST_CONTENT_ERROR
// ---------------------------------------------------------------------------
describe('connect error codes (connect.md:163-169)', () => {
  it.each([2, 3])('maps wallet error %i to INVALID_MANIFEST', async (code) => {
    mockFetch();
    makeInjected(async () => ({ event: 'connect_error', id: 1, payload: { code, message: '' } }));
    await expect(makeBridge().connect()).rejects.toMatchObject({ code: 'INVALID_MANIFEST' });
  });
});

// ---------------------------------------------------------------------------
// ton-connect/sdk#137 — two wallet extensions installed at once
// ---------------------------------------------------------------------------
const remembered = async () => connectEvent(5);

describe('multiple injected wallets (ton-connect/sdk#137)', () => {
  it('restores the extension the user connected last, not the first one found', async () => {
    addExtensions();
    mockFetch();
    makeInjected(async () => connectEvent(1), { key: 'a', restore: remembered });
    makeInjected(async () => connectEvent(1), { key: 'b', restore: remembered });
    const storage = new MemoryStorageAdapter();
    await makeBridge(storage).connect({ appName: 'b' });

    const reloaded = makeBridge(storage);
    await reloaded.restoreConnection();
    expect(reloaded.connectedWallet?.app_name).toBe('b');
  });

  it('restores an extension that remembers the dApp when no last wallet is stored', async () => {
    addExtensions();
    mockFetch();
    makeInjected(async () => connectEvent(1), { key: 'a', restore: remembered });
    const bridge = makeBridge();
    await bridge.restoreConnection();
    expect(bridge.connectedWallet?.app_name).toBe('a');
  });

  it('restores the persisted HTTP wallet when it was used last, even if an extension remembers the dApp', async () => {
    addExtensions();
    mockFetch();
    makeInjected(async () => connectEvent(1), { key: 'a', restore: remembered });
    const storage = new MemoryStorageAdapter();
    await seedHttpSession(storage);
    await saveLastWallet(storage, 'w');

    const bridge = makeBridge(storage);
    const p = bridge.restoreConnection();
    await vi.waitFor(() => expect(FakeEventSource.instances.length).toBe(1));
    lastEs().fire('open');
    await p;
    expect(bridge.connectedWallet?.app_name).toBe('w');
  });

  it('connectWithUi shows the picker instead of auto-connecting a desktop extension', async () => {
    mockFetch();
    makeInjected(async () => connectEvent(1), { isWalletBrowser: false });
    const bridge = makeBridge();
    const connect = vi.spyOn(bridge, 'connect');
    void connectWithUi(bridge).catch(() => undefined);
    await vi.waitFor(() => expect(FakeEventSource.instances).toHaveLength(0)); // settle
    await tick();
    await tick();
    expect(connect).not.toHaveBeenCalled();
  });

  it('connectWithUi auto-connects inside the wallet browser (isWalletBrowser)', async () => {
    mockFetch();
    makeInjected(async () => connectEvent(1), { isWalletBrowser: true });
    const status = await connectWithUi(makeBridge());
    expect(status.status).toBe('connected');
  });
});

// ---------------------------------------------------------------------------
// ton-connect/sdk#569 — disconnect does not propagate across tabs
// ---------------------------------------------------------------------------
describe('cross-tab disconnect (ton-connect/sdk#569)', () => {
  it('drops the connection when another tab removes the persisted session', async () => {
    mockFetch();
    const storage = new MemoryStorageAdapter();
    await seedHttpSession(storage);
    const bridge = makeBridge(storage);
    await restoreHttp(bridge);
    const onDisconnect = vi.fn();
    bridge.on('disconnect', onDisconnect);

    dispatchWindowEvent('storage', { key: STORAGE_KEYS.SESSION, newValue: null });
    expect(bridge.isConnected).toBe(false);
    expect(onDisconnect).toHaveBeenCalledTimes(1);
  });

  it('keeps the connection when another tab writes (not removes) the session', async () => {
    mockFetch();
    const storage = new MemoryStorageAdapter();
    await seedHttpSession(storage);
    const bridge = makeBridge(storage);
    await restoreHttp(bridge);
    dispatchWindowEvent('storage', { key: STORAGE_KEYS.SESSION, newValue: 'enc:v1:xyz' });
    expect(bridge.isConnected).toBe(true);
  });

  it('ignores storage events for unrelated keys', async () => {
    mockFetch();
    const storage = new MemoryStorageAdapter();
    await seedHttpSession(storage);
    const bridge = makeBridge(storage);
    await restoreHttp(bridge);
    dispatchWindowEvent('storage', { key: 'some-other-app', newValue: null });
    expect(bridge.isConnected).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// ton-connect/sdk#575 — wallet list unavailable; reference SDK uses FALLBACK_WALLETS_LIST
// ---------------------------------------------------------------------------
const offline = () => {
  g.fetch = vi.fn(async () => {
    throw new TypeError('Failed to fetch');
  });
};

describe('wallets registry fallback (ton-connect/sdk#575)', () => {
  it('returns a built-in wallet list when the default registry is unreachable and nothing is cached', async () => {
    offline();
    const wallets = await makeBridge(new MemoryStorageAdapter(), {
      walletsRegistry: DEFAULT_WALLETS_REGISTRY_URL,
    }).getWallets();
    const names = wallets.map((w) => w.app_name);
    expect(names).toContain('tonkeeper');
    expect(names).toContain('telegram-wallet');
  });

  // Product decision: a custom registry is curated by the host — never substitute
  // wallets it may have deliberately excluded (stricter than @tonconnect/sdk).
  it('does not substitute the built-in list for an unreachable custom registry', async () => {
    offline();
    await expect(makeBridge().getWallets()).rejects.toMatchObject({
      code: 'BRIDGE_UNAVAILABLE',
    });
  });
});

// ---------------------------------------------------------------------------
// session.md:57 — after the session ends both sides MUST stop processing it.
// A connect aborted on our side must also end the wallet's side.
// ---------------------------------------------------------------------------
describe('aborted connect notifies the wallet', () => {
  it('sends disconnect when persisting the session fails', async () => {
    mockFetch();
    const { send } = makeInjected(async () => connectEvent(1));
    const storage = new MemoryStorageAdapter();
    storage.setItem = async () => {
      throw new Error('QuotaExceededError');
    };
    await expect(makeBridge(storage).connect()).rejects.toBeDefined();
    await vi.waitFor(() => expect(sentMethods(send)).toContain('disconnect'));
  });

  it('sends disconnect when the wallet answers on the wrong network', async () => {
    mockFetch();
    const { send } = makeInjected(async () => connectEvent(1, DEVICE, '-3'));
    await expect(makeBridge().connect()).rejects.toMatchObject({ code: 'NETWORK_MISMATCH' });
    await vi.waitFor(() => expect(sentMethods(send)).toContain('disconnect'));
  });
});

// ---------------------------------------------------------------------------
// rpc.md:90 — valid_until is "Unix seconds".
// ---------------------------------------------------------------------------
describe('validUntil units (rpc.md:90)', () => {
  it('rejects a millisecond timestamp', () => {
    expect(() =>
      validateSendTransaction({
        validUntil: Date.now() + 60_000,
        messages: [{ address: ADDRESS, amount: '1' }],
      }),
    ).toThrow(/seconds/);
  });
});

// ---------------------------------------------------------------------------
// README documents `on` / `once`
// ---------------------------------------------------------------------------
describe('TBridge.once (documented in README)', () => {
  it('invokes the handler only for the first event', async () => {
    mockFetch();
    makeInjected(async () => connectEvent(1));
    const bridge = makeBridge();
    const handler = vi.fn();
    bridge.once('statusChange', handler);
    await bridge.connect(); // connecting + connected
    expect(handler).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// ton-connect/sdk#69 — on mobile, wallets without a mobile app must not be offered
// ---------------------------------------------------------------------------
const w = (app_name: string, platforms: string[]) =>
  ({
    app_name,
    name: app_name,
    image: '',
    about_url: '',
    bridge: [],
    platforms,
    features: [],
  }) as never;

describe('wallet list per platform (ton-connect/sdk#69)', () => {
  const list = [
    w('both', ['ios', 'android']),
    w('ext', ['chrome', 'firefox']),
    w('ios-only', ['ios']),
    w('android-only', ['android']),
  ];
  const names = (os: string) =>
    walletsForEnv(list, { os } as never).map((x: { app_name: string }) => x.app_name);

  it('iPhone: only wallets with an iOS app', () => {
    expect(names('ios')).toEqual(['both', 'ios-only']);
  });
  it('iPad counts as iOS', () => {
    expect(names('ipad')).toEqual(['both', 'ios-only']);
  });
  it('Android: only wallets with an Android app', () => {
    expect(names('android')).toEqual(['both', 'android-only']);
  });
  it('desktop: everything (mobile wallets connect via QR)', () => {
    expect(names('macos')).toEqual(['both', 'ext', 'ios-only', 'android-only']);
  });
});

// ---------------------------------------------------------------------------
// ton-connect/sdk#327 — wallet re-connected on another device stops answering this one.
// Undetectable on our side; the timeout must say what likely happened.
// ---------------------------------------------------------------------------
async function restoredWithTimeout() {
  mockFetch();
  const storage = new MemoryStorageAdapter();
  await seedHttpSession(storage);
  const bridge = makeBridge(storage, { requestTimeoutMs: 50 });
  await restoreHttp(bridge);
  return bridge;
}

describe('unresponsive wallet (ton-connect/sdk#327)', () => {
  it('sendTransaction: no reply from the wallet → WALLET_UNRESPONSIVE', async () => {
    const bridge = await restoredWithTimeout();
    await expect(bridge.sendTransaction(tx())).rejects.toMatchObject({
      code: 'WALLET_UNRESPONSIVE',
    });
  });

  it('signData: no reply from the wallet → WALLET_UNRESPONSIVE', async () => {
    const bridge = await restoredWithTimeout();
    await expect(bridge.signData({ type: 'text', text: 'hi' })).rejects.toMatchObject({
      code: 'WALLET_UNRESPONSIVE',
    });
  });
});
