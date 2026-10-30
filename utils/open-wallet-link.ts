/**
 * Platform-aware wallet link launcher.
 *
 * Priority:
 * 1. HTTPS/HTTP universal link when available
 * 2. Real Telegram Mini App only:
 *    - t.me → web_app_open_tg_link
 *    - other http(s) → web_app_open_link / WebApp.openLink
 * 3. Telegram in-app browser & mobile web → window.open / <a target=_blank> (keep page + SSE)
 * 4. Custom schemes only if primary is not http(s)
 *
 * Why Mini App vs in-app browser matters:
 * Telegram's embedded browser may expose a stub Telegram.WebApp. Calling
 * web_app_open_link there reports success but does nothing. window.open is
 * often blocked. Programmatic <a> navigation is the reliable path.
 */

import {
  detectRuntimeEnv,
  isIframeContext,
  isMobileOs,
  isTelegramMiniApp,
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
  return !!u && (u.hostname === 't.me' || u.hostname.endsWith('.t.me'));
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

function defaultTarget(_env: RuntimeEnv): LinkTarget {
  // Always prefer a new browsing context so the dApp page (and its SSE)
  // stays alive. Same-tab navigation kills EventSource and shows
  // "SSE connection failed" after the user returns.
  return '_blank';
}

/**
 * Most reliable open under user gesture in restricted WebViews:
 * synthetic <a> click, then window.open, then location.assign.
 */
export function openLink(href: string, target: LinkTarget = '_blank'): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  /**
   * Never navigate the current document when opening wallet connect links.
   * In Telegram in-app browser, location.assign / <a target=_self> leaves the
   * dApp page, drops EventSource, and after Back the UI shows bridge errors.
   * Prefer a new context; if that fails, leave the page alone (user still has
   * "Open in wallet" / Copy).
   */
  const preserveDocument = target !== '_self';

  // 1) window.open — best chance to keep current page
  if (target === '_blank') {
    try {
      const win = window.open(href, '_blank', 'noopener,noreferrer');
      if (win) return;
    } catch {
      /* continue */
    }
  }

  // 2) Synthetic <a> with the requested target
  try {
    const a = document.createElement('a');
    a.href = href;
    a.target = target;
    a.rel = 'noopener noreferrer';
    a.style.cssText = 'position:fixed;left:-9999px;top:0;width:1px;height:1px;opacity:0';
    document.body.appendChild(a);
    a.click();
    a.remove();
    if (preserveDocument) return;
  } catch {
    /* continue */
  }

  // 3) Same-document navigation — only when caller explicitly asked for _self
  //    (e.g. rare custom-scheme attempts). Never for default wallet HTTPS opens.
  if (!preserveDocument) {
    try {
      window.location.assign(href);
    } catch {
      /* ignore */
    }
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
  } catch {
    /* continue */
  }

  try {
    if (w.external?.notify) {
      w.external.notify(JSON.stringify({ eventType, eventData }));
      return true;
    }
  } catch {
    /* continue */
  }

  // Do NOT postMessage to parent unless we are a real Mini App —
  // in-app browser iframes would swallow the message silently.
  try {
    if (isTelegramMiniApp() && isIframeContext()) {
      window.parent.postMessage(JSON.stringify({ eventType, eventData }), '*');
      return true;
    }
  } catch {
    /* continue */
  }

  return false;
}

function canUseMiniAppBridge(): boolean {
  if (!isTelegramMiniApp()) return false;
  const ver = telegramWebAppVersion();
  return (
    isIframeContext() ||
    versionAtLeast(ver, '6.1') ||
    !!(window as Window & { TelegramWebviewProxy?: unknown }).TelegramWebviewProxy ||
    !!(window as Window & { Telegram?: { WebApp?: { openLink?: unknown } } }).Telegram?.WebApp
      ?.openLink
  );
}

/**
 * t.me links inside a real Mini App.
 */
function openTelegramHostedLink(href: string, target: LinkTarget): boolean {
  const u = safeUrl(href);
  if (!u || !isTelegramHosted(href)) return false;

  const pathFull = `${u.pathname}${u.search}${u.hash}`;

  if (canUseMiniAppBridge()) {
    if (postTelegramEvent('web_app_open_tg_link', { path_full: pathFull })) {
      return true;
    }
  }

  openLink(href, target);
  return true;
}

/**
 * External http(s) inside a real Mini App only.
 * Always fall back to openLink if bridge is unavailable — never claim success
 * without a real Mini App session.
 */
