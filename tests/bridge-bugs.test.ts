/**
 * Regression tests for transport / connector bugs.
 * Each test reproduces a concrete failure scenario with fake EventSource + fetch.
 */
import nacl from 'tweetnacl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bytesToBase64, bytesToHex, hexToBytes } from '../core/encoding';
import { SessionCrypto } from '../core/crypto';
import { MemoryStorageAdapter, type StorageAdapter } from '../core/storage';
import { TypedEventEmitter } from '../core/event-emitter';
import { connectHttpBridge, restoreHttpBridge } from '../bridge/http-bridge';
import { TBridge } from '../wallet/connector';
import {
  loadLastRpcId,
  loadPersistedSession,
  saveLastRpcId,
  savePersistedSession,
  setSessionPersistence,
} from '../wallet/session';
import { openLink } from '../utils/open-wallet-link';

// ---------------------------------------------------------------------------
// Minimal browser fakes
// ---------------------------------------------------------------------------

type Listener = (ev: unknown) => void;

class FakeEventSource {
  static instances: FakeEventSource[] = [];
  private readonly ls = new Map<string, Set<Listener>>();
  closed = false;
  constructor(readonly url: string) {
    FakeEventSource.instances.push(this);
  }
  addEventListener(type: string, fn: Listener): void {
    if (!this.ls.has(type)) this.ls.set(type, new Set());
    this.ls.get(type)!.add(fn);
  }
  removeEventListener(type: string, fn: Listener): void {
    this.ls.get(type)?.delete(fn);
  }
  close(): void {
    this.closed = true;
  }
  fire(type: string, ev: unknown = {}): void {
    for (const fn of Array.from(this.ls.get(type) ?? [])) fn(ev);
  }
  get clientId(): string {
    return new URL(this.url).searchParams.get('client_id')!;
  }
}

/** DOM stub: every property / call yields another stub (enough for the action sheet). */
function fakeEl(): Record<string, unknown> {
  const props: Record<string, unknown> = { style: {}, dataset: {} };
  return new Proxy(function () {} as unknown as Record<string, unknown>, {
    get(_t, k) {
      if (k in props) return props[k as string];
      if (k === 'then' || typeof k === 'symbol') return undefined;
      return fakeEl();
    },
    set(_t, k, v) {
      props[k as string] = v;
      return true;
    },
    apply: () => fakeEl(),
  });
}

const g = globalThis as Record<string, unknown>;
const lastEs = () => FakeEventSource.instances.at(-1)!;
const tick = () => new Promise((r) => setTimeout(r, 0));

const DEVICE = {
  platform: 'iphone',
  appName: 'w',
  appVersion: '1',
  maxProtocolVersion: 2,
  features: [],
};
const ADDRESS = `0:${'a'.repeat(64)}`;
const connectEvent = (id = 1) => ({
  event: 'connect',
  id,
  payload: {
    items: [
      { name: 'ton_addr', address: ADDRESS, network: '-239', walletStateInit: '', publicKey: '' },
    ],
    device: DEVICE,
  },
});

const REGISTRY = [
  {
    app_name: 'w',
    name: 'W',
    image: '',
    about_url: '',
    universal_url: 'https://w.test/tc',
    bridge: [
      { type: 'sse', url: 'https://bridge.test' },
      { type: 'js', key: 'w' },
    ],
    platforms: ['ios'],
    features: [],
  },
];

function mockFetch(registry: () => Promise<void> = async () => {}) {
  const fn = vi.fn(async (url: string, _init?: RequestInit) => {
    if (url.startsWith('https://reg.test')) {
      await registry();
      return { ok: true, status: 200, text: async () => JSON.stringify(REGISTRY) };
    }
    return { ok: true, status: 200 };
  });
  g.fetch = fn;
  return fn;
}

function sealFrom(kp: nacl.BoxKeyPair, toHex: string, obj: unknown) {
  const nonce = nacl.randomBytes(24);
  const ct = nacl.box(
    new TextEncoder().encode(JSON.stringify(obj)),
    nonce,
    hexToBytes(toHex),
    kp.secretKey,
  );
  const out = new Uint8Array(24 + ct.length);
  out.set(nonce);
  out.set(ct, 24);
  return { data: JSON.stringify({ from: bytesToHex(kp.publicKey), message: bytesToBase64(out) }) };
}

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function makeBridge(storage: StorageAdapter = new MemoryStorageAdapter()) {
  return new TBridge({
    manifestUrl: 'https://app.test/manifest.json',
    walletsRegistry: 'https://reg.test/wallets.json',
    storage,
  });
}

async function seedHttpSession(storage: StorageAdapter) {
  const dapp = nacl.box.keyPair();
  const wallet = nacl.box.keyPair();
  await savePersistedSession(storage, {
    version: 2,
    walletAppName: 'w',
    clientId: bytesToHex(dapp.publicKey),
    walletClientId: bytesToHex(wallet.publicKey),
    bridgeUrl: 'https://bridge.test',
    account: { address: ADDRESS, chain: '-239' },
    device: DEVICE as never,
    createdAt: Date.now(),
    origin: 'https://app.test',
    secretKeyHex: bytesToHex(dapp.secretKey),
  });
  return { dappHex: bytesToHex(dapp.publicKey), wallet };
}

