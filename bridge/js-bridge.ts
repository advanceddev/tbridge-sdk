/**
 * JS Bridge transport — injected wallet binding (window[key][INJECTED_BRIDGE_PROP])
 * No encryption (same device). Spec: bridge.md § JS bridge
 */

import { PROTOCOL_VERSION } from '../core/constants';
import { TBridgeError } from '../core/errors';
import type {
  AppRequest,
  ConnectEvent,
  ConnectRequest,
  WalletEvent,
  WalletResponse,
} from '../core/types';
import { getInjectedBridge } from '../utils/browser';
import { isConnectEvent, isWalletResponse, mapWalletError } from '../utils/validation';

export interface JsBridgeSession {
  readonly kind: 'js';
  readonly bridgeKey: string;
  readonly appName: string;
  send(request: AppRequest): Promise<WalletResponse>;
  disconnect(): Promise<void>;
  destroy(): void;
}

/**
 * Open a session against an injected JS bridge.
 * Caller must pass a known bridge key from wallets list.
 */
export async function connectJsBridge(params: {
  bridgeKey: string;
  appName: string;
  connectRequest: ConnectRequest;
  timeoutMs: number;
}): Promise<{ event: ConnectEvent; session: JsBridgeSession }> {
  const bridge = getInjectedBridge(params.bridgeKey);
  if (!bridge) {
    throw new TBridgeError(
      'JS_BRIDGE_MISSING',
      `Injected bridge "${params.bridgeKey}" not found on window`,
    );
  }

  const protocolVersion = Math.min(bridge.protocolVersion ?? PROTOCOL_VERSION, PROTOCOL_VERSION);

  const event = await withTimeout(
    bridge.connect(protocolVersion, params.connectRequest),
    params.timeoutMs,
    'JS bridge connect timed out',
  );

  if (!isConnectEvent(event)) {
    throw new TBridgeError('INVALID_PAYLOAD', 'JS bridge returned invalid ConnectEvent');
  }

  if (event.event === 'connect_error') {
    throw mapWalletError(event.payload.code, event.payload.message ?? 'Connect error');
  }

  const unsubscribers: Array<() => void> = [];
  let destroyed = false;

  if (typeof bridge.listen === 'function') {
    const off = bridge.listen((ev: WalletEvent) => {
      if (ev.event === 'disconnect') {
        // Consumer should react via connector status
      }
    });
    unsubscribers.push(off);
  }

  const session: JsBridgeSession = {
    kind: 'js',
    bridgeKey: params.bridgeKey,
    appName: params.appName,
    async send(request: AppRequest): Promise<WalletResponse> {
      if (destroyed) {
        throw new TBridgeError('NOT_CONNECTED', 'JS bridge session destroyed');
      }
      const response = await withTimeout(
        bridge.send(request),
        params.timeoutMs,
        'JS bridge send timed out',
      );
      if (!isWalletResponse(response)) {
        throw new TBridgeError('INVALID_PAYLOAD', 'Invalid WalletResponse from JS bridge');
      }
      return response;
    },
    async disconnect(): Promise<void> {
      if (destroyed) return;
      try {
        await bridge.send({
          method: 'disconnect',
          params: [],
          id: String(Date.now()),
        });
      } catch {}
      session.destroy();
    },
    destroy(): void {
      if (destroyed) return;
      destroyed = true;
      for (const off of unsubscribers) {
        try {
          off();
        } catch {}
      }
      unsubscribers.length = 0;
    },
  };

  return { event, session };
}

export async function restoreJsBridge(params: {
  bridgeKey: string;
  appName: string;
  timeoutMs: number;
}): Promise<{ event: ConnectEvent; session: JsBridgeSession } | null> {
  const bridge = getInjectedBridge(params.bridgeKey);
  if (!bridge || typeof bridge.restoreConnection !== 'function') {
    return null;
  }

  try {
    const event = await withTimeout(
      bridge.restoreConnection(),
      params.timeoutMs,
      'JS bridge restore timed out',
    );
    if (!isConnectEvent(event) || event.event !== 'connect') {
      return null;
    }

    let destroyed = false;
    const session: JsBridgeSession = {
      kind: 'js',
      bridgeKey: params.bridgeKey,
      appName: params.appName,
      async send(request) {
        if (destroyed) {
          throw new TBridgeError('NOT_CONNECTED', 'JS bridge session destroyed');
        }
        const response = await withTimeout(
          bridge.send(request),
          params.timeoutMs,
          'JS bridge send timed out',
        );
        if (!isWalletResponse(response)) {
          throw new TBridgeError('INVALID_PAYLOAD', 'Invalid WalletResponse');
        }
        return response;
      },
      async disconnect() {
        if (destroyed) return;
        try {
          await bridge.send({
            method: 'disconnect',
            params: [],
            id: String(Date.now()),
          });
        } catch {}
        session.destroy();
      },
      destroy() {
        destroyed = true;
      },
    };
    return { event, session };
  } catch {
    return null;
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new TBridgeError('TIMEOUT', message));
    }, ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

/** Type guard helper for consumers */
export function isJsBridgeAvailable(key: string): boolean {
  return getInjectedBridge(key) !== null;
}
