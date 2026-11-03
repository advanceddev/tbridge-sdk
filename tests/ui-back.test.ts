/**
 * The platform "back" action must close our UI.
 * Adaptive: Telegram BackButton inside a Mini App, browser history elsewhere.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { openWalletModal } from '../ui/modal';
import { showActionSheet } from '../ui/action-sheet';
import {
  dispatchWindowEvent,
  g,
  installBrowserFakes,
  uninstallBrowserFakes,
} from './helpers/browser-fakes';

function fakeHistory() {
  const h = {
    state: null as unknown,
    pushes: 0,
    backs: 0,
    pushState(state: unknown) {
      h.state = state;
      h.pushes += 1;
    },
    back() {
      h.backs += 1;
      h.state = null; // the browser would fire popstate async; listener must be gone by then
    },
  };
  g.history = h;
  return h;
}

function fakeTelegramBackButton(visible = false) {
  const clicks = new Set<() => void>();
  const bb = {
    isVisible: visible,
    show: vi.fn(() => {
      bb.isVisible = true;
    }),
    hide: vi.fn(() => {
      bb.isVisible = false;
    }),
    onClick: (cb: () => void) => clicks.add(cb),
    offClick: (cb: () => void) => clicks.delete(cb),
    press: () => Array.from(clicks).forEach((cb) => cb()),
    handlers: clicks,
  };
  g.Telegram = { WebApp: { initData: 'query_id=1', version: '7.0', BackButton: bb } };
  return bb;
}

const openModal = () => {
  const onClose = vi.fn();
  const onBackFromWaiting = vi.fn();
  const handle = openWalletModal({ wallets: [], onSelect() {}, onClose, onBackFromWaiting });
  return { handle, onClose, onBackFromWaiting };
};

beforeEach(installBrowserFakes);
afterEach(() => uninstallBrowserFakes(['history', 'Telegram']));

describe('browser back (history)', () => {
  it('back closes the wallet picker', () => {
    const h = fakeHistory();
    const { onClose } = openModal();
    expect(h.pushes).toBe(1);
    dispatchWindowEvent('popstate', {});
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('back on the waiting screen returns to the list first, then closes', () => {
    const h = fakeHistory();
    const { handle, onClose, onBackFromWaiting } = openModal();
    handle.setWaiting('waiting');
    dispatchWindowEvent('popstate', {});
    expect(onBackFromWaiting).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
    // still open → a new entry must exist, or the next back leaves the dApp page
    expect(h.pushes).toBe(2);
    dispatchWindowEvent('popstate', {});
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closing by other means removes our history entry and stops listening', () => {
    const h = fakeHistory();
    const { handle, onClose } = openModal();
    handle.close();
    expect(h.backs).toBe(1);
    onClose.mockClear();
    dispatchWindowEvent('popstate', {}); // the async popstate from history.back()
    expect(onClose).not.toHaveBeenCalled();
  });

  it('the async popstate of our own cleanup does not cancel the next overlay', () => {
    fakeHistory();
    const { handle } = openModal();
    handle.close(); // connected → picker closes → history.back() (popstate arrives later)
    const onCancel = vi.fn();
    showActionSheet({ wallet: null, clientId: 'a'.repeat(64), onCancel }); // sendTransaction right away
    dispatchWindowEvent('popstate', {}); // the late popstate from the picker cleanup
    expect(onCancel).not.toHaveBeenCalled();
    dispatchWindowEvent('popstate', {}); // a real back press
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('back cancels the transaction confirm sheet', () => {
    fakeHistory();
    const onCancel = vi.fn();
    showActionSheet({ wallet: null, clientId: 'a'.repeat(64), onCancel });
    dispatchWindowEvent('popstate', {});
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});

describe('Telegram Mini App back (BackButton)', () => {
  beforeEach(() => {
    (g.location as { search: string }).search = '?tgWebAppData=x';
  });

  it('uses Telegram BackButton instead of browser history', () => {
    const h = fakeHistory();
    const bb = fakeTelegramBackButton();
    const { onClose } = openModal();
    expect(bb.show).toHaveBeenCalled();
    expect(h.pushes).toBe(0);
    bb.press();
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(bb.isVisible).toBe(false);
    expect(bb.handlers.size).toBe(0);
  });

  it("restores the host's BackButton when it was already visible", () => {
    fakeHistory();
    const bb = fakeTelegramBackButton(true);
    const { handle } = openModal();
    handle.close();
    expect(bb.isVisible).toBe(true);
    expect(bb.handlers.size).toBe(0);
  });
});
