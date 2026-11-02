/**
 * Wallet list grid renderer.
 */

import type { WalletInfo } from '../core/types';
import { isSafeImageUrl } from '../core/security';
import { el } from './dom';
import { t, type TBridgeLocale } from './i18n';
import { sortWalletsForGrid } from './modal-state';

export function renderWalletGrid(
  body: HTMLElement,
  opts: {
    wallets: WalletInfo[];
    recentAppName: string | null;
    locale: TBridgeLocale;
    onSelect: (wallet: WalletInfo) => void;
  },
): void {
  body.className = 'tbridge-body tbridge-grid';
  body.replaceChildren();

  if (opts.wallets.length === 0) {
    body.append(el('div', 'tbridge-empty', t(opts.locale, 'modal.empty')));
    return;
  }

  const sorted = sortWalletsForGrid(opts.wallets, opts.recentAppName);

  for (const wallet of sorted) {
    const item = el('button', 'tbridge-item');
    item.type = 'button';

    if (wallet.app_name === opts.recentAppName) {
      item.append(el('span', 'tbridge-item-badge', t(opts.locale, 'modal.recent')));
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
    item.addEventListener('click', () => opts.onSelect(wallet));
    body.append(item);
  }
}
