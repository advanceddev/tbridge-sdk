/**
 * Exploit regressions for bugs still open after the first fix rounds.
 */
import nacl from 'tweetnacl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryStorageAdapter } from '../core/storage';
import { STORAGE_KEYS } from '../core/constants';
import {
  ADDRESS,
  FakeEventSource,
  connectEvent,
  installBrowserFakes,
  lastEs,
  makeBridge,
  makeInjected,
  mockFetch,
  sealFrom,
  seedHttpSession,
  tick,
  uninstallBrowserFakes,
} from './helpers/browser-fakes';

beforeEach(installBrowserFakes);
afterEach(() => uninstallBrowserFakes());

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const tx = (network?: string) => ({
  validUntil: Math.floor(Date.now() / 1000) + 60,
  ...(network ? { network } : {}),
  messages: [{ address: ADDRESS, amount: '1' }],
});
const sentMethods = (send: { mock: { calls: Array<[{ method?: string }]> } }) =>
  send.mock.calls.map(([r]) => r.method);

describe('connect: SSE fails after the 2.5 s soft wait', () => {
  // Slow mobile network: the stream neither opens nor fails within 2.5 s, then fails.
  // The QR is already shown; the user scans and approves once the bridge is back.
  it('retries the stream so the wallet approval still arrives', async () => {
    const fetchMock = mockFetch();
    const bridge = makeBridge(new MemoryStorageAdapter(), { requestTimeoutMs: 60_000 });
    const p = bridge.connect({ appName: 'w', onConnectLink() {} });
    await vi.waitFor(() => expect(FakeEventSource.instances.length).toBe(1));
    await sleep(2_600); // soft wait over; connect now waits for the wallet
    lastEs().fire('error'); // initial stream failed
    await vi.waitFor(() => expect(FakeEventSource.instances.length).toBe(2), {
      timeout: 4_000,
    });
    const es = lastEs();
    es.fire('open');
    es.fire('message', sealFrom(nacl.box.keyPair(), es.clientId, connectEvent(1)));
    expect((await p).status).toBe('connected');
    // the session must not stay poisoned by the failed first open
    void bridge.sendTransaction(tx()).catch(() => undefined);
    await vi.waitFor(() =>
      expect(fetchMock.mock.calls.some(([u]) => String(u).includes('/message'))).toBe(true),
    );
    bridge.destroy();
  }, 15_000);

  it('a restore that gives up does not keep retrying in the background', async () => {
    mockFetch();
    const storage = new MemoryStorageAdapter();
    await seedHttpSession(storage);
    const bridge = makeBridge(storage);
    const p = bridge.restoreConnection();
    await vi.waitFor(() => expect(FakeEventSource.instances.length).toBe(1));
    lastEs().fire('error'); // offline at app start
    await p;
    await sleep(2_500); // longer than the first backoff
    expect(FakeEventSource.instances.length).toBe(1);
  }, 10_000);
});

describe('transaction network vs connected account', () => {
  // @tonconnect/sdk refuses this (WalletWrongNetworkError); rpc.md:100 leaves it to
  // the wallet, which a buggy / old wallet may not enforce.
  it('refuses sendTransaction for a network other than the connected account', async () => {
    mockFetch();
    const { send } = makeInjected(async () => connectEvent(1)); // mainnet account
    const bridge = makeBridge();
    await bridge.connect();
    await expect(bridge.sendTransaction(tx('-3'))).rejects.toMatchObject({
      code: 'NETWORK_MISMATCH',
    });
    expect(sentMethods(send)).not.toContain('sendTransaction');
  });

  it('refuses signData for a network other than the connected account', async () => {
    mockFetch();
    const { send } = makeInjected(async () => connectEvent(1));
    const bridge = makeBridge();
    await bridge.connect();
    await expect(
      bridge.signData({ type: 'text', text: 'hi' }, { network: '-3' }),
    ).rejects.toMatchObject({ code: 'NETWORK_MISMATCH' });
    expect(sentMethods(send)).not.toContain('signData');
  });
});

describe('two TBridge instances with different sessionPersistence', () => {
  it("a 'session' instance keeps its session out of durable storage even after a 'local' one is created", async () => {
    mockFetch();
    const storage = new MemoryStorageAdapter();
    const tabScoped = makeBridge(storage, { sessionPersistence: 'session' });
    makeBridge(new MemoryStorageAdapter()); // e.g. a second widget on the page, default 'local'

    const p = tabScoped.connect({ appName: 'w', onConnectLink() {} });
    await vi.waitFor(() => expect(FakeEventSource.instances.length).toBe(1));
    const es = lastEs();
    es.fire('open');
    await tick();
    await tick();
    es.fire('message', sealFrom(nacl.box.keyPair(), es.clientId, connectEvent(1)));
    await p;
    expect(await storage.getItem(STORAGE_KEYS.SESSION)).toBeNull();
  });
});
