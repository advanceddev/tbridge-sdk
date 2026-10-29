/**
 * Platform-aware wallet link launcher.
 *
 * Priority:
 * 1. HTTPS/HTTP universal link when available
 * 2. Inside Telegram Mini App:
 *    - t.me → `web_app_open_tg_link`
 *    - other http(s) → `web_app_open_link` (external browser / in-app browser)
 * 3. Custom schemes only if primary is not http(s)
 *
 * Docs:
 * https://core.telegram.org/api/web-events#web-app-open-link
 * https://core.telegram.org/api/web-events#web-app-open-tg-link
 */

import {
  detectRuntimeEnv,
  isIframeContext,
  isTelegramClient,
  telegramWebAppVersion,
  versionAtLeast,
  type RuntimeEnv,
} from './runtime-env';

export type ReturnStrategy = 'back' | 'none' | string;

export type LinkTarget = '_self' | '_blank';

export interface OpenWalletLinkOptions {
  deepLink?: string;
  returnStrategy?: ReturnStrategy;
  forceUniversal?: boolean;
  target?: LinkTarget;
}

const MAX_URL_LEN = 2048;

function safeUrl(href: string): URL | null {
  try {
    return new URL(href);
  } catch {
    return null;
  }
}

function isHttpUrl(href: string): boolean {
  const u = safeUrl(href);
  return !!u && (u.protocol === 'https:' || u.protocol === 'http:');
}

function isTelegramHosted(href: string): boolean {
  const u = safeUrl(href);
  return (
    !!u &&
    (u.hostname === 't.me' ||
      u.hostname.endsWith('.t.me') ||
      u.hostname.endsWith('.telegram.me') ||
      u.hostname.endsWith('telegram.me'))
  );
}

export function withReturnStrategy(href: string, strategy: ReturnStrategy): string {
  if (!strategy) return href;
  try {
    if (isHttpUrl(href)) {
      const u = new URL(href);
      u.searchParams.set('ret', strategy);
      return u.toString();
    }
    if (/[?&]ret=/.test(href)) {
      return href.replace(/([?&]ret=)[^&]*/, `$1${encodeURIComponent(strategy)}`);
    }
    const sep = href.includes('?') ? '&' : '?';
    return `${href}${sep}ret=${encodeURIComponent(strategy)}`;
  } catch {
    return href;
  }
}

export function resolveReturnStrategy(env: RuntimeEnv): ReturnStrategy {
  if (env.host === 'tma') {
    return env.os === 'ios' || env.os === 'android' || env.os === 'ipad' ? 'tg://resolve' : 'back';
  }
  if (env.host === 'mobile-web') {
    return 'back';
  }
  return 'back';
}

function defaultTarget(env: RuntimeEnv): LinkTarget {
  if (env.host === 'desktop-web') return '_blank';
  return '_self';
}

export function openLink(href: string, target: LinkTarget = '_blank'): void {
  if (typeof window === 'undefined') return;
  try {
    window.open(href, target, 'noopener,noreferrer');
  } catch {
    try {
      if (target === '_self') {
        window.location.href = href;
      } else {
        window.location.assign(href);
      }
    } catch {}
  }
}

function postTelegramEvent(eventType: string, eventData: object): boolean {
  if (typeof window === 'undefined') return false;
  const w = window as Window & {
    TelegramWebviewProxy?: { postEvent: (t: string, d: string) => void };
    external?: { notify?: (msg: string) => void };
  };

  try {
    if (w.TelegramWebviewProxy?.postEvent) {
      w.TelegramWebviewProxy.postEvent(eventType, JSON.stringify(eventData));
      return true;
    }
  } catch {}

  try {
    if (w.external?.notify) {
      w.external.notify(JSON.stringify({ eventType, eventData }));
      return true;
    }
  } catch {}

  try {
    if (isIframeContext()) {
      window.parent.postMessage(JSON.stringify({ eventType, eventData }), '*');
      return true;
    }
  } catch {}

  return false;
}

function canUseTelegramBridge(): boolean {
  if (!isTelegramClient()) return false;
  const ver = telegramWebAppVersion();
  return (
    isIframeContext() ||
    versionAtLeast(ver, '6.1') ||
    !!(window as Window & { TelegramWebviewProxy?: unknown }).TelegramWebviewProxy
  );
}

