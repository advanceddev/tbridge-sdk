# TBridge SDK

[![CI](https://github.com/advanceddev/tbridge-sdk/actions/workflows/ci.yml/badge.svg)](https://github.com/advanceddev/tbridge-sdk/actions/workflows/ci.yml) [![CodeQL](https://github.com/advanceddev/tbridge-sdk/actions/workflows/github-code-scanning/codeql/badge.svg)](https://github.com/advanceddev/tbridge-sdk/actions/workflows/github-code-scanning/codeql)

**A fast, enterprise-grade TON wallet connector for the browser.**

⚡ [Live demo](https://advanceddev.github.io/tbridge-demo-app/)

TBridge is a pure TypeScript SDK for discovering wallets, establishing encrypted sessions, and requesting transfers / signatures on TON. It is framework-agnostic (React, Vue, Svelte, or vanilla), ships an optional vanilla UI, and is built for production dApps and **Telegram Mini Apps**.

|              |                                                              |
| ------------ | ------------------------------------------------------------ |
| **Package**  | [`@tbridge/sdk`](https://www.npmjs.com/package/@tbridge/sdk) |
| **Runtime**  | Browser only                                                 |
| **Language** | TypeScript → ESM                                             |
| **Crypto**   | NaCl box via `tweetnacl` (overridable)                       |
| **License**  | MIT                                                          |

---

## Why TBridge

- **Protocol-complete** — injected JS bridge and remote HTTP/SSE bridge; connect, restore, disconnect, `sendTransaction`, `signData`
- **Secure by default** — safe JSON parse, HTTPS manifest policy, origin-bound sessions, rate-limited RPC, AES-GCM at-rest storage for persisted data
- **TMA-aware** — `web_app_open_link` / `web_app_open_tg_link` for real Mini Apps; safe fallbacks for Telegram in-app browser and mobile web
- **Smart open policy** — auto-open on mobile; on desktop auto-open only for Telegram Wallet inside Telegram; otherwise QR + **Open in wallet**
- **UI included** — modal, wallet grid, always-on QR, i18n (EN/RU), light/dark theme, branding, inline CSS
- **Framework-agnostic** — no React/Vue runtime dependency

---

## Install

```bash
pnpm add @tbridge/sdk
# or: npm install @tbridge/sdk
# or: yarn add @tbridge/sdk
```

Requires a modern browser with `fetch`, `EventSource`, and Web Crypto (`crypto.subtle` / `getRandomValues`).  
**Not** a Node.js runtime library.

---

## Manifest

Host a TON Connect–compatible manifest at a public **HTTPS** URL:

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
  // walletsRegistry: 'https://config.ton.org/wallets-v2.json', // optional override
  locale: 'en', // 'en' | 'ru'
  theme: 'dark', // 'dark' | 'light'
  // sessionPersistence: 'local', // default — survives Mini App / tab close
});

// Restore previous HTTP session when possible
await bridge.restoreConnection();

if (!bridge.isConnected) {
  await connectWithUi(bridge);
  // tonProofPayload is optional param
  // await connectWithUi(bridge, { tonProofPayload });
}

bridge.on('statusChange', (status) => {
  console.log(status);
});

await bridge.sendTransaction({
  validUntil: Math.floor(Date.now() / 1000) + 300,
  messages: [{ address: 'EQ...', amount: '100000000' }],
});

await bridge.disconnect();
```

### Headless connect (no modal)

```ts
const wallets = await bridge.getWallets();
const wallet = wallets.find((w) => w.app_name === 'tonkeeper');

await bridge.connect({
  appName: wallet!.app_name,
  onConnectLink: (link) => {
    // Show your own QR / open logic
    window.open(link, '_blank', 'noopener,noreferrer');
  },
});
```

### Telegram Mini App

No extra Telegram SDK is required. TBridge detects a **real** Mini App (`initData` / `tgWebApp*` params) and opens:

- `t.me` links via `web_app_open_tg_link`
- external wallet HTTPS links via `web_app_open_link` / `Telegram.WebApp.openLink`

Telegram **in-app browser** (not a Mini App) uses normal navigation helpers so the dApp page and SSE stay alive.

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

## Connect UI behavior

| Environment                                                | Auto-open wallet link                  | Waiting UI       |
| ---------------------------------------------------------- | -------------------------------------- | ---------------- |
| Mobile browser / Telegram in-app browser / mobile Mini App | Yes                                    | QR + Open + Copy |
| Desktop (browser)                                          | No (use **Open in wallet** or scan QR) | QR + Open + Copy |
| Desktop Telegram + **Telegram Wallet**                     | Yes                                    | QR + Open + Copy |

Force QR-only (never auto-open):

```ts
await connectWithUi(bridge, { preferQr: true });
```

Wallet icons are prefetched in the background after registry load (HTTP cache warm-up). Modal icons use `loading="eager"`.

---

## API overview

### `createTBridge(options)`

| Option                  | Required | Description                                                         |
| ----------------------- | -------- | ------------------------------------------------------------------- |
| `manifestUrl`           | yes      | HTTPS URL of your app manifest                                      |
| `walletsRegistry`       | no       | Custom wallets JSON URL (strict-parsed). Default: official TON list |
| `storage`               | no       | Custom `StorageAdapter` (default: encrypted `localStorage`)         |
| `crypto`                | no       | Custom `CryptoProvider` (default: `tweetnacl`)                      |
| `network`               | no       | `'mainnet'` \| `'testnet'`                                          |
| `requestTimeoutMs`      | no       | RPC timeout                                                         |
| `sessionMaxAgeMs`       | no       | Max age for restore (default 7 days)                                |
| `sessionPersistence`    | no       | `'local'` (default, durable) \| `'session'` (tab-scoped secret)     |
| `theme`                 | no       | `'light'` \| `'dark'`                                               |
| `locale`                | no       | `'en'` \| `'ru'`                                                    |
| `debug`                 | no       | Safe debug logs (never secrets)                                     |
| `allowInsecureManifest` | no       | Dev only — allow non-HTTPS manifest                                 |

### Instance methods

| Method                                                   | Description                                                        |
| -------------------------------------------------------- | ------------------------------------------------------------------ |
| `restoreConnection()`                                    | Restore HTTP session if persisted secret is available              |
| `connect({ appName, onConnectLink?, tonProofPayload? })` | Connect to a wallet                                                |
| `disconnect()`                                           | End session and clear persisted data                               |
| `destroy()`                                              | Release listeners / in-memory session (does **not** clear storage) |
| `getWallets()`                                           | Parsed registry list (triggers icon prefetch)                      |
| `detectInjected()`                                       | Injected provider, if any                                          |
| `sendTransaction(tx)`                                    | Request transfer                                                   |
| `signData(payload)`                                      | Request data signature                                             |
| `on` / `once`                                            | Events                                                             |
| `setTheme` / `setLocale`                                 | UI preferences                                                     |
| `getTheme` / `getLocale`                                 | Current UI preferences                                             |

High-level UI:

```ts
import { connectWithUi, openWalletModal } from '@tbridge/sdk';
```

### Events

```ts
bridge.on('statusChange', (status) => {
  /* disconnected | connecting | connected */
});
bridge.on('bridgeHealth', (health) => {
  /* connected | reconnecting | offline */
});
bridge.on('disconnect', ({ reason }) => {
  /* wallet | local | session_expired | user_cancel */
});
```

---

## Security notes

- **Session persistence (default `local`)** — HTTP session material is stored via the storage adapter so Mini App / tab relaunch can restore. Use `sessionPersistence: 'session'` for stricter tab-scoped secrets (worse UX on close).
- **At-rest encryption** — default `LocalStorageAdapter` stores values as AES-GCM blobs (`enc:v1:…`). Optional host secret: `globalThis.__TBRIDGE_STORAGE_SECRET__` (strong random string at bootstrap). Without it, the key is derived from the page origin — this **obfuscates** storage, it does **not** protect against same-origin XSS.
- **Threat model** — treat XSS on the dApp origin as full session compromise. Enforce a strict **CSP** on the host app.
- **Manifest URL** must be HTTPS outside localhost.
- **Wallet icons** — `https` only (http allowed on localhost).
- **RPC** is rate-limited; bridge `fetch` uses `credentials: 'omit'`.
- Call `disconnect()` on logout; `destroy()` only tears down the instance.

---

## Package

```bash
pnpm add @tbridge/sdk
```

```ts
import { createTBridge, connectWithUi } from '@tbridge/sdk';
```

Repository: [advanceddev/tbridge-sdk](https://github.com/advanceddev/tbridge-sdk)

---

## License

MIT © [Ivan Lomovtcev](https://telegram.me/frntbck)
