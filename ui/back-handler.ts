/**
 * Platform "back" for overlays (ton-connect/sdk#70).
 *
 * - Telegram Mini App: Telegram.WebApp.BackButton (also what Android's system
 *   back triggers inside Telegram). The host's own BackButton state is restored.
 * - Everywhere else (Android browser back, iOS swipe, desktop back button):
 *   one history entry while the overlay is open; popstate = back. If the overlay
 *   closes by other means, that entry is removed again.
 *
 * `onBack` returns true to stay open (e.g. waiting screen → list); the handler
 * then re-arms for the next back press.
 */

import { isTelegramMiniApp } from '../utils/runtime-env';

interface TgBackButton {
  isVisible?: boolean;
  show(): void;
  hide(): void;
  onClick(cb: () => void): void;
  offClick(cb: () => void): void;
}

function telegramBackButton(): TgBackButton | null {
  if (!isTelegramMiniApp()) return null;
  const bb = (window as Window & { Telegram?: { WebApp?: { BackButton?: TgBackButton } } }).Telegram
    ?.WebApp?.BackButton;
  return bb && typeof bb.onClick === 'function' && typeof bb.show === 'function' ? bb : null;
}

const STATE_KEY = '__tbridgeOverlay';
let seq = 0;
/**
 * The popstate caused by our own cleanup history.back(). It arrives async —
 * possibly after the next overlay (e.g. tx confirm right after connect) is bound,
 * which must not read it as a user "back" and cancel. A one-shot listener added
 * before that overlay's own listener marks the event.
 */
let ownPopstate: Event | null = null;

/** Bind back to an open overlay. Call the returned function when it closes. */
export function bindBack(onBack: () => boolean | void): () => void {
  const bb = telegramBackButton();
  if (bb) {
    const wasVisible = bb.isVisible === true;
    const handler = (): void => {
      onBack();
    };
    bb.onClick(handler);
    bb.show();
    return () => {
      bb.offClick(handler);
      if (!wasVisible) bb.hide();
    };
  }

  if (typeof history === 'undefined' || typeof history.pushState !== 'function') {
    return () => {};
  }
  const id = ++seq;
  const push = (): void => {
    try {
      history.pushState({ ...(history.state as object | null), [STATE_KEY]: id }, '');
    } catch {
      /* sandboxed iframe etc. — back just won't be intercepted */
    }
  };
  const onPop = (ev: Event): void => {
    if (ev === ownPopstate) return;
    if (onBack() === true) push(); // stayed open: arm the next back press
  };
  push();
  window.addEventListener('popstate', onPop);
  return () => {
    window.removeEventListener('popstate', onPop);
    // Closed by close button / Escape / success: drop our entry so the user's
    // next back goes where they expect.
    if ((history.state as Record<string, unknown> | null)?.[STATE_KEY] === id) {
      window.addEventListener(
        'popstate',
        (ev) => {
          ownPopstate = ev;
        },
        { once: true },
      );
      try {
        history.back();
      } catch {
        /* ignore */
      }
    }
  };
}
