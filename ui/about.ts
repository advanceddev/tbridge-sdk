/**
 * About overlay — brand, version, GitHub.
 */

import { TBRIDGE_VERSION } from '../core/constants';
import { el } from './dom';
import { t, type TBridgeLocale } from './i18n';
import { createLogoSvg, TBRIDGE_BRAND_COLOR } from './logo';
import { createCloseIcon } from './icons';

export interface AboutHandle {
  root: HTMLElement;
  open: () => void;
  close: () => void;
  isOpen: () => boolean;
  setLocale: (locale: TBridgeLocale) => void;
  destroy: () => void;
}

export function aboutTitleText(locale: TBridgeLocale): string {
  return `${t(locale, 'about.title')} v${TBRIDGE_VERSION}`;
}

export function createAboutOverlay(locale: TBridgeLocale): AboutHandle {
  const scrim = el('div', 'tbridge-about-scrim');
  scrim.setAttribute('hidden', '');
  scrim.setAttribute('aria-hidden', 'true');

  const card = el('div', 'tbridge-about-card');
  card.setAttribute('role', 'dialog');
  card.setAttribute('aria-modal', 'true');

  const closeBtn = el('button', 'tbridge-about-close') as HTMLButtonElement;
  closeBtn.type = 'button';
  closeBtn.setAttribute('aria-label', t(locale, 'about.close'));
  closeBtn.appendChild(createCloseIcon(16));

  const logoWrap = el('div', 'tbridge-about-logo');
  logoWrap.appendChild(createLogoSvg({ outline: false, size: 40, color: TBRIDGE_BRAND_COLOR }));

  const title = el('h3', 'tbridge-about-title', aboutTitleText(locale));
  const body = el('p', 'tbridge-about-body', t(locale, 'about.body'));

  const github = document.createElement('a');
  github.className = 'tbridge-github';
  github.href = 'https://github.com/advanceddev/tbridge-sdk';
  github.target = '_blank';
  github.rel = 'noopener noreferrer';
  github.setAttribute('aria-label', 'TBridge on GitHub');
  github.title = 'GitHub';

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', '22');
  svg.setAttribute('height', '22');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.setAttribute('fill', 'currentColor');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute(
    'd',
    'M10.226 17.284c-2.965-.36-5.054-2.493-5.054-5.256 0-1.123.404-2.336 1.078-3.144-.292-.741-.247-2.314.09-2.965.898-.112 2.111.36 2.83 1.01.853-.269 1.752-.404 2.853-.404 1.1 0 1.999.135 2.807.382.696-.629 1.932-1.1 2.83-.988.315.606.36 2.179.067 2.942.72.854 1.101 2 1.101 3.167 0 2.763-2.089 4.852-5.098 5.234.763.494 1.28 1.572 1.28 2.807v2.336c0 .674.561 1.056 1.235.786 4.066-1.55 7.255-5.615 7.255-10.646C23.5 6.188 18.334 1 11.978 1 5.62 1 .5 6.188.5 12.545c0 4.986 3.167 9.12 7.435 10.669.606.225 1.19-.18 1.19-.786V20.63a2.9 2.9 0 0 1-1.078.224c-1.483 0-2.359-.808-2.987-2.313-.247-.607-.517-.966-1.034-1.033-.27-.023-.359-.135-.359-.27 0-.27.45-.471.898-.471.652 0 1.213.404 1.797 1.235.45.651.921.943 1.483.943.561 0 .92-.202 1.437-.719.382-.381.674-.718.944-.943',
  );
  svg.appendChild(path);
  github.appendChild(svg);

  card.append(closeBtn, logoWrap, title, body, github);
  scrim.append(card);

  const open = (): void => {
    scrim.removeAttribute('hidden');
    scrim.setAttribute('aria-hidden', 'false');
    closeBtn.focus();
  };

  const close = (): void => {
    scrim.setAttribute('hidden', '');
    scrim.setAttribute('aria-hidden', 'true');
  };

  const isOpen = (): boolean => !scrim.hasAttribute('hidden');

  closeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    close();
  });
  scrim.addEventListener('click', (e) => {
    if (e.target === scrim) close();
  });

  return {
    root: scrim,
    open,
    close,
    isOpen,
    setLocale(next: TBridgeLocale): void {
      closeBtn.setAttribute('aria-label', t(next, 'about.close'));
      title.textContent = aboutTitleText(next);
      body.textContent = t(next, 'about.body');
      card.setAttribute('aria-label', aboutTitleText(next));
    },
    destroy(): void {
      close();
      scrim.remove();
    },
  };
}