function openExternalLinkInMiniApp(href: string, target: LinkTarget): boolean {
  if (!isHttpUrl(href) || !isTelegramMiniApp()) {
    openLink(href, target);
    return true;
  }

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
  } catch {
    /* continue */
  }

  if (canUseMiniAppBridge()) {
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

  // 1) Primary is http(s)
  if (isHttpUrl(primary)) {
    if (env.host === 'tma' && isTelegramMiniApp()) {
      if (isTelegramHosted(primary)) {
        openTelegramHostedLink(primary, target);
        return;
      }
      openExternalLinkInMiniApp(primary, target);
      return;
    }
    // mobile-web, desktop-web, Telegram in-app browser → normal navigation
    openLink(primary, target);
    return;
  }

  // 2) Primary is not http(s). Prefer deepLink if it is http(s).
  if (deep && isHttpUrl(deep)) {
    if (env.host === 'tma' && isTelegramMiniApp()) {
      openExternalLinkInMiniApp(deep, target);
      return;
    }
    openLink(deep, target);
    return;
  }

  // 3) Custom scheme only when nothing better exists
  if (deep && !options.forceUniversal) {
    openLink(deep, '_self');
    return;
  }

  openLink(primary, '_self');
}

/**
 * Whether the connect UI should automatically open the wallet link.
 *
 * Policy:
 * - Mobile OS / mobile-web: always auto-open (browser, Telegram in-app browser, mobile TMA)
 * - Desktop: never auto-open, except Telegram wallet inside a Telegram client
 *   (desktop Mini App or desktop Telegram shell) — remote wallets stay on QR + Open button
 */
export function shouldAutoOpenConnectLink(
  env: RuntimeEnv,
  wallet: { app_name?: string; name?: string; universal_url?: string; deepLink?: string },
): boolean {
  if (isMobileOs(env.os) || env.host === 'mobile-web') {
    return true;
  }

  // Desktop (desktop-web or desktop Telegram Mini App)
  if (isTelegramWalletIdentity(wallet) && (env.isTelegramMiniApp || env.isTelegramClient)) {
    return true;
  }

  return false;
}

/** Heuristic: official Telegram Wallet / Wallet in Telegram */
export function isTelegramWalletIdentity(wallet: {
  app_name?: string;
  name?: string;
  universal_url?: string;
  deepLink?: string;
}): boolean {
  const app = (wallet.app_name ?? '').toLowerCase();
  const name = (wallet.name ?? '').toLowerCase();
  if (app.includes('telegram') || name.includes('telegram')) return true;

  const links = [wallet.universal_url, wallet.deepLink].filter(Boolean) as string[];
  for (const href of links) {
    try {
      const u = new URL(href);
      if (u.hostname === 't.me' || u.hostname.endsWith('.t.me')) return true;
    } catch {
      if (/^tg:\/\//i.test(href)) return true;
    }
  }
  return false;
}

export function shouldPreferQr(env: RuntimeEnv = detectRuntimeEnv()): boolean {
  return env.host === 'desktop-web';
}

export interface LinkHandoff {
  open: (universalLink: string, options?: OpenWalletLinkOptions) => void;
  cancel: () => void;
}

/**
 * Reserve a browsing context under the active user gesture (mobile-web only).
 *
 * Skipped when:
 * - not mobile-web (desktop uses QR; Mini App uses web_app_*)
 * - Telegram in-app browser / any Telegram client shell — window.open('about:blank')
 *   leaves a blank tab and confuses the WebView; open the real URL via openLink instead
 */
export function createLinkHandoff(env = detectRuntimeEnv()): LinkHandoff {
  let placeholder: Window | null = null;

  const allowPlaceholder =
    env.host === 'mobile-web' && !env.isTelegramClient && !env.isTelegramMiniApp;

  if (allowPlaceholder) {
    try {
      const win = window.open('about:blank', '_blank');
      // Some WebViews return a window that is immediately unusable
      if (win && !win.closed) {
        placeholder = win;
      } else if (win) {
        try {
          win.close();
        } catch {
          /* ignore */
        }
      }
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
          } catch {
            /* ignore */
          }
          placeholder = null;
        }
      }

      openWalletLink(universalLink, { ...options, target });
    },
    cancel() {
      if (placeholder && !placeholder.closed) {
        try {
          placeholder.close();
        } catch {
          /* ignore */
        }
      }
      placeholder = null;
    },
  };
}