async function restoreHttp(bridge: TBridge) {
  const p = bridge.restoreConnection();
  await vi.waitFor(() => expect(FakeEventSource.instances.length).toBe(1));
  lastEs().fire('open');
  await p;
  expect(bridge.isConnected).toBe(true);
}

function makeInjected(connect: () => Promise<unknown>) {
  const send = vi.fn(async (req: { id: string; method?: string }) => ({ id: req.id, result: {} }));
  g.w = {
    tonconnect: {
      deviceInfo: DEVICE,
      protocolVersion: 2,
      connect,
      restoreConnection: async () => ({
        event: 'connect_error',
        id: 0,
        payload: { code: 0, message: '' },
      }),
      send,
      listen: () => () => {},
    },
  };
  return { send };
}

const memSessionStorage = () => {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  };
};

beforeEach(() => {
  FakeEventSource.instances = [];
  g.window = globalThis;
  g.document = fakeEl();
  g.location = { origin: 'https://app.test', search: '', hash: '' };
  g.EventSource = FakeEventSource;
  g.sessionStorage = memSessionStorage();
  g.matchMedia = () => ({ matches: false });
  setSessionPersistence('local');
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  for (const k of [
    'window',
    'document',
    'location',
    'EventSource',
    'sessionStorage',
    'matchMedia',
    'w',
    'open',
  ]) {
    delete g[k];
  }
});

// ---------------------------------------------------------------------------

describe('HTTP bridge: sender authentication', () => {
  it('ignores connect / response / disconnect from a key other than the connected wallet', async () => {
    const fetchMock = mockFetch();
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
    const attacker = nacl.box.keyPair();
    es.fire('message', sealFrom(wallet, es.clientId, connectEvent(1)));
    const { session } = await p;

    // Attacker knows our public client_id (it is in the QR / link / bridge URLs).
    es.fire('message', sealFrom(attacker, es.clientId, connectEvent(99)));
    es.fire(
      'message',
      sealFrom(attacker, es.clientId, { event: 'disconnect', id: 100, payload: {} }),
    );
    expect(session.walletClientId).toBe(bytesToHex(wallet.publicKey));
    expect(onWalletDisconnect).not.toHaveBeenCalled();

    const res = session.send({ method: 'sendTransaction', params: ['{}'], id: '5' });
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const postUrl = new URL(fetchMock.mock.calls[0]![0]);
    expect(postUrl.searchParams.get('to')).toBe(bytesToHex(wallet.publicKey));

    es.fire('message', sealFrom(attacker, es.clientId, { id: '5', result: 'FORGED_BOC' }));
    es.fire('message', sealFrom(wallet, es.clientId, { id: '5', result: 'REAL_BOC' }));
    expect(await res).toEqual({ id: '5', result: 'REAL_BOC' });
    session.destroy();
  });
});

describe('HTTP bridge: SSE reconnect', () => {
  it('keeps retrying when a reconnect attempt fails before open', async () => {
    vi.useFakeTimers();
    const session = restoreHttpBridge({
      bridgeUrl: 'https://bridge.test',
      appName: 'w',
      walletClientId: bytesToHex(nacl.box.keyPair().publicKey),
      sessionCrypto: await SessionCrypto.create(),
      timeoutMs: 5_000,
    });
    lastEs().fire('open');
    const s = await session;

    lastEs().fire('error'); // stream drops
    await vi.advanceTimersByTimeAsync(2_000);
    expect(FakeEventSource.instances.length).toBe(2);

    lastEs().fire('error'); // bridge still down: reconnect attempt fails before open
    await vi.advanceTimersByTimeAsync(10_000);
    expect(FakeEventSource.instances.length).toBe(3);
    s.destroy();
  });
});

describe('TBridge.restoreConnection', () => {
  it('keeps the persisted session when the bridge is temporarily unreachable', async () => {
    mockFetch();
    const storage = new MemoryStorageAdapter();
    await seedHttpSession(storage);
    const bridge = makeBridge(storage);

    const p = bridge.restoreConnection();
    await vi.waitFor(() => expect(FakeEventSource.instances.length).toBe(1));
    lastEs().fire('error'); // offline at app start
    await p;

    expect(bridge.isConnected).toBe(false);
    expect(await loadPersistedSession(storage)).not.toBeNull();
  });

  it('keeps the persisted session when the wallets registry is unreachable', async () => {
    mockFetch(async () => {
      throw new TypeError('Failed to fetch');
    });
    const storage = new MemoryStorageAdapter();
    await seedHttpSession(storage);
    await makeBridge(storage).restoreConnection();
    expect(await loadPersistedSession(storage)).not.toBeNull();
  });
});

