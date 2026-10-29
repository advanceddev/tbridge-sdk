/**
 * Browser image cache warm-up for wallet icons.
 *
 * Strategy:
 * - Fire-and-forget after registry load (never blocks connect UI)
 * - Only https (isSafeImageUrl) — no javascript: / data: surprises
 * - Bounded concurrency for Telegram WebViews
 * - Deduped URLs; AbortSignal for teardown
 * - Uses Image() decode path so the HTTP cache is populated for later <img src>
 *
 */

import { isSafeImageUrl } from '../core/security';

/** Default parallel downloads — keep low for mobile WebViews */
export const IMAGE_PREFETCH_CONCURRENCY = 4;

/** Per-image soft timeout (ms); slow CDN must not hold the queue forever */
export const IMAGE_PREFETCH_TIMEOUT_MS = 8_000;

export interface PrefetchImagesOptions {
  concurrency?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
}

/**
 * Warm the browser cache for a list of image URLs.
 * Resolves when the queue drains (or signal aborts). Individual failures are ignored.
 */
export async function prefetchImages(
  urls: readonly string[],
  options: PrefetchImagesOptions = {},
): Promise<void> {
  if (typeof window === 'undefined' || typeof Image === 'undefined') return;

  const concurrency = Math.max(1, options.concurrency ?? IMAGE_PREFETCH_CONCURRENCY);
  const timeoutMs = options.timeoutMs ?? IMAGE_PREFETCH_TIMEOUT_MS;
  const signal = options.signal;

  if (signal?.aborted) return;

  const unique: string[] = [];
  const seen = new Set<string>();
  for (const raw of urls) {
    if (typeof raw !== 'string' || !raw) continue;
    if (!isSafeImageUrl(raw)) continue;
    if (seen.has(raw)) continue;
    seen.add(raw);
    unique.push(raw);
  }

  if (unique.length === 0) return;

  let index = 0;

  const worker = async (): Promise<void> => {
    while (index < unique.length) {
      if (signal?.aborted) return;
      const url = unique[index++]!;
      await loadOne(url, timeoutMs, signal);
    }
  };

  const workers = Array.from({ length: Math.min(concurrency, unique.length) }, () => worker());
  await Promise.all(workers);
}

function loadOne(url: string, timeoutMs: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted) {
      resolve();
      return;
    }

    const img = new Image();
    let settled = false;

    const finish = (): void => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve();
    };

    const onAbort = (): void => finish();
    const timer = window.setTimeout(finish, timeoutMs);

    const cleanup = (): void => {
      window.clearTimeout(timer);
      img.removeEventListener('load', finish);
      img.removeEventListener('error', finish);
      img.removeEventListener('abort', finish);
      try {
        signal?.removeEventListener('abort', onAbort);
      } catch {
        /* ignore */
      }
    };

    img.addEventListener('load', finish, { once: true });
    img.addEventListener('error', finish, { once: true });
    img.addEventListener('abort', finish, { once: true });
    img.decoding = 'async';
    img.referrerPolicy = 'no-referrer';

    try {
      signal?.addEventListener('abort', onAbort, { once: true });
    } catch {
      /* ignore */
    }

    try {
      img.src = url;
      // If already cached, complete may be sync in some engines
      if (img.complete && img.naturalWidth > 0) {
        finish();
      }
    } catch {
      finish();
    }
  });
}

/** Extract safe image URLs from wallet-like objects */
export function collectWalletImageUrls(
  wallets: ReadonlyArray<{ image?: string | null }>,
): string[] {
  const out: string[] = [];
  for (const w of wallets) {
    if (w.image) out.push(w.image);
  }
  return out;
}
