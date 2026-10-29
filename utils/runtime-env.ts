/**
 * Runtime host detection for link-opening policy.
 * Pure heuristics — no Telegram SDK dependency.
 *
 * Important distinction:
 * - Mini App (TMA): launched via bot / attachment menu — WebApp.initData present,
 *   postEvent web_app_open_* works.
 * - Telegram in-app browser: user opened an https link inside Telegram —
 *   may expose a stub Telegram.WebApp, but Mini App events are NO-OPS.
 *   Must open links via normal navigation / <a>.click(), not web_app_open_link.
 */

export type HostKind = 'tma' | 'mobile-web' | 'desktop-web';

export type OsKind = 'ios' | 'android' | 'ipad' | 'macos' | 'windows' | 'linux' | 'unknown';

export interface RuntimeEnv {
  host: HostKind;
  os: OsKind;
  /** True Mini App session (initData / tgWebApp* launch params) */
  isTelegramMiniApp: boolean;
  /** Any Telegram client signal (UA / stub WebApp) — broader than Mini App */
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

/**
 * True when the page was opened as a Telegram Mini App.
 * Do NOT treat a bare Telegram.WebApp object as sufficient — in-app browser
 * may inject an empty/stub WebApp without initData.
 */
export function isTelegramMiniApp(): boolean {
  if (typeof window === 'undefined') return false;

  try {
    const q = new URLSearchParams(window.location.search);
    if (q.has('tgWebAppData') || q.has('tgWebAppVersion') || q.has('tgWebAppPlatform')) {
      return true;
    }
  } catch {
    /* ignore */
  }

  try {
    const hash = window.location.hash || '';
    if (
      hash.includes('tgWebAppData') ||
      hash.includes('tgWebAppVersion') ||
      hash.includes('tgWebAppPlatform')
    ) {
      return true;
    }
  } catch {
    /* ignore */
  }

  try {
    const wa = (
      window as Window & {
        Telegram?: {
          WebApp?: {
            initData?: string;
            initDataUnsafe?: Record<string, unknown>;
            version?: string;
            platform?: string;
          };
        };
      }
    ).Telegram?.WebApp;

    if (!wa) return false;

    if (typeof wa.initData === 'string' && wa.initData.length > 0) {
      return true;
    }

    const unsafe = wa.initDataUnsafe;
    if (unsafe && typeof unsafe === 'object') {
      // Real Mini App sessions populate user / chat / auth_date etc.
      if (
        'user' in unsafe ||
        'receiver' in unsafe ||
        'chat' in unsafe ||
        'auth_date' in unsafe ||
        'hash' in unsafe
      ) {
        return true;
      }
    }
  } catch {
    /* ignore */
  }

  return false;
}

/**
 * Broad Telegram environment signal (Mini App OR in-app browser OR desktop client shell).
 * Prefer isTelegramMiniApp() when deciding whether web_app_* events work.
 */
export function isTelegramClient(): boolean {
  if (typeof window === 'undefined') return false;
  if (isTelegramMiniApp()) return true;

  const w = window as Window & {
    Telegram?: { WebApp?: unknown };
    TelegramWebviewProxy?: { postEvent?: (type: string, data: string) => void };
  };
  if (w.Telegram?.WebApp) return true;
  if (w.TelegramWebviewProxy?.postEvent) return true;

  const ua = readUa().toLowerCase();
  if (ua.includes('telegram')) return true;

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
  const miniApp = isTelegramMiniApp();
  const tg = isTelegramClient();
  const iframe = isIframeContext();

  let host: HostKind;
  if (miniApp) {
    // Only real Mini Apps get TMA open strategy (web_app_open_*)
    host = 'tma';
  } else if (isMobileOs(os)) {
    // Includes Telegram in-app browser on mobile
    host = 'mobile-web';
  } else {
    host = 'desktop-web';
  }

  return {
    host,
    os,
    isTelegramMiniApp: miniApp,
    isTelegramClient: tg,
    isIframe: iframe,
  };
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
