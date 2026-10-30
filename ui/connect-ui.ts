/**
 * High-level connect UI — framework agnostic.
 * Opens wallets via utils/open-wallet-link (TMA / mobile / desktop).
 */

import type { TBridge } from '../wallet/connector';
import type { ConnectionStatus, WalletInfo } from '../core/types';
import { TBridgeError } from '../core/errors';
import { renderQrToDataUrl } from '../utils/qr';
import { detectRuntimeEnv } from '../utils/runtime-env';
import {
  createLinkHandoff,
  openWalletLink,
  shouldAutoOpenConnectLink,
  type LinkHandoff,
} from '../utils/open-wallet-link';
import { openWalletModal, type WalletModalHandle } from './modal';
import { t, type TBridgeLocale } from './i18n';
import type { TBridgeTheme } from './theme';

export interface ConnectWithUiOptions {
  filterWallets?: (wallets: WalletInfo[]) => WalletInfo[];
  title?: string;
  /**
   * Override link opening. Receives the connect URL and wallet metadata.
   * Default uses platform-aware openWalletLink / gesture handoff.
   */
  openLink?: (link: string, wallet: WalletInfo) => void;
  /** Force QR even on mobile / TMA */
  preferQr?: boolean;
  locale?: TBridgeLocale;
  theme?: TBridgeTheme;
}

export async function connectWithUi(
  bridge: TBridge,
  options: ConnectWithUiOptions = {},
): Promise<ConnectionStatus> {
  if (bridge.isConnected) {
    return bridge.connectionStatus;
  }

  const locale = options.locale ?? bridge.getLocale();
  const theme = options.theme ?? bridge.getTheme();
  const env = detectRuntimeEnv();

  const injected = await bridge.detectInjected();
  if (injected) {
    return bridge.connect({ appName: injected.appName });
  }

  let wallets = await bridge.getWallets();
  if (options.filterWallets) {
    wallets = options.filterWallets(wallets);
  }

  const recentAppName = await bridge.getLastWalletAppName();

  return new Promise<ConnectionStatus>((resolve, reject) => {
    let modal: WalletModalHandle | null = null;
    let settled = false;
    let selectedWallet: WalletInfo | null = null;
    let connectAttemptId = 0;
    let backRequested = false;
    let handoff: LinkHandoff | null = null;

    const finish = (err?: unknown, status?: ConnectionStatus) => {
      if (settled) return;
      settled = true;
      handoff?.cancel();
      handoff = null;
      modal?.close({ silent: true });
      modal = null;
      if (err) reject(err);
      else resolve(status!);
    };

    modal = openWalletModal({
      wallets,
      title: options.title,
      locale,
      theme,
      recentAppName,
      onClose: () => {
        handoff?.cancel();
        handoff = null;
        bridge.cancelConnect();
        finish(new TBridgeError('USER_REJECTED', 'Wallet picker closed'));
      },
      onBackFromWaiting: () => {
        backRequested = true;
        selectedWallet = null;
        handoff?.cancel();
        handoff = null;
        bridge.cancelConnect();
        connectAttemptId += 1;
      },
      onSelect: (wallet) => {
        selectedWallet = wallet;
        backRequested = false;
        const currentAttemptId = ++connectAttemptId;

        // Auto-open policy (mobile always; desktop only Telegram wallet in Telegram).
        // options.preferQr === true forces QR-only (no auto-open).
        const autoOpen = options.preferQr === true ? false : shouldAutoOpenConnectLink(env, wallet);

        // Reserve a browsing context under the active user gesture when we will open.
        handoff?.cancel();
        handoff = autoOpen ? createLinkHandoff(env) : null;

        modal?.setWaiting(t(locale, 'waiting.preparing'), { wallet });

        bridge
          .connect({
            appName: wallet.app_name,
            onConnectLink: (link) => {
              if (currentAttemptId !== connectAttemptId || settled || backRequested) {
                handoff?.cancel();
                handoff = null;
                return;
              }

              // Auto-open when policy allows; desktop otherwise waits for "Open in wallet".
              // QR is always rendered as a fallback.
              if (autoOpen) {
                if (options.openLink) {
                  options.openLink(link, wallet);
                } else if (handoff) {
                  handoff.open(link, { deepLink: wallet.deepLink });
                  handoff = null;
                } else {
                  openWalletLink(link, { deepLink: wallet.deepLink });
                }
              }

              void (async () => {
                if (currentAttemptId !== connectAttemptId || settled || backRequested) {
                  return;
                }
                const qr = await renderQrToDataUrl(link, { logoUrl: wallet.image });
                if (currentAttemptId !== connectAttemptId || settled || backRequested) {
                  return;
                }
                const msg = qr
                  ? t(locale, 'waiting.scan')
                  : autoOpen
                    ? t(locale, 'waiting.confirm')
                    : t(locale, 'waiting.open');
                modal?.setWaiting(msg, {
                  qrDataUrl: qr,
                  link,
                  preferOpen: true,
                  wallet,
                });
              })();
            },
          })
          .then((status) => {
            if (currentAttemptId !== connectAttemptId) return;
            finish(undefined, status);
          })
          .catch((e) => {
            if (currentAttemptId !== connectAttemptId) return;
            if (backRequested) {
              backRequested = false;
              handoff?.cancel();
              handoff = null;
              return;
            }
            if (TBridgeError.is(e) && e.code === 'USER_REJECTED') {
              if (!settled) finish(e);
              return;
            }
            if (!settled && modal) {
              handoff?.cancel();
              handoff = null;
              modal.setWaiting(e instanceof Error ? e.message : t(locale, 'waiting.failed'), {
                error: true,
                wallet: selectedWallet ?? undefined,
              });
              bridge.cancelConnect();
              return;
            }
            finish(e);
          });
      },
    });
  });
}
