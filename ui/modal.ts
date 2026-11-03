/**
 * Vanilla wallet-picker modal — orchestrator over state machine + view modules.
 * Public API unchanged: openWalletModal / WalletModalHandle / createConnectButton.
 */

import type { WalletInfo } from '../core/types';
import { ensureStyles } from './styles';
import { t, type TBridgeLocale } from './i18n';
import type { TBridgeTheme } from './theme';
import { createLogoSvg, TBRIDGE_BRAND_COLOR } from './logo';
import { createBackIcon, createCloseIcon } from './icons';
import { el, isDesktop, lockScroll, mountOnTop, unlockScroll } from './dom';
import {
  createInitialState,
  reduceModal,
  type ModalAction,
  type ModalState,
  type WaitingViewOpts,
} from './modal-state';
import { createAboutOverlay } from './about';
import { renderWalletGrid } from './wallet-grid';
import { renderWaitingView } from './waiting-view';
import { bindBack } from './back-handler';

export interface WalletModalOptions {
  wallets: WalletInfo[];
  title?: string;
  locale?: TBridgeLocale;
  theme?: TBridgeTheme;
  recentAppName?: string | null;
  onSelect: (wallet: WalletInfo) => void;
  onClose?: () => void;
  onBackFromWaiting?: () => void;
}

export interface WalletModalHandle {
  close: (opts?: { silent?: boolean }) => void;
  setWaiting: (
    message?: string,
    opts?: {
      qrDataUrl?: string | null;
      link?: string;
      preferOpen?: boolean;
      error?: boolean;
      wallet?: WalletInfo;
    },
  ) => void;
  showWalletList: () => void;
  setWallets: (wallets: WalletInfo[]) => void;
  setLocale: (locale: TBridgeLocale) => void;
  setTheme: (theme: TBridgeTheme) => void;
}

