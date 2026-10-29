/**
 * Browser environment helpers.
 * All public entry points must call assertBrowser() first.
 */

import { assertBrowser } from '../core/errors';
import type { InjectedWalletBridge } from '../core/types';

export { assertBrowser };

/**
 * Canonical property name wallets use for the injected bridge object.
 * Kept as a constant so call sites never hard-code product names.
 */
export const INJECTED_BRIDGE_PROP = 'tonconnect' as const;

export function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof document !== 'undefined';
}

/**
 * Safely read an injected JS bridge from window[key][INJECTED_BRIDGE_PROP].
 * Returns null if the key is missing or the shape is wrong.
 */
export function getInjectedBridge(key: string): InjectedWalletBridge | null {
  if (!isBrowser()) return null;

  try {
    const root = (window as unknown as Record<string, unknown>)[key];
    if (!root || typeof root !== 'object') return null;

    const bridge = (root as Record<string, unknown>)[INJECTED_BRIDGE_PROP];
    if (!bridge || typeof bridge !== 'object') return null;

    const b = bridge as Record<string, unknown>;
    if (typeof b.connect !== 'function') return null;
    if (typeof b.send !== 'function') return null;

    return bridge as InjectedWalletBridge;
  } catch {
    return null;
  }
}

/**
 * Detect whether we are running inside a wallet browser / extension
 * by scanning known JS bridge keys from a wallets registry.
 */
export function detectInjectedWallet(
  wallets: Array<{ app_name: string; bridge: Array<{ type: string; key?: string }> }>,
): { appName: string; key: string; bridge: InjectedWalletBridge } | null {
  if (!isBrowser()) return null;

  for (const w of wallets) {
    for (const b of w.bridge) {
      if (b.type === 'js' && b.key) {
        const injected = getInjectedBridge(b.key);
        if (injected) {
          return { appName: w.app_name, key: b.key, bridge: injected };
        }
      }
    }
  }
  return null;
}
