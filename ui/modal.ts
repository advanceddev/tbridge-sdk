/**
 * Vanilla wallet-picker modal + waiting state.
 */

import type { WalletInfo } from '../core/types';
import { isSafeImageUrl } from '../core/security';
import { ensureStyles } from './styles';
import { t, type TBridgeLocale } from './i18n';
import type { TBridgeTheme } from './theme';
import { openWalletLink } from '../utils/open-wallet-link';
import { createLogoSvg, createLogoWordmark, TBRIDGE_BRAND_COLOR } from './logo';
import { createBackIcon, createCloseIcon } from './icons';

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

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);

  if (className) {
    node.className = className;
  }

  if (text !== undefined) {
    node.textContent = text;
  }

  return node;
}

function capitalizePlatform(platform: string): string {
  if (!platform) {
    return platform;
  }

  return platform.charAt(0).toUpperCase() + platform.slice(1).toLowerCase();
}

let onKey: (event: KeyboardEvent) => void = () => undefined;
const isDesktop = (): boolean => window.matchMedia('(min-width: 520px)').matches;

export function openWalletModal(options: WalletModalOptions): WalletModalHandle {
  ensureStyles();

  let locale: TBridgeLocale = options.locale ?? 'en';
  let theme: TBridgeTheme = options.theme ?? 'dark';
  let wallets: WalletInfo[] = options.wallets;

  const recentAppName = options.recentAppName ?? null;

  const overlay = el('div', 'tbridge-overlay');
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.dataset.tbridgeTheme = theme;

  const wrapper = el('div', 'tbridge-modal-wrapper');
  const modal = el('div', 'tbridge-modal');
  const header = el('div', 'tbridge-header');
  const headerStart = el('div', 'tbridge-header-start');

  const title = el('h2', 'tbridge-title', options.title ?? t(locale, 'modal.title'));

  const closeBtn = el('button', 'tbridge-close') as HTMLButtonElement;
  closeBtn.type = 'button';
  closeBtn.setAttribute('aria-label', t(locale, 'modal.close'));
  closeBtn.appendChild(createCloseIcon(18));

  const buttonsContainer = el('div', 'tbridge-buttons');

  headerStart.append(title);
  header.append(headerStart);

  const body = el('div', 'tbridge-body');
  const footer = el('div', 'tbridge-footer');
  footer.appendChild(
    createLogoWordmark({ size: 22, color: TBRIDGE_BRAND_COLOR, className: 'tbridge-wordmark' }),
  );

  modal.append(header, body, footer);
  wrapper.append(modal);
  overlay.append(wrapper);

  // About button (outline logo) — desktop: under close; mobile: left of close in header
  const aboutBtn = el('button', 'tbridge-about-btn') as HTMLButtonElement;
  aboutBtn.type = 'button';
  aboutBtn.appendChild(createLogoSvg({ outline: false, size: 18, color: TBRIDGE_BRAND_COLOR }));

  // About popup (stacked above the wallet modal)
  const aboutScrim = el('div', 'tbridge-about-scrim');
  aboutScrim.setAttribute('hidden', '');
  aboutScrim.setAttribute('aria-hidden', 'true');
  const aboutCard = el('div', 'tbridge-about-card');
  aboutCard.setAttribute('role', 'dialog');
  aboutCard.setAttribute('aria-modal', 'true');
  const aboutClose = el('button', 'tbridge-about-close') as HTMLButtonElement;
  aboutClose.type = 'button';
  aboutClose.setAttribute('aria-label', t(locale, 'about.close'));
  aboutClose.appendChild(createCloseIcon(16));

  const aboutLogoWrap = el('div', 'tbridge-about-logo');
  aboutLogoWrap.appendChild(
    createLogoSvg({ outline: false, size: 40, color: TBRIDGE_BRAND_COLOR }),
  );
  const aboutTitle = el('h3', 'tbridge-about-title', t(locale, 'about.title'));
  const aboutBody = el('p', 'tbridge-about-body', t(locale, 'about.body'));
  aboutCard.append(aboutClose, aboutLogoWrap, aboutTitle, aboutBody);
  aboutScrim.append(aboutCard);
  overlay.append(aboutScrim);

  const openAbout = (): void => {
    aboutScrim.removeAttribute('hidden');
    aboutScrim.setAttribute('aria-hidden', 'false');
    aboutClose.focus();
  };

  const closeAbout = (): void => {
    aboutScrim.setAttribute('hidden', '');
    aboutScrim.setAttribute('aria-hidden', 'true');
  };

  aboutBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    openAbout();
  });
  aboutClose.addEventListener('click', (e) => {
    e.stopPropagation();
    closeAbout();
  });
  aboutScrim.addEventListener('click', (e) => {
    if (e.target === aboutScrim) closeAbout();
  });

  if (isDesktop()) {
    buttonsContainer.append(closeBtn, aboutBtn);
    wrapper.append(buttonsContainer);
  } else {
    const headerEnd = el('div', 'tbridge-header-end');
    headerEnd.append(aboutBtn, closeBtn);
    header.append(headerEnd);
  }

  let closed = false;
  let mode: 'list' | 'waiting' = 'list';
  let backBtn: HTMLButtonElement | null = null;

  const removeBackButton = (): void => {
    if (!backBtn) {
      return;
    }

    backBtn.remove();
    backBtn = null;
  };

  const syncA11y = (): void => {
    overlay.setAttribute('aria-label', title.textContent || 'Connect wallet');
    closeBtn.setAttribute('aria-label', t(locale, 'modal.close'));
    aboutBtn.setAttribute('aria-label', t(locale, 'modal.about'));
    aboutClose.setAttribute('aria-label', t(locale, 'about.close'));
    aboutTitle.textContent = t(locale, 'about.title');
    aboutBody.textContent = t(locale, 'about.body');
    aboutCard.setAttribute('aria-label', t(locale, 'about.title'));

    if (backBtn) {
      backBtn.setAttribute('aria-label', t(locale, 'modal.back'));
    }
  };

  syncA11y();

  const close = (opts?: { silent?: boolean }): void => {
    if (closed) {
      return;
    }

    closed = true;

    removeBackButton();
    overlay.remove();
    document.documentElement.classList.remove('tbridge-scroll-lock');
    document.body.classList.remove('tbridge-scroll-lock');
    document.removeEventListener('keydown', onKey);

    if (!opts?.silent) {
      options.onClose?.();
    }
  };

  onKey = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') {
      if (!aboutScrim.hasAttribute('hidden')) {
        closeAbout();
        return;
      }
      close();
    }
  };

  closeBtn.addEventListener('click', () => close());

  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) {
      close();
    }
  });

  document.addEventListener('keydown', onKey);

  const renderList = (): void => {
    mode = 'list';

    removeBackButton();

    if (!options.title) {
      title.textContent = t(locale, 'modal.title');
    }

    body.className = 'tbridge-body tbridge-grid';
    body.replaceChildren();

    if (wallets.length === 0) {
      body.append(el('div', 'tbridge-empty', t(locale, 'modal.empty')));
      return;
    }

    const sorted = [...wallets].toSorted((a, b) => {
      const aRecent = a.app_name === recentAppName;
      const bRecent = b.app_name === recentAppName;

      if (aRecent && !bRecent) {
        return -1;
      }

      if (!aRecent && bRecent) {
        return 1;
      }

      return 0;
    });

    for (const wallet of sorted) {
      const item = el('button', 'tbridge-item');
      item.type = 'button';

      if (wallet.app_name === recentAppName) {
        item.append(el('span', 'tbridge-item-badge', t(locale, 'modal.recent')));
      }

      if (wallet.image && isSafeImageUrl(wallet.image)) {
        const img = el('img', 'tbridge-item-icon') as HTMLImageElement;
        img.src = wallet.image;
        img.alt = '';
        img.loading = 'eager';
        img.decoding = 'async';
        img.referrerPolicy = 'no-referrer';
        item.append(img);
      } else {
        const placeholder = el('div', 'tbridge-item-icon tbridge-item-icon--ph');
        placeholder.textContent = (wallet.name?.[0] ?? '?').toUpperCase();
        item.append(placeholder);
      }

      item.append(el('span', 'tbridge-item-name', wallet.name));
      item.addEventListener('click', () => options.onSelect(wallet));

      body.append(item);
    }
  };

  const ensureBackButton = (): void => {
    if (backBtn) {
      return;
    }

    const btn = el('button', 'tbridge-back') as HTMLButtonElement;
    btn.type = 'button';
    btn.setAttribute('aria-label', t(locale, 'modal.back'));
    btn.appendChild(createBackIcon(18));

    btn.addEventListener('click', () => {
      if (mode !== 'waiting') {
        return;
      }

      options.onBackFromWaiting?.();
      renderList();

      closeBtn.focus();
    });

    if (isDesktop()) {
      buttonsContainer.append(btn);
    } else {
      headerStart.insertBefore(btn, title);
    }

    backBtn = btn;
  };

  renderList();
  document.documentElement.classList.add('tbridge-scroll-lock');
  document.body.classList.add('tbridge-scroll-lock');
  document.body.append(overlay);
  closeBtn.focus();

  return {
    close,

    showWalletList(): void {
      if (closed) {
        return;
      }

      renderList();
    },

    setWallets(nextWallets: WalletInfo[]): void {
      if (closed) {
        return;
      }

      wallets = nextWallets;

      if (mode === 'list') {
        renderList();
      }
    },

    setLocale(nextLocale: TBridgeLocale): void {
      if (closed) {
        return;
      }

      locale = nextLocale;

      if (!options.title) {
        title.textContent = t(locale, 'modal.title');
      }

      syncA11y();

      if (mode === 'list') {
        renderList();
      }
    },

    setTheme(nextTheme: TBridgeTheme): void {
      if (closed) {
        return;
      }

      theme = nextTheme;
      overlay.dataset.tbridgeTheme = theme;
    },

    setWaiting(message = t(locale, 'waiting.confirm'), opts): void {
      if (closed) {
        return;
      }

      mode = 'waiting';

      ensureBackButton();

      body.className = 'tbridge-body tbridge-waiting';
      body.replaceChildren();

      const wallet = opts?.wallet;

      if (wallet) {
        const chip = el('div', 'tbridge-wallet-chip');

        if (wallet.image && isSafeImageUrl(wallet.image)) {
          const img = el('img', 'tbridge-wallet-chip-icon') as HTMLImageElement;
          img.src = wallet.image;
          img.alt = '';
          img.loading = 'eager';
          img.decoding = 'async';
          img.referrerPolicy = 'no-referrer';
          chip.append(img);
        } else {
          const placeholder = el('div', 'tbridge-wallet-chip-icon tbridge-wallet-chip-icon--ph');
          placeholder.textContent = (wallet.name?.[0] ?? '?').toUpperCase();
          chip.append(placeholder);
        }

        const meta = el('div', 'tbridge-wallet-chip-meta');
        meta.append(el('div', 'tbridge-wallet-chip-name', wallet.name));

        const platforms = (wallet.platforms ?? []).slice(0, 5).map(capitalizePlatform).join(' · ');

        if (platforms) {
          meta.append(el('div', 'tbridge-wallet-chip-platforms', platforms));
        }

        chip.append(meta);
        body.append(chip);
      }

      if (opts?.qrDataUrl) {
        const qr = el('img', 'tbridge-qr') as HTMLImageElement;
        qr.src = opts.qrDataUrl;
        qr.alt = 'QR';
        body.append(qr);
      } else if (!opts?.error) {
        const spinnerWrap = el('div', 'tbridge-spinner-wrap');
        spinnerWrap.append(el('div', 'tbridge-spinner'));
        body.append(spinnerWrap);
      }

      body.append(el('p', opts?.error ? 'tbridge-waiting-error' : undefined, message));

      const link = opts?.link;

      if (link) {
        const openBtn = el('button', 'tbridge-open-link', t(locale, 'waiting.openLink'));
        openBtn.type = 'button';
        openBtn.addEventListener('click', () => {
          openWalletLink(link, {
            deepLink: opts?.wallet?.deepLink,
          });
        });
        body.append(openBtn);

        const copyBtn = el('button', 'tbridge-copy-link', t(locale, 'waiting.copy'));
        copyBtn.type = 'button';

        copyBtn.addEventListener('click', () => {
          const clipboard = navigator.clipboard;

          if (!clipboard) {
            return;
          }

          void clipboard
            .writeText(link)
            .then(() => {
              copyBtn.textContent = t(locale, 'waiting.copied');

              window.setTimeout(() => {
                if (!closed) {
                  copyBtn.textContent = t(locale, 'waiting.copy');
                }
              }, 1500);
            })
            .catch(() => {
              // Clipboard may be unavailable in some browsers/contexts
            });
        });

        body.append(copyBtn);
      }
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
