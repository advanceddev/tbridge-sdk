/**
 * Explicit modal state machine (list ↔ waiting).
 * Pure types + transitions — no DOM here.
 */

import type { WalletInfo } from '../core/types';
import type { TBridgeLocale } from './i18n';
import type { TBridgeTheme } from './theme';

export type ModalMode = 'list' | 'waiting';

export interface WaitingViewOpts {
  message: string;
  qrDataUrl?: string | null;
  link?: string;
  preferOpen?: boolean;
  error?: boolean;
  wallet?: WalletInfo;
}

export interface ModalState {
  mode: ModalMode;
  locale: TBridgeLocale;
  theme: TBridgeTheme;
  wallets: WalletInfo[];
  recentAppName: string | null;
  /** Fixed title from host; when set, i18n does not override. */
  fixedTitle: string | null;
  closed: boolean;
  waiting: WaitingViewOpts | null;
}

export type ModalAction =
  | { type: 'show_list' }
  | { type: 'set_waiting'; payload: WaitingViewOpts }
  | { type: 'set_wallets'; wallets: WalletInfo[] }
  | { type: 'set_locale'; locale: TBridgeLocale }
  | { type: 'set_theme'; theme: TBridgeTheme }
  | { type: 'close' };

export function createInitialState(input: {
  wallets: WalletInfo[];
  locale: TBridgeLocale;
  theme: TBridgeTheme;
  recentAppName?: string | null;
  fixedTitle?: string | null;
}): ModalState {
  return {
    mode: 'list',
    locale: input.locale,
    theme: input.theme,
    wallets: input.wallets,
    recentAppName: input.recentAppName ?? null,
    fixedTitle: input.fixedTitle ?? null,
    closed: false,
    waiting: null,
  };
}

/** Pure reducer — UI layer applies side effects after reduce. */
export function reduceModal(state: ModalState, action: ModalAction): ModalState {
  if (state.closed && action.type !== 'close') {
    return state;
  }

  switch (action.type) {
    case 'show_list':
      return { ...state, mode: 'list', waiting: null };
    case 'set_waiting':
      return { ...state, mode: 'waiting', waiting: action.payload };
    case 'set_wallets':
      return { ...state, wallets: action.wallets };
    case 'set_locale':
      return { ...state, locale: action.locale };
    case 'set_theme':
      return { ...state, theme: action.theme };
    case 'close':
      return { ...state, closed: true, waiting: null };
    default:
      return state;
  }
}

/** Recent wallet first; stable otherwise. */
export function sortWalletsForGrid(
  wallets: WalletInfo[],
  recentAppName: string | null,
): WalletInfo[] {
  if (!recentAppName) return wallets.slice();
  return wallets.toSorted((a, b) => {
    const aRecent = a.app_name === recentAppName;
    const bRecent = b.app_name === recentAppName;
    if (aRecent && !bRecent) return -1;
    if (!aRecent && bRecent) return 1;
    return 0;
  });
}