/**
 * t.me / telegram deep paths inside Mini App.
 * @see https://core.telegram.org/api/web-events#web-app-open-tg-link
 */
function openTelegramHostedLink(href: string, target: LinkTarget): boolean {
  const u = safeUrl(href);
  if (!u || !isTelegramHosted(href)) return false;

  const pathFull = `${u.pathname}${u.search}${u.hash}`;

  if (canUseTelegramBridge()) {
    if (postTelegramEvent('web_app_open_tg_link', { path_full: pathFull })) {
      return true;
    }
  }

  openLink(href, target);
  return true;
}

/**
 * External http(s) links inside Mini App (Tonkeeper, MyTonWallet, etc.).
 * Must use web_app_open_link — window.open is unreliable in Telegram WebViews.
 * @see https://core.telegram.org/api/web-events#web-app-open-link
 */
function openExternalLinkInTelegram(href: string, target: LinkTarget): boolean {
  if (!isHttpUrl(href)) return false;

  try {
    const webApp = (
      window as Window & {
        Telegram?: {
          WebApp?: { openLink?: (url: string, opts?: { try_instant_view?: boolean }) => void };
        };
      }
    ).Telegram?.WebApp;
    if (typeof webApp?.openLink === 'function') {
      webApp.openLink(href, { try_instant_view: false });
      return true;
    }
  } catch {}

  if (canUseTelegramBridge()) {
    if (
      postTelegramEvent('web_app_open_link', {
        url: href,
        try_instant_view: false,
      })
    ) {
      return true;
    }
  }

  openLink(href, target);
  return true;
}

/**
 * Open a wallet connection URL for the current environment.
 */
export function openWalletLink(universalLink: string, options: OpenWalletLinkOptions = {}): void {
  if (!universalLink || typeof universalLink !== 'string') return;

  let href = universalLink;
  if (href.length > MAX_URL_LEN) {
    href = href.slice(0, MAX_URL_LEN);
  }

  const env = detectRuntimeEnv();
  const ret = options.returnStrategy ?? resolveReturnStrategy(env);
  const primary = withReturnStrategy(href, ret);
  const deep = options.deepLink ? withReturnStrategy(options.deepLink, ret) : undefined;
  const target = options.target ?? defaultTarget(env);

  if (isHttpUrl(primary)) {
    if (env.host === 'tma') {
      if (isTelegramHosted(primary)) {
        openTelegramHostedLink(primary, target);
        return;
      }

      openExternalLinkInTelegram(primary, target);
      return;
    }
    openLink(primary, target);
    return;
  }

  if (deep && isHttpUrl(deep)) {
    if (env.host === 'tma') {
      openExternalLinkInTelegram(deep, target);
      return;
    }
    openLink(deep, target);
    return;
  }

  if (deep && !options.forceUniversal) {
    openLink(deep, '_self');
    return;
  }

  openLink(primary, '_self');
}

export function shouldPreferQr(env: RuntimeEnv = detectRuntimeEnv()): boolean {
  return env.host === 'desktop-web';
}

export interface LinkHandoff {
  open: (universalLink: string, options?: OpenWalletLinkOptions) => void;
  cancel: () => void;
}

/**
 * Reserve a browsing context under the active user gesture (mobile-web).
 * Inside TMA the Mini App bridge does not need a blank window.
 */
export function createLinkHandoff(env = detectRuntimeEnv()): LinkHandoff {
  let placeholder: Window | null = null;

  if (env.host === 'mobile-web') {
    try {
      placeholder = window.open('about:blank', '_blank');
    } catch {
      placeholder = null;
    }
  }

  return {
    open(universalLink: string, options: OpenWalletLinkOptions = {}) {
      const ret = options.returnStrategy ?? resolveReturnStrategy(env);
      const targetUrl = withReturnStrategy(universalLink, ret);
      const target = options.target ?? defaultTarget(env);

      if (placeholder && !placeholder.closed) {
        try {
          placeholder.location.href = targetUrl;
          placeholder = null;
          return;
        } catch {
          try {
            placeholder?.close();
          } catch {}
          placeholder = null;
        }
      }

      openWalletLink(universalLink, { ...options, target });
    },
    cancel() {
      if (placeholder && !placeholder.closed) {
        try {
          placeholder.close();
        } catch {}
      }
      placeholder = null;
    },
  };
}
