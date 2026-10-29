# TBridge

**Enterprise-grade TON wallet connector for the browser.**

TBridge is a pure TypeScript SDK for discovering wallets, establishing encrypted sessions, and requesting signatures / transfers on TON. It is framework-agnostic (React, Vue, Svelte, or vanilla), ships an optional vanilla UI, and is designed for production dApps and Telegram Mini Apps.

|              |                                        |
| ------------ | -------------------------------------- |
| **Package**  | `@tbridge/sdk`                         |
| **Runtime**  | Browser only                           |
| **Language** | TypeScript → ESM + CJS                 |
| **Crypto**   | NaCl box via `tweetnacl` (overridable) |
| **License**  | MIT                                    |

---

## Why TBridge

- **Protocol-complete** — injected JS bridge and remote HTTP/SSE bridge, connect / restore / disconnect, `sendTransaction`, `signData`
- **Secure by default** — safe JSON parse, HTTPS manifest policy, origin-bound sessions, rate-limited RPC, secret keys in `sessionStorage` (not long-lived localStorage)
- **TMA-aware** — correct open paths (`web_app_open_link` / `web_app_open_tg_link`), return strategies, mobile handoff
- **UI included** — optional modal, wallet grid, QR, i18n (EN/RU), light/dark theme, inline CSS (no CSS framework)
- **Minimal surface** — no React/Vue runtime dependency; host apps stay in control

---

## Install

```bash
pnpm add @tbridge/sdk
# or: npm install @tbridge/sdk
# or: yarn add @tbridge/sdk
```

Peer environment: modern browser with `fetch`, `EventSource`, `crypto.getRandomValues`.  
Node.js is **not** a runtime target (browser SDK only).

---

## Manifest

Host a TON Connect–compatible manifest at a public HTTPS URL:

```json
{
  "url": "https://your-app.example",
  "name": "Your App",
  "iconUrl": "https://your-app.example/icon-180.png",
  "termsOfUseUrl": "https://your-app.example/terms",
  "privacyPolicyUrl": "https://your-app.example/privacy"
}
```

Pass that URL as `manifestUrl` when creating the client.

---

## Quick start

```ts
import { createTBridge, connectWithUi } from '@tbridge/sdk';

const bridge = createTBridge({
  manifestUrl: 'https://your-app.example/tonconnect-manifest.json',
  // Optional overrides:
  // walletsRegistry: 'https://config.ton.org/wallets-v2.json',
  // theme: 'dark',
  // locale: 'en',
  // network: 'mainnet',
});

// Restore previous session (same tab — secret lives in sessionStorage)
await bridge.restoreConnection();

if (!bridge.isConnected) {
  await connectWithUi(bridge);
}

bridge.on('statusChange', (status) => {
  console.log('status', status);
});

// Send GRAM
await bridge.sendTransaction({
  validUntil: Math.floor(Date.now() / 1000) + 300,
  messages: [
    {
      address: 'EQ...',
      amount: '100000000', // nano
    },
  ],
});

await bridge.disconnect();
```

### Without UI (headless)

```ts
const wallets = await bridge.getWallets();
const wallet = wallets.find((w) => w.app_name === 'tonkeeper');

await bridge.connect({
  appName: wallet!.app_name,
  onConnectLink: (link) => {
    // Open link yourself, or show your own QR
    window.open(link, '_blank', 'noopener,noreferrer');
  },
});
```

### Telegram Mini App

No extra SDK is required. TBridge detects the Mini App environment and opens:

- `t.me` links via `web_app_open_tg_link`
- external wallet URLs (Tonkeeper, etc.) via `web_app_open_link`

```ts
await connectWithUi(bridge, {
  locale: 'ru',
  theme: 'dark',
});
```

### Theme & locale at runtime

```ts
bridge.setTheme('light');
bridge.setLocale('ru');
```

---

## API overview

### `createTBridge(options)`

| Option             | Required | Description                                                                   |
| ------------------ | -------- | ----------------------------------------------------------------------------- |
| `manifestUrl`      | yes      | HTTPS URL of your app manifest                                                |
| `walletsRegistry`  | no       | Custom wallets JSON URL (strict-parsed). Default: official TON list           |
| `storage`          | no       | Custom `StorageAdapter` (default: `localStorage` for public session metadata) |
| `crypto`           | no       | Custom `CryptoProvider` (default: `tweetnacl`)                                |
| `network`          | no       | `'mainnet'` \| `'testnet'`                                                    |
| `requestTimeoutMs` | no       | RPC timeout                                                                   |
| `sessionMaxAgeMs`  | no       | Max age for restore                                                           |
| `theme`            | no       | `'light'` \| `'dark'`                                                         |
| `locale`           | no       | `'en'` \| `'ru'`                                                              |
| `debug`            | no       | Verbose safe logs (never secrets)                                             |

### Instance methods

| Method                                                   | Description                                                        |
| -------------------------------------------------------- | ------------------------------------------------------------------ |
| `restoreConnection()`                                    | Restore HTTP session if secret is available in this tab            |
| `connect({ appName, onConnectLink?, tonProofPayload? })` | Connect to a wallet                                                |
| `connectWithUi` (import)                                 | Full modal flow                                                    |
| `disconnect()`                                           | End session and clear persisted data                               |
| `destroy()`                                              | Release listeners / in-memory session (does **not** clear storage) |
| `getWallets()`                                           | Parsed registry list                                               |
| `detectInjected()`                                       | Injected provider, if any                                          |
| `sendTransaction(tx)`                                    | Request transfer                                                   |
| `signData(payload)`                                      | Request data signature                                             |
| `on` / `off` / `once`                                    | Events: `statusChange`, `bridgeHealth`, `disconnect`, …            |
| `setTheme` / `setLocale`                                 | UI preferences                                                     |

### Events

```ts
bridge.on('statusChange', (status) => {
  /* disconnected | connecting | connected */
});
bridge.on('bridgeHealth', (health) => {
  /* connected | reconnecting | offline */
});
bridge.on('disconnect', ({ reason }) => {
  /* dapp | wallet */
});
```

---

## Security notes

- **Session secret** is stored in **`sessionStorage`** (tab-scoped). Public session metadata may live in `localStorage`. Reload in the **same tab** can restore; a new tab cannot reuse the HTTP secret.
- **Manifest URL** must be HTTPS outside localhost.
- **Wallet icons** accept `https` only (http allowed on localhost).
- **RPC** is rate-limited; bridge `fetch` uses `credentials: 'omit'`.
- Protect the host app with a strict **CSP** — XSS can still read same-origin storage.
- Do not enable `debug` in production builds if you prefer minimal console noise.

---

## License

MIT
