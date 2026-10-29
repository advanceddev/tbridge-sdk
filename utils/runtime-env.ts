/**
 * Runtime host detection for link-opening policy.
 * Pure heuristics — no Telegram SDK dependency.
 */

export type HostKind = 'tma' | 'mobile-web' | 'desktop-web';

export type OsKind = 'ios' | 'android' | 'ipad' | 'macos' | 'windows' | 'linux' | 'unknown';

export interface RuntimeEnv {
  host: HostKind;
  os: OsKind;
  /** Telegram.WebApp or TelegramWebviewProxy present */
  isTelegramClient: boolean;
  /** Running inside an iframe (common for web Telegram) */
  isIframe: boolean;
}

function readUa(): string {
  if (typeof navigator === 'undefined') return '';
  return navigator.userAgent || '';
}

export function detectOs(ua = readUa()): OsKind {
  const s = ua.toLowerCase();
  if (
    /ipad/.test(s) ||
    (/(macintosh|mac os)/.test(s) &&
      (navigator as Navigator & { maxTouchPoints?: number }).maxTouchPoints! > 1)
  ) {
    return 'ipad';
  }
  if (/iphone|ipod/.test(s)) return 'ios';
  if (/android/.test(s)) return 'android';
  if (/mac os|macintosh/.test(s)) return 'macos';
  if (/windows/.test(s)) return 'windows';
  if (/linux/.test(s)) return 'linux';
  return 'unknown';
}

export function isMobileOs(os: OsKind = detectOs()): boolean {
  return os === 'ios' || os === 'android' || os === 'ipad';
}

export function isTelegramClient(): boolean {
  if (typeof window === 'undefined') return false;
  const w = window as Window & {
    Telegram?: { WebApp?: unknown };
    TelegramWebviewProxy?: { postEvent?: (type: string, data: string) => void };
  };
  if (w.Telegram?.WebApp) return true;
  if (w.TelegramWebviewProxy?.postEvent) return true;
  try {
    const q = new URLSearchParams(window.location.search);
    if (q.has('tgWebAppData') || q.has('tgWebAppVersion') || q.has('tgWebAppPlatform')) {
      return true;
    }
  } catch {}
  return false;
}

export function isIframeContext(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.parent !== null && window.parent !== window;
  } catch {
    return true;
  }
}

export function detectRuntimeEnv(): RuntimeEnv {
  const os = detectOs();
  const tg = isTelegramClient();
  const iframe = isIframeContext();
  let host: HostKind;
  if (tg) host = 'tma';
  else if (isMobileOs(os)) host = 'mobile-web';
  else host = 'desktop-web';
  return { host, os, isTelegramClient: tg, isIframe: iframe };
}

/** Best-effort Telegram WebApp version string, or null. */
export function telegramWebAppVersion(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const v = (window as Window & { Telegram?: { WebApp?: { version?: string } } }).Telegram?.WebApp
      ?.version;
    return typeof v === 'string' ? v : null;
  } catch {
    return null;
  }
}

export function versionAtLeast(current: string | null, min: string): boolean {
  if (!current) return false;
  const a = current.split('.').map((x) => parseInt(x, 10) || 0);
  const b = min.split('.').map((x) => parseInt(x, 10) || 0);
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    if (x > y) return true;
    if (x < y) return false;
  }
  return true;
}
