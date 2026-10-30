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

function buildOpenLink(wallet: WalletInfo, clientId: string): string {
  const base = wallet.universal_url || wallet.deepLink || '';
  if (!base) return '';
  const sep = base.includes('?') ? '&' : '?';
  return `${base}${sep}v=2&id=${clientId.toLowerCase()}`;
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
    overlay.remove();
  };

  const cancel = (): void => {
    close();
    options.onCancel();
  };

  closeInner.addEventListener('click', cancel);
  closeOuter.addEventListener('click', cancel);

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) cancel();
  });

  openBtn.addEventListener('click', () => {
    const wallet = options.wallet;
    if (!wallet) return;
    const link = buildOpenLink(wallet, options.clientId);
    if (!link) return;
    openWalletLink(link, { deepLink: wallet.deepLink });
  });

  // Focus primary control
  if (isDesktop()) {
    closeOuter.focus();
  } else {
    closeInner.focus();
  }

  return { close };
}
