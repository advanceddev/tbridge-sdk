/**
 * Compact confirm sheet: open wallet after sendTransaction.
 * Desktop: close control outside to the right (same pattern as connect modal).
 * Mobile: close inside the card header.
 */

import type { WalletInfo } from '../core/types';
import { ensureStyles } from './styles';
import { createCloseIcon } from './icons';
import { t, type TBridgeLocale } from './i18n';
import type { TBridgeTheme } from './theme';
import { openWalletLink, isTelegramWalletIdentity } from '../utils/open-wallet-link';

export interface ActionSheetHandle {
  close: () => void;
}

export interface ActionSheetOptions {
  locale?: TBridgeLocale;
  theme?: TBridgeTheme;
  wallet: WalletInfo | null;
  clientId: string;
  /**
   * dApp manifest URL. When set, wake links include `r` (Tonkeeper rejects id-only).
   * Optional for backward compatibility with older call sites.
   */
  manifestUrl?: string;
  onCancel: () => void;
}

function isDesktop(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(min-width: 520px)').matches;
}

function confirmLabel(locale: TBridgeLocale, wallet: WalletInfo | null): string {
  if (!wallet) return t(locale, 'action.confirmGeneric');
  if (isTelegramWalletIdentity(wallet)) {
    return t(locale, 'action.confirmTelegram');
  }
  const name = (wallet.name || wallet.app_name || '').toLowerCase();
  if (name.includes('gram')) {
    return t(locale, 'action.confirmGram');
  }
  return t(locale, 'action.confirmNamed').replace('{name}', wallet.name || wallet.app_name);
}

/**
 * Wake / focus link for an existing bridge session.
 * Tonkeeper (and some others) reject `…/ton-connect?v=2&id=…` without `r`
 * → "Unsupported link" / "missing payload". Always attach a minimal connect
 * request JSON so the wallet can open and pick up pending bridge RPC.
 */
function buildOpenLink(wallet: WalletInfo, clientId: string, manifestUrl?: string): string {
  // Prefer https universal URL; custom schemes without a full `r` often fail.
  const base = wallet.universal_url || wallet.deepLink || '';
  if (!base) return '';

  const id = clientId.toLowerCase();

  // Without manifest — legacy id-only link (some wallets accept https+id)
  if (!manifestUrl) {
    if (base.startsWith('https://') || base.startsWith('http://')) {
      try {
        const u = new URL(base);
        u.searchParams.set('v', '2');
        u.searchParams.set('id', id);
        if (!u.searchParams.has('ret')) u.searchParams.set('ret', 'back');
        return u.toString();
      } catch {
        /* fall through */
      }
    }
    const sep = base.includes('?') ? '&' : '?';
    return `${base}${sep}v=2&id=${id}&ret=back`;
  }

  const request = {
    manifestUrl,
    items: [{ name: 'ton_addr' as const }],
  };
  const r = encodeURIComponent(JSON.stringify(request));

  if (base.startsWith('https://') || base.startsWith('http://')) {
    try {
      const u = new URL(base);
      u.searchParams.set('v', '2');
      u.searchParams.set('id', id);
      // searchParams encodes once; pass raw JSON
      u.searchParams.set('r', JSON.stringify(request));
      if (!u.searchParams.has('ret')) {
        u.searchParams.set('ret', 'back');
      }
      return u.toString();
    } catch {
      /* fall through */
    }
  }

  const sep = base.includes('?') ? '&' : '?';
  return `${base}${sep}v=2&id=${id}&r=${r}&ret=back`;
}

export function showActionSheet(options: ActionSheetOptions): ActionSheetHandle {
  ensureStyles();
  const locale = options.locale ?? 'en';
  const theme = options.theme ?? 'dark';

  const overlay = document.createElement('div');
  overlay.className = 'tbridge-sheet-overlay';
  overlay.dataset.tbridgeTheme = theme;
  overlay.setAttribute('role', 'presentation');

  const wrapper = document.createElement('div');
  wrapper.className = 'tbridge-sheet-wrapper';

  const sheet = document.createElement('div');
  sheet.className = 'tbridge-sheet';
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-modal', 'true');

  const header = document.createElement('div');
  header.className = 'tbridge-sheet-header';

  const title = document.createElement('p');
  title.className = 'tbridge-sheet-title';
  title.textContent = confirmLabel(locale, options.wallet);

  const makeClose = (): HTMLButtonElement => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'tbridge-sheet-close';
    btn.setAttribute('aria-label', t(locale, 'modal.close'));
    btn.appendChild(createCloseIcon(18));
    return btn;
  };

  const closeInner = makeClose();
  header.append(title, closeInner);

  const openBtn = document.createElement('button');
  openBtn.type = 'button';
  openBtn.className = 'tbridge-sheet-open';
  openBtn.textContent = t(locale, 'action.openWallet');

  sheet.append(header, openBtn);
  wrapper.append(sheet);

  const side = document.createElement('div');
  side.className = 'tbridge-sheet-side';
  const closeOuter = makeClose();
  side.append(closeOuter);
  wrapper.append(side);

  overlay.append(wrapper);
  document.body.appendChild(overlay);

  let closed = false;
  const close = (): void => {
    if (closed) return;
    closed = true;
    document.removeEventListener('keydown', onKey);
    overlay.remove();
  };

  const cancel = (): void => {
    close();
    options.onCancel();
  };

  const onKey = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') {
      event.preventDefault();
      cancel();
      return;
    }
    // Minimal focus trap: keep Tab cycling inside the sheet controls.
    if (event.key === 'Tab') {
      const focusable = [closeInner, closeOuter, openBtn].filter(
        (el) => el.offsetParent !== null || el === document.activeElement,
      );
      if (focusable.length === 0) return;
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      if (event.shiftKey) {
        if (document.activeElement === first) {
          event.preventDefault();
          last.focus();
        }
      } else if (document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
  };

  closeInner.addEventListener('click', cancel);
  closeOuter.addEventListener('click', cancel);

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) cancel();
  });

  openBtn.addEventListener('click', () => {
    const wallet = options.wallet;
    if (!wallet) return;
    const link = buildOpenLink(wallet, options.clientId, options.manifestUrl);
    if (!link) return;
    // Do not pass raw deepLink — id-only custom schemes are rejected by Tonkeeper
    openWalletLink(link, { forceUniversal: true });
  });

  document.addEventListener('keydown', onKey);

  if (isDesktop()) {
    closeOuter.focus();
  } else {
    closeInner.focus();
  }

  return { close };
}
