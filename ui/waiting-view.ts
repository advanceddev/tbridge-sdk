/**
 * Waiting / QR shell — stable layout, patch media & actions in place.
 */

import type { WalletInfo } from '../core/types';
import { openWalletLink } from '../utils/open-wallet-link';
import { el } from './dom';
import { t, type TBridgeLocale } from './i18n';
import type { WaitingViewOpts } from './modal-state';

export function renderWaitingView(
  body: HTMLElement,
  opts: WaitingViewOpts,
  ctx: {
    locale: TBridgeLocale;
    closed: () => boolean;
  },
): void {
  const entering =
    !body.classList.contains('tbridge-waiting') ||
    !body.querySelector('.tbridge-media-slot') ||
    !body.querySelector('.tbridge-waiting-msg') ||
    !body.querySelector('.tbridge-waiting-actions');

  body.className = 'tbridge-body tbridge-waiting';

  let media = body.querySelector('.tbridge-media-slot') as HTMLElement | null;
  let msgEl = body.querySelector('.tbridge-waiting-msg') as HTMLElement | null;
  let actions = body.querySelector('.tbridge-waiting-actions') as HTMLElement | null;

  if (entering || !media || !msgEl || !actions) {
    body.replaceChildren();

    const wallet = opts.wallet;
    if (wallet) {
      body.append(buildWalletChip(wallet));
    }

    media = el('div', 'tbridge-media-slot');
    media.setAttribute('aria-hidden', 'false');
    body.append(media);

    msgEl = el('p', 'tbridge-waiting-msg');
    body.append(msgEl);

    actions = el('div', 'tbridge-waiting-actions');
    body.append(actions);
  }

  // Media: QR replaces spinner inside the reserved slot (no layout shift)
  media.replaceChildren();
  if (opts.qrDataUrl) {
    const qr = el('img', 'tbridge-qr') as HTMLImageElement;
    qr.src = opts.qrDataUrl;
    qr.alt = 'QR';
    media.append(qr);
  } else if (!opts.error) {
    const spinnerWrap = el('div', 'tbridge-spinner-wrap');
    spinnerWrap.append(el('div', 'tbridge-spinner'));
    media.append(spinnerWrap);
  }
  // error: keep empty slot so height stays stable

  msgEl.className = opts.error
    ? 'tbridge-waiting-msg tbridge-waiting-error'
    : 'tbridge-waiting-msg';
  msgEl.textContent = opts.message;

  actions.replaceChildren();
  const link = opts.link;
  if (link) {
    const openBtn = el('button', 'tbridge-open-link', t(ctx.locale, 'waiting.openLink'));
    openBtn.type = 'button';
    openBtn.addEventListener('click', () => {
      openWalletLink(link, { deepLink: opts.wallet?.deepLink });
    });
    actions.append(openBtn);

    const copyBtn = el('button', 'tbridge-copy-link', t(ctx.locale, 'waiting.copy'));
    copyBtn.type = 'button';
    copyBtn.addEventListener('click', () => {
      const clipboard = navigator.clipboard;
      if (!clipboard) return;
      void clipboard
        .writeText(link)
        .then(() => {
          copyBtn.textContent = t(ctx.locale, 'waiting.copied');
          window.setTimeout(() => {
            if (!ctx.closed()) copyBtn.textContent = t(ctx.locale, 'waiting.copy');
          }, 1500);
        })
        .catch(() => {
          /* clipboard unavailable */
        });
    });
    actions.append(copyBtn);
  }
}

/** Lightweight label — icon lives in the QR; platforms are not useful here. */
function buildWalletChip(wallet: WalletInfo): HTMLElement {
  const chip = el('div', 'tbridge-wallet-chip');
  chip.append(el('div', 'tbridge-wallet-chip-name', wallet.name));
  return chip;
}