export function openWalletModal(options: WalletModalOptions): WalletModalHandle {
  ensureStyles();

  let state: ModalState = createInitialState({
    wallets: options.wallets,
    locale: options.locale ?? 'en',
    theme: options.theme ?? 'dark',
    recentAppName: options.recentAppName,
    fixedTitle: options.title ?? null,
  });

  // Local per-instance key handler — module-level would race when two modals open.
  let onKey!: (event: KeyboardEvent) => void;

  const overlay = el('div', 'tbridge-overlay');
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.dataset.tbridgeTheme = state.theme;

  const wrapper = el('div', 'tbridge-modal-wrapper');
  const modal = el('div', 'tbridge-modal');
  const header = el('div', 'tbridge-header');
  const headerStart = el('div', 'tbridge-header-start');

  const title = el('h2', 'tbridge-title', state.fixedTitle ?? t(state.locale, 'modal.title'));

  const closeBtn = el('button', 'tbridge-close') as HTMLButtonElement;
  closeBtn.type = 'button';
  closeBtn.setAttribute('aria-label', t(state.locale, 'modal.close'));
  closeBtn.appendChild(createCloseIcon(18));

  const buttonsContainer = el('div', 'tbridge-buttons');

  headerStart.append(title);
  header.append(headerStart);

  const body = el('div', 'tbridge-body');
  const footer = el('div', 'tbridge-footer');
  footer.setAttribute('aria-hidden', 'true');

  modal.append(header, body, footer);
  wrapper.append(modal);
  overlay.append(wrapper);

  const aboutBtn = el('button', 'tbridge-about-btn') as HTMLButtonElement;
  aboutBtn.type = 'button';
  aboutBtn.appendChild(createLogoSvg({ outline: false, size: 18, color: TBRIDGE_BRAND_COLOR }));

  const about = createAboutOverlay(state.locale);
  overlay.append(about.root);

  aboutBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    about.open();
  });

  if (isDesktop()) {
    buttonsContainer.append(closeBtn, aboutBtn);
    wrapper.append(buttonsContainer);
  } else {
    const headerEnd = el('div', 'tbridge-header-end');
    headerEnd.append(aboutBtn, closeBtn);
    header.append(headerEnd);
  }

  let backBtn: HTMLButtonElement | null = null;

  const syncChrome = (): void => {
    overlay.setAttribute('aria-label', title.textContent || 'Connect wallet');
    closeBtn.setAttribute('aria-label', t(state.locale, 'modal.close'));
    aboutBtn.setAttribute('aria-label', t(state.locale, 'modal.about'));
    about.setLocale(state.locale);
    if (!state.fixedTitle) {
      title.textContent = t(state.locale, 'modal.title');
    }
    if (backBtn) {
      backBtn.setAttribute('aria-label', t(state.locale, 'modal.back'));
    }
  };

  const removeBackButton = (): void => {
    if (!backBtn) return;
    backBtn.remove();
    backBtn = null;
  };

  const ensureBackButton = (): void => {
    if (backBtn) return;

    const btn = el('button', 'tbridge-back') as HTMLButtonElement;
    btn.type = 'button';
    btn.setAttribute('aria-label', t(state.locale, 'modal.back'));
    btn.appendChild(createBackIcon(18));
    btn.addEventListener('click', () => {
      if (state.mode !== 'waiting') return;
      options.onBackFromWaiting?.();
      dispatch({ type: 'show_list' });
      closeBtn.focus();
    });

    if (isDesktop()) {
      buttonsContainer.append(btn);
    } else {
      headerStart.insertBefore(btn, title);
    }
    backBtn = btn;
  };

  const applyView = (prev: ModalState | null): void => {
    if (state.closed) return;

    overlay.dataset.tbridgeTheme = state.theme;

    if (state.mode === 'list') {
      // Re-render grid on first paint, entering list, or wallets/locale change
      if (
        !prev ||
        prev.mode !== 'list' ||
        prev.wallets !== state.wallets ||
        prev.locale !== state.locale
      ) {
        removeBackButton();
        renderWalletGrid(body, {
          wallets: state.wallets,
          recentAppName: state.recentAppName,
          locale: state.locale,
          onSelect: options.onSelect,
        });
      }
      return;
    }

    // waiting — skip patch if only unrelated fields changed (e.g. wallets while waiting)
    ensureBackButton();
    if (
      state.waiting &&
      (!prev ||
        prev.mode !== 'waiting' ||
        prev.waiting !== state.waiting ||
        prev.locale !== state.locale)
    ) {
      renderWaitingView(body, state.waiting, {
        locale: state.locale,
        closed: () => state.closed,
      });
    }
  };

  const dispatch = (action: ModalAction): void => {
    if (state.closed && action.type !== 'close') return;
    const prev = state;
    state = reduceModal(state, action);
    if (action.type === 'set_locale' || action.type === 'set_theme') {
      syncChrome();
    }
    if (action.type === 'close') return;
    applyView(prev);
  };

  let unbindBack: (() => void) | null = null;

  const close = (opts?: { silent?: boolean }): void => {
    if (state.closed) return;
    dispatch({ type: 'close' });
    unbindBack?.();
    about.destroy();
    document.removeEventListener('keydown', onKey);
    unlockScroll();
    unmount();
    if (!opts?.silent) {
      options.onClose?.();
    }
  };

  onKey = (event: KeyboardEvent): void => {
    if (event.key !== 'Escape') return;
    if (about.isOpen()) {
      about.close();
      return;
    }
    close();
  };

  closeBtn.addEventListener('click', () => close());
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) close();
  });
  document.addEventListener('keydown', onKey);

  // Platform back (Android / iOS swipe / browser / Telegram BackButton) mirrors the
  // in-modal controls: about → close it, waiting → list, list → close.
  unbindBack = bindBack(() => {
    if (about.isOpen()) {
      about.close();
      return true;
    }
    if (state.mode === 'waiting') {
      options.onBackFromWaiting?.();
      dispatch({ type: 'show_list' });
      return true;
    }
    close();
    return false;
  });

  syncChrome();
  applyView(null); // first paint
  lockScroll();
  const unmount = mountOnTop(overlay);
  closeBtn.focus();

  return {
    close,

    showWalletList(): void {
      dispatch({ type: 'show_list' });
    },

    setWallets(nextWallets: WalletInfo[]): void {
      dispatch({ type: 'set_wallets', wallets: nextWallets });
    },

    setLocale(nextLocale: TBridgeLocale): void {
      dispatch({ type: 'set_locale', locale: nextLocale });
    },

    setTheme(nextTheme: TBridgeTheme): void {
      dispatch({ type: 'set_theme', theme: nextTheme });
    },

    setWaiting(message, opts): void {
      if (state.closed) return;
      const payload: WaitingViewOpts = {
        message: message ?? t(state.locale, 'waiting.confirm'),
        qrDataUrl: opts?.qrDataUrl,
        link: opts?.link,
        preferOpen: opts?.preferOpen,
        error: opts?.error,
        wallet: opts?.wallet,
      };
      dispatch({ type: 'set_waiting', payload });
    },
  };
}

/** Minimal styled button shell — apps wire their own click / connect flow. */
export function createConnectButton(label = 'Connect wallet'): HTMLButtonElement {
  ensureStyles();
  const btn = el('button', 'tbridge-btn', label);
  btn.type = 'button';
  return btn;
}