describe('TBridge RPC id persistence', () => {
  it('persists the consumed id even when the wallet rejects the request', async () => {
    const fetchMock = mockFetch();
    const storage = new MemoryStorageAdapter();
    const { dappHex, wallet } = await seedHttpSession(storage);
    await saveLastRpcId(storage, 7);
    const bridge = makeBridge(storage);
    await restoreHttp(bridge);

    const tx = bridge.sendTransaction({
      validUntil: Math.floor(Date.now() / 1000) + 60,
      messages: [{ address: ADDRESS, amount: '1' }],
    });
    await vi.waitFor(() =>
      expect(fetchMock.mock.calls.some(([u]) => String(u).includes('/message'))).toBe(true),
    );
    lastEs().fire(
      'message',
      sealFrom(wallet, dappHex, { id: '7', error: { code: 300, message: 'no' } }),
    );
    await expect(tx).rejects.toMatchObject({ code: 'USER_REJECTED' });

    // After reload id 7 must not be reused — wallets drop non-increasing ids.
    expect(await loadLastRpcId(storage)).toBe(8);
  });
});

describe('TBridge.disconnect', () => {
  it('resolves once the request is posted, without waiting for a wallet reply', async () => {
    const fetchMock = mockFetch();
    const storage = new MemoryStorageAdapter();
    await seedHttpSession(storage);
    const bridge = makeBridge(storage);
    await restoreHttp(bridge);

    const outcome = await Promise.race([
      bridge.disconnect().then(() => 'done'),
      new Promise((r) => setTimeout(() => r('hang'), 500)),
    ]);
    expect(outcome).toBe('done');
    expect(bridge.isConnected).toBe(false);
    expect(fetchMock.mock.calls.some(([u]) => String(u).includes('topic=disconnect'))).toBe(true);
  });
});

describe('TBridge.cancelConnect', () => {
  it('a JS-bridge connect that resolves after cancel does not connect', async () => {
    mockFetch();
    const pending = deferred<unknown>();
    const { send } = makeInjected(() => pending.promise);
    const bridge = makeBridge();
    const onError = vi.fn();
    bridge.on('error', onError);

    const p = bridge.connect();
    await vi.waitFor(() => expect(bridge.connectionStatus.status).toBe('connecting'));
    await tick();
    bridge.cancelConnect();
    pending.resolve(connectEvent(1));

    await expect(p).rejects.toBeDefined();
    expect(bridge.isConnected).toBe(false);
    expect(onError).not.toHaveBeenCalled();
    // The wallet considers itself connected — it must be told to drop the session.
    await vi.waitFor(() =>
      expect(send.mock.calls.some(([r]) => r.method === 'disconnect')).toBe(true),
    );
  });

  it('an HTTP connect cancelled while loading wallets does not open a channel', async () => {
    const registry = deferred<void>();
    mockFetch(() => registry.promise);
    const bridge = makeBridge();
    const onConnectLink = vi.fn();

    const p = bridge.connect({ appName: 'w', onConnectLink });
    bridge.cancelConnect();
    registry.resolve();
    await p.catch(() => undefined);
    await tick();

    expect(FakeEventSource.instances.length).toBe(0);
    expect(onConnectLink).not.toHaveBeenCalled();
  });
});

describe('TBridge.connect with failing storage', () => {
  // By design (and same as @tonconnect/sdk): an unavailable storage aborts the connection.
  it('drops the connection when persisting the session fails', async () => {
    mockFetch();
    makeInjected(async () => connectEvent(1));
    const storage = new MemoryStorageAdapter();
    storage.setItem = async () => {
      throw new Error('QuotaExceededError');
    };
    const bridge = makeBridge(storage);
    await expect(bridge.connect()).rejects.toBeDefined();
    expect(bridge.isConnected).toBe(false);
  });
});

describe("sessionPersistence: 'session'", () => {
  it('restores the secret without __WALLET_SESSION_SECRET__', async () => {
    setSessionPersistence('session');
    const storage = new MemoryStorageAdapter();
    await seedHttpSession(storage);
    const loaded = await loadPersistedSession(storage);
    expect(loaded?.secretKeyHex).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('TypedEventEmitter', () => {
  it('calling an unsubscribe twice does not remove listeners added later', () => {
    const em = new TypedEventEmitter<{ x: number }>();
    const off = em.on('x', () => {});
    off();
    const later = vi.fn();
    em.on('x', later);
    off(); // e.g. React StrictMode double cleanup
    em.emit('x', 1);
    expect(later).toHaveBeenCalledWith(1);
  });
});

describe('openLink', () => {
  it('opens the wallet exactly once (window.open with noopener returns null per spec)', () => {
    let opened = 0;
    g.open = vi.fn((_url: string, _t: string, features?: string) => {
      opened += 1;
      // HTML spec: when "noopener" / "noreferrer" is set, window.open returns null.
      return features && /noopener|noreferrer/.test(features) ? null : ({ opener: {} } as unknown);
    });
    const click = vi.fn(() => {
      opened += 1;
    });
    (g.document as Record<string, unknown>).createElement = () => ({
      style: {},
      click,
      remove() {},
    });
    (g.document as Record<string, unknown>).body = { appendChild() {} };

    openLink('https://w.test/tc?v=2', '_blank');
    expect(opened).toBe(1);
  });
});
