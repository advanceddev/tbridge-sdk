/**
 * Wallets registry fetch + strict parse.
 * Default source: official TON wallets list URL.
 * Override via TBridgeOptions.walletsRegistry.
 *
 * Fail closed: malformed entries are rejected; empty list is an error.
 */

import { DEFAULT_WALLETS_REGISTRY_URL } from '../core/constants';
import { TBridgeError } from '../core/errors';
import { safeJsonParse } from '../core/security';
import type {
  JsBridgeConfig,
  SseBridgeConfig,
  WalletBridgeConfig,
  WalletFeature,
  WalletInfo,
} from '../core/types';

export { DEFAULT_WALLETS_REGISTRY_URL };

export function parseWalletEntry(value: unknown): WalletInfo | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;

  if (typeof v.app_name !== 'string' || !v.app_name.trim()) return null;
  if (typeof v.name !== 'string' || !v.name.trim()) return null;
  if (!Array.isArray(v.bridge) || v.bridge.length === 0) return null;
  if (!Array.isArray(v.platforms)) return null;
  if (!Array.isArray(v.features)) return null;

  const bridges: WalletBridgeConfig[] = [];
  for (const b of v.bridge) {
    const parsed = parseBridge(b);
    if (parsed) bridges.push(parsed);
  }
  if (bridges.length === 0) return null;

  const features: WalletFeature[] = [];
  for (const f of v.features) {
    const parsed = parseFeature(f);
    if (parsed) features.push(parsed);
  }

  const platforms = v.platforms.filter((p): p is string => typeof p === 'string');

  const info: WalletInfo = {
    app_name: v.app_name.trim(),
    name: v.name.trim(),
    image: typeof v.image === 'string' ? v.image : '',
    about_url: typeof v.about_url === 'string' ? v.about_url : '',
    bridge: bridges,
    platforms,
    features,
  };

  if (typeof v.universal_url === 'string' && v.universal_url && isSafeWalletLink(v.universal_url)) {
    info.universal_url = v.universal_url;
  }
  if (typeof v.deepLink === 'string' && v.deepLink && isSafeWalletLink(v.deepLink)) {
    info.deepLink = v.deepLink;
  }
  if (typeof v.tondns === 'string' && v.tondns) {
    info.tondns = v.tondns;
  }

  return info;
}

function parseBridge(value: unknown): WalletBridgeConfig | null {
  if (!value || typeof value !== 'object') return null;
  const b = value as Record<string, unknown>;
  if (b.type === 'js' && typeof b.key === 'string' && b.key.trim()) {
    return { type: 'js', key: b.key.trim() } satisfies JsBridgeConfig;
  }
  if (b.type === 'sse' && typeof b.url === 'string' && isHttpUrl(b.url)) {
    return { type: 'sse', url: b.url.trim() } satisfies SseBridgeConfig;
  }
  return null;
}

function parseFeature(value: unknown): WalletFeature | null {
  if (!value || typeof value !== 'object') return null;
  const f = value as Record<string, unknown>;
  if (typeof f.name !== 'string' || !f.name) return null;

  if (f.name === 'SendTransaction') {
    const maxMessages =
      typeof f.maxMessages === 'number' && f.maxMessages > 0
        ? Math.min(Math.floor(f.maxMessages), 255)
        : 4;
    return {
      name: 'SendTransaction',
      maxMessages,
      extraCurrencySupported: f.extraCurrencySupported === true,
    };
  }

  if (f.name === 'SignData') {
    const types = Array.isArray(f.types)
      ? f.types.filter(
          (t): t is 'text' | 'binary' | 'cell' => t === 'text' || t === 'binary' || t === 'cell',
        )
      : [];
    return { name: 'SignData', types };
  }

  return { name: f.name };
}

function isHttpUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch {
    return false;
  }
}

/** Reject javascript:/data:/vbscript: and other dangerous schemes from registry. */
function isSafeWalletLink(url: string): boolean {
  try {
    const u = new URL(url);
    if (/^(javascript|data|vbscript|file|blob):/i.test(u.protocol)) return false;
    if (u.protocol === 'https:' || u.protocol === 'http:') return true;
    // Custom schemes used by wallets (tc:, tonkeeper:, tonhub:, …)
    return /^[a-z][a-z0-9+.-]*:$/i.test(u.protocol);
  } catch {
    return false;
  }
}

/**
 * Parse full registry JSON (array of wallets).
 * Throws if not an array or if zero valid wallets remain.
 */
export function parseWalletsRegistry(data: unknown, sourceLabel: string): WalletInfo[] {
  if (!Array.isArray(data)) {
    throw new TBridgeError(
      'INVALID_PAYLOAD',
      `Wallets registry from ${sourceLabel} must be a JSON array`,
    );
  }

  const wallets: WalletInfo[] = [];
  const seen = new Set<string>();

  for (const entry of data) {
    const wallet = parseWalletEntry(entry);
    if (!wallet) continue;
    if (seen.has(wallet.app_name)) continue;
    seen.add(wallet.app_name);
    wallets.push(wallet);
  }

  if (wallets.length === 0) {
    throw new TBridgeError(
      'INVALID_PAYLOAD',
      `Wallets registry from ${sourceLabel} is empty or has no valid entries`,
    );
  }

  return wallets;
}

/**
 * Fetch + strict-parse registry from URL.
 */
export async function fetchWalletsRegistry(url: string): Promise<WalletInfo[]> {
  let resolved: URL;
  try {
    resolved = new URL(url);
  } catch {
    throw new TBridgeError('INVALID_PAYLOAD', `Invalid walletsRegistry URL: ${url}`);
  }
  if (resolved.protocol !== 'https:' && resolved.protocol !== 'http:') {
    throw new TBridgeError('INVALID_PAYLOAD', 'walletsRegistry URL must be http(s)');
  }

  let response: Response;
  try {
    response = await fetch(resolved.toString(), {
      method: 'GET',
      headers: { Accept: 'application/json' },
      credentials: 'omit',
      cache: 'no-cache',
      signal: AbortSignal.timeout(10_000),
    });
  } catch (e) {
    throw new TBridgeError('BRIDGE_UNAVAILABLE', `Failed to fetch wallets registry from ${url}`, e);
  }

  if (!response.ok) {
    throw new TBridgeError(
      'BRIDGE_UNAVAILABLE',
      `Wallets registry returned HTTP ${response.status}`,
    );
  }

  const text = await response.text();
  const data = safeJsonParse<unknown>(text, 'wallets registry');
  return parseWalletsRegistry(data, url);
}
