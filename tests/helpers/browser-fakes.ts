/**
 * Test-only browser fakes: EventSource, DOM stub, fetch router, wallet keys.
 * Install with installBrowserFakes() in beforeEach, remove with uninstallBrowserFakes().
 */
import nacl from 'tweetnacl';
import { expect, vi } from 'vitest';
import { bytesToBase64, bytesToHex, hexToBytes } from '../../core/encoding';
import { MemoryStorageAdapter, type StorageAdapter } from '../../core/storage';
import { TBridge } from '../../wallet/connector';
import { savePersistedSession, setSessionPersistence } from '../../wallet/session';

type Listener = (ev: unknown) => void;

export class FakeEventSource {
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

/** DOM stub: every property / call yields another stub (enough for modal + action sheet). */
export function fakeEl(): Record<string, unknown> {
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

export const g = globalThis as Record<string, unknown>;
export const lastEs = () => FakeEventSource.instances.at(-1)!;
export const tick = () => new Promise((r) => setTimeout(r, 0));

/** Shape of a real wallet DeviceInfo (Tonkeeper-like), incl. legacy string feature. */
export const DEVICE = {
  platform: 'iphone',
  appName: 'w',
  appVersion: '1',
  maxProtocolVersion: 2,
  features: [
    'SendTransaction',
    { name: 'SendTransaction', maxMessages: 4, extraCurrencySupported: false },
    { name: 'SignData', types: ['text', 'binary', 'cell'] },
  ],
};
export const ADDRESS = `0:${'a'.repeat(64)}`;

export const connectEvent = (id = 1, device: unknown = DEVICE, network = '-239') => ({
  event: 'connect',
  id,
  payload: {
    items: [{ name: 'ton_addr', address: ADDRESS, network, walletStateInit: '', publicKey: '' }],
    device,
  },
});

export const REGISTRY: Array<Record<string, unknown>> = [
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

export function mockFetch(registry: () => Promise<void> = async () => {}) {
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

export function sealFrom(kp: nacl.BoxKeyPair, toHex: string, obj: unknown) {
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

export function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

export function makeBridge(
  storage: StorageAdapter = new MemoryStorageAdapter(),
  opts: {
    sessionPersistence?: 'local' | 'session';
    walletsRegistry?: string;
    requestTimeoutMs?: number;
  } = {},
) {
  return new TBridge({
    manifestUrl: 'https://app.test/manifest.json',
    walletsRegistry: 'https://reg.test/wallets.json',
    storage,
    ...opts,
  });
}

/** Tab closed: the browser drops sessionStorage, durable storage stays. */
export function simulateTabClose(): void {
  g.sessionStorage = memSessionStorage();
}

export async function seedHttpSession(
  storage: StorageAdapter,
  extra: Record<string, unknown> = {},
) {
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
    ...extra,
  });
  return { dappHex: bytesToHex(dapp.publicKey), wallet };
}

export async function restoreHttp(bridge: TBridge) {
  const p = bridge.restoreConnection();
  await vi.waitFor(() => expect(FakeEventSource.instances.length).toBe(1));
  lastEs().fire('open');
  await p;
  expect(bridge.isConnected).toBe(true);
}

/** Injected wallet at window[key].tonconnect with spy-able send / listen. */
export function makeInjected(
  connect: () => Promise<unknown>,
  opts: {
    key?: string;
    restore?: () => Promise<unknown>;
    isWalletBrowser?: boolean;
  } = {},
) {
  const send = vi.fn(async (req: { id: string; method?: string }) => ({ id: req.id, result: {} }));
  let listener: ((ev: unknown) => void) | null = null;
  g[opts.key ?? 'w'] = {
    tonconnect: {
      deviceInfo: DEVICE,
      protocolVersion: 2,
      isWalletBrowser: opts.isWalletBrowser ?? false,
      connect,
      restoreConnection:
        opts.restore ??
        (async () => ({ event: 'connect_error', id: 0, payload: { code: 100, message: '' } })),
      send,
      listen: (cb: (ev: unknown) => void) => {
        listener = cb;
        return () => {
          listener = null;
        };
      },
    },
  };
  return { send, emit: (ev: unknown) => listener?.(ev) };
}

const memSessionStorage = () => {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  };
};

/** window-level listeners (storage events etc.) captured for manual dispatch. */
export const windowListeners = new Map<string, Set<(ev: unknown) => void>>();
export function dispatchWindowEvent(type: string, ev: unknown): void {
  for (const fn of Array.from(windowListeners.get(type) ?? [])) fn(ev);
}

const INSTALLED = [
  'window',
  'document',
  'location',
  'EventSource',
  'sessionStorage',
  'matchMedia',
  'addEventListener',
  'removeEventListener',
  'open',
];

export function installBrowserFakes(): void {
  FakeEventSource.instances = [];
  windowListeners.clear();
  g.window = globalThis;
  g.document = fakeEl();
  g.location = { origin: 'https://app.test', search: '', hash: '' };
  g.EventSource = FakeEventSource;
  g.sessionStorage = memSessionStorage();
  g.matchMedia = () => ({ matches: false });
  g.addEventListener = (type: string, fn: (ev: unknown) => void) => {
    if (!windowListeners.has(type)) windowListeners.set(type, new Set());
    windowListeners.get(type)!.add(fn);
  };
  g.removeEventListener = (type: string, fn: (ev: unknown) => void) => {
    windowListeners.get(type)?.delete(fn);
  };
  setSessionPersistence('local');
}

export function uninstallBrowserFakes(extraKeys: string[] = []): void {
  vi.useRealTimers();
  vi.restoreAllMocks();
  for (const k of [...INSTALLED, 'w', ...extraKeys]) delete g[k];
  REGISTRY.splice(1);
}
