/**
 * Wallet discovery with cache.
 * Registry URL: options.walletsRegistry ?? DEFAULT_WALLETS_REGISTRY_URL
 * Always strict-parsed via parseWalletsRegistry.
 */

import { DEFAULT_WALLETS_REGISTRY_URL, STORAGE_KEYS } from '../core/constants';
import { safeJsonParse } from '../core/security';
import type { StorageAdapter } from '../core/storage';
import type { WalletInfo } from '../core/types';
import { assertBrowser } from '../utils/browser';
import { fetchWalletsRegistry, parseWalletsRegistry } from './registry';
import { collectWalletImageUrls, prefetchImages } from '../utils/prefetch-images';

const CACHE_TTL_MS = 60 * 60 * 1000;

interface CachedWallets {
  fetchedAt: number;
  source: string;
  wallets: WalletInfo[];
}

export class WalletDiscovery {
  private cache: WalletInfo[] | null = null;
  private fetchPromise: Promise<WalletInfo[]> | null = null;
  private readonly registryUrl: string;
  private prefetchController: AbortController | null = null;
  /** Fingerprint of the last icon set we already scheduled — avoids restarting prefetch on every getWallets(). */
  private lastPrefetchKey: string | null = null;

  constructor(
    registryUrl: string = DEFAULT_WALLETS_REGISTRY_URL,
    private readonly storage?: StorageAdapter,
  ) {
    this.registryUrl = registryUrl;
  }

  get sourceUrl(): string {
    return this.registryUrl;
  }

  async getWallets(forceRefresh = false): Promise<WalletInfo[]> {
    assertBrowser();

    if (!forceRefresh && this.cache) {
      this.scheduleIconPrefetch(this.cache);
      return this.cache;
    }

    if (!forceRefresh && this.storage) {
      const fromStorage = await this.readCache();
      if (fromStorage) {
        this.cache = fromStorage;
        this.scheduleIconPrefetch(fromStorage);
        return fromStorage;
      }
    }

    if (this.fetchPromise) {
      return this.fetchPromise;
    }

    this.fetchPromise = this.fetchAndCache();
    try {
      const wallets = await this.fetchPromise;
      this.scheduleIconPrefetch(wallets);
      return wallets;
    } finally {
      this.fetchPromise = null;
    }
  }

  /** Cancel in-flight icon prefetches (e.g. bridge.destroy). */
  cancelPrefetch(): void {
    try {
      this.prefetchController?.abort();
    } catch {
      /* ignore */
    }
    this.prefetchController = null;
  }

  /**
   * Warm HTTP cache for wallet icons. Non-blocking; safe to call repeatedly.
   * Deduped + concurrency-limited inside prefetchImages.
   */
  private scheduleIconPrefetch(wallets: WalletInfo[]): void {
    if (typeof window === 'undefined' || wallets.length === 0) return;

    const urls = collectWalletImageUrls(wallets);
    // Stable key so repeated getWallets() (connect + restore) does not abort
    // and restart the same download queue — saves mobile WebView traffic.
    const key = urls.toSorted().join('|');
    if (key === this.lastPrefetchKey && this.prefetchController) {
      return;
    }
    this.lastPrefetchKey = key;

    try {
      this.prefetchController?.abort();
    } catch {
      /* ignore */
    }
    const ac = new AbortController();
    this.prefetchController = ac;

    // Detached promise — errors must not surface to callers
    void prefetchImages(urls, { signal: ac.signal }).catch(() => undefined);
  }

  async getWalletByAppName(appName: string): Promise<WalletInfo | null> {
    const list = await this.getWallets();
    return list.find((w) => w.app_name === appName) ?? null;
  }

  async getSupportedWallets(opts?: {
    platform?: string;
    requireSendTransaction?: boolean;
  }): Promise<WalletInfo[]> {
    const list = await this.getWallets();
    return list.filter((w) => {
      if (opts?.platform && !w.platforms.includes(opts.platform)) {
        return false;
      }
      if (opts?.requireSendTransaction) {
        const has = w.features.some((f) => f.name === 'SendTransaction');
        if (!has) return false;
      }
      return true;
    });
  }

  private async fetchAndCache(): Promise<WalletInfo[]> {
    try {
      const wallets = await fetchWalletsRegistry(this.registryUrl);
      this.cache = wallets;
      await this.writeCache(wallets);
      return wallets;
    } catch (e) {
      // Stale-if-error: prefer a previously valid list over hard failure when
      // the CDN is temporarily unreachable (enterprise UX).
      const stale = await this.readCache({ allowStale: true });
      if (stale && stale.length > 0) {
        this.cache = stale;
        return stale;
      }
      throw e;
    }
  }

  private async readCache(opts?: { allowStale?: boolean }): Promise<WalletInfo[] | null> {
    if (!this.storage) return null;
    try {
      const raw = await this.storage.getItem(STORAGE_KEYS.WALLETS_CACHE);
      if (!raw) return null;
      const parsed = safeJsonParse<CachedWallets>(raw, 'wallets cache');
      if (!parsed || typeof parsed.fetchedAt !== 'number' || !Array.isArray(parsed.wallets)) {
        return null;
      }
      if (parsed.source && parsed.source !== this.registryUrl) {
        return null;
      }
      if (!opts?.allowStale && Date.now() - parsed.fetchedAt > CACHE_TTL_MS) {
        return null;
      }
      // Re-validate cached entries
      return parseWalletsRegistry(parsed.wallets, 'cache');
    } catch {
      return null;
    }
  }

  private async writeCache(wallets: WalletInfo[]): Promise<void> {
    if (!this.storage) return;
    try {
      const payload: CachedWallets = {
        fetchedAt: Date.now(),
        source: this.registryUrl,
        wallets,
      };
      await this.storage.setItem(STORAGE_KEYS.WALLETS_CACHE, JSON.stringify(payload));
    } catch {
      // non-critical
    }
  }
}
