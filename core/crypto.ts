/**
 * Session cryptography for HTTP bridge (X25519 + crypto_box).
 *
 * Algorithm: NaCl crypto_box (X25519 + XSalsa20-Poly1305)
 * Wire layout: M = nonce(24) || ciphertext  → base64 for POST body
 *
 * Dependency policy:
 * - CryptoProvider is injectable via TBridgeOptions.crypto (tests / custom backends)
 * - Default NaclCryptoProvider resolves nacl from:
 *   1) globalThis.nacl (optional override)
 *   2) import('tweetnacl') — shipped as a package dependency
 * - JS bridge path never touches this module
 *
 * Secret material is zeroed on dispose(). Never log keys.
 */

import { TBridgeError } from './errors';
import {
  bytesToHex,
  hexToBytes,
  isHex64,
  bytesToBase64,
  base64ToBytes,
  normalizeKeyHex,
} from './encoding';

export interface KeyPair {
  /** 32-byte X25519 public key */
  publicKey: Uint8Array;
  /**
   * Secret key as used by the provider.
   * For tweetnacl this is the 64-byte sk||pk form after keyPair().
   */
  secretKey: Uint8Array;
}

export interface CryptoProvider {
  /** Async key generation (allows dynamic nacl load) */
  generateKeyPair(): Promise<KeyPair>;
  /** Encrypt → raw bytes = nonce(24) || ciphertext */
  seal(message: Uint8Array, theirPublicKey: Uint8Array, mySecretKey: Uint8Array): Uint8Array;
  /** Decrypt raw nonce||ciphertext → plaintext or null on auth failure */
  open(sealed: Uint8Array, theirPublicKey: Uint8Array, mySecretKey: Uint8Array): Uint8Array | null;
}

const NONCE_LEN = 24;
const PK_LEN = 32;

function zero(buf: Uint8Array): void {
  buf.fill(0);
}

function randomBytes(n: number): Uint8Array {
  const out = new Uint8Array(n);
  if (typeof globalThis.crypto?.getRandomValues === 'function') {
    globalThis.crypto.getRandomValues(out);
    return out;
  }
  throw new TBridgeError('CRYPTO_ERROR', 'Secure RNG unavailable');
}

/** Minimal nacl surface we need */
interface NaclBox {
  keyPair: {
    (): { publicKey: Uint8Array; secretKey: Uint8Array };
    fromSecretKey: (sk: Uint8Array) => {
      publicKey: Uint8Array;
      secretKey: Uint8Array;
    };
  };
  (msg: Uint8Array, nonce: Uint8Array, pk: Uint8Array, sk: Uint8Array): Uint8Array;
  open: (ct: Uint8Array, nonce: Uint8Array, pk: Uint8Array, sk: Uint8Array) => Uint8Array | null;
  randomBytes?: (n: number) => Uint8Array;
}

interface NaclModule {
  box: NaclBox;
  randomBytes: (n: number) => Uint8Array;
}

let cachedNacl: NaclModule | null = null;
let naclPromise: Promise<NaclModule> | null = null;

async function loadNacl(): Promise<NaclModule> {
  if (cachedNacl) return cachedNacl;
  if (naclPromise) return naclPromise;

  naclPromise = (async () => {
    const g = globalThis as unknown as { nacl?: NaclModule };
    if (g.nacl?.box) {
      cachedNacl = g.nacl;
      return g.nacl;
    }
    try {
      const mod = await import('tweetnacl');
      const nacl = ((mod as { default?: NaclModule }).default ?? mod) as NaclModule;
      if (!nacl?.box) {
        throw new Error('tweetnacl.box missing');
      }
      cachedNacl = nacl;
      return nacl;
    } catch (e) {
      throw new TBridgeError(
        'CRYPTO_ERROR',
        'NaCl not available. Inject options.crypto, set globalThis.nacl, or ensure dependency "tweetnacl" is installed.',
        e,
      );
    }
  })();

  return naclPromise;
}

/**
 * Default provider backed by tweetnacl (package dependency / global override).
 */
export class NaclCryptoProvider implements CryptoProvider {
  async generateKeyPair(): Promise<KeyPair> {
    const nacl = await loadNacl();
    const kp = nacl.box.keyPair();
    return {
      publicKey: new Uint8Array(kp.publicKey),
      secretKey: new Uint8Array(kp.secretKey),
    };
  }

  seal(message: Uint8Array, theirPublicKey: Uint8Array, mySecretKey: Uint8Array): Uint8Array {
    if (!cachedNacl) {
      throw new TBridgeError('CRYPTO_ERROR', 'Crypto provider not initialized');
    }
    const nonce = cachedNacl.randomBytes
      ? cachedNacl.randomBytes(NONCE_LEN)
      : randomBytes(NONCE_LEN);
    const ct = cachedNacl.box(message, nonce, theirPublicKey, mySecretKey);
    const out = new Uint8Array(NONCE_LEN + ct.length);
    out.set(nonce, 0);
    out.set(ct, NONCE_LEN);
    return out;
  }

  open(sealed: Uint8Array, theirPublicKey: Uint8Array, mySecretKey: Uint8Array): Uint8Array | null {
    if (!cachedNacl) {
      throw new TBridgeError('CRYPTO_ERROR', 'Crypto provider not initialized');
    }
    if (sealed.length <= NONCE_LEN) return null;
    const nonce = sealed.subarray(0, NONCE_LEN);
    const ct = sealed.subarray(NONCE_LEN);
    return cachedNacl.box.open(ct, nonce, theirPublicKey, mySecretKey);
  }
}

/**
 * Session-scoped crypto. One instance per connection.
 * Call dispose() on disconnect — zeros secret key in memory.
 */
export class SessionCrypto {
  readonly publicKey: Uint8Array;
  readonly publicKeyHex: string;
  private secretKey: Uint8Array;
  private readonly provider: CryptoProvider;
  private disposed = false;

  private constructor(kp: KeyPair, provider: CryptoProvider) {
    if (kp.publicKey.length !== PK_LEN) {
      throw new TBridgeError('CRYPTO_ERROR', 'publicKey must be 32 bytes');
    }
    this.publicKey = new Uint8Array(kp.publicKey);
    this.publicKeyHex = bytesToHex(this.publicKey);
    this.secretKey = new Uint8Array(kp.secretKey);
    this.provider = provider;
  }

  /** Bridge client_id */
  get clientId(): string {
    return this.publicKeyHex;
  }

  static async create(
    provider?: CryptoProvider,
    existing?: { publicKeyHex: string; secretKeyHex: string },
  ): Promise<SessionCrypto> {
    const p = provider ?? new NaclCryptoProvider();

    if (existing) {
      if (!isHex64(existing.publicKeyHex)) {
        throw new TBridgeError('CRYPTO_ERROR', 'Invalid publicKeyHex');
      }
      // secret may be 32 or 64 bytes (64 or 128 hex chars)
      if (
        typeof existing.secretKeyHex !== 'string' ||
        !/^[0-9a-fA-F]+$/.test(existing.secretKeyHex) ||
        existing.secretKeyHex.length % 2 !== 0
      ) {
        throw new TBridgeError('CRYPTO_ERROR', 'Invalid secretKeyHex');
      }
      const sk = hexToBytes(existing.secretKeyHex);
      if (sk.length !== 32 && sk.length !== 64) {
        throw new TBridgeError('CRYPTO_ERROR', 'Invalid secretKeyHex length');
      }
      // Warm up nacl so seal/open work
      if (p instanceof NaclCryptoProvider) {
        await loadNacl();
      }
      return new SessionCrypto({ publicKey: hexToBytes(existing.publicKeyHex), secretKey: sk }, p);
    }

    const kp = await p.generateKeyPair();
    return new SessionCrypto(kp, p);
  }

  /** Encrypt UTF-8 string → base64(nonce||ct) for bridge POST body */
  encrypt(plaintext: string, receiverPublicKeyHex: string): string {
    this.assertAlive();
    const receiver = normalizeKeyHex(receiverPublicKeyHex);
    if (!isHex64(receiver)) {
      throw new TBridgeError('CRYPTO_ERROR', 'Invalid receiver public key');
    }
    const msg = new TextEncoder().encode(plaintext);
    const sealed = this.provider.seal(msg, hexToBytes(receiver), this.secretKey);
    if (!sealed || sealed.length <= 24) {
      throw new TBridgeError('CRYPTO_ERROR', 'Encryption produced empty ciphertext');
    }
    return bytesToBase64(sealed);
  }

  /** Decrypt base64(nonce||ct) → UTF-8 string; throws on auth failure */
  decrypt(encryptedBase64: string, senderPublicKeyHex: string): string {
    this.assertAlive();
    const sender = normalizeKeyHex(senderPublicKeyHex);
    if (!isHex64(sender)) {
      throw new TBridgeError('CRYPTO_ERROR', 'Invalid sender public key');
    }
    let sealed: Uint8Array;
    try {
      sealed = base64ToBytes(encryptedBase64);
    } catch (e) {
      throw new TBridgeError('CRYPTO_ERROR', 'Invalid base64 ciphertext', e);
    }
    const opened = this.provider.open(sealed, hexToBytes(sender), this.secretKey);
    if (!opened) {
      throw new TBridgeError('CRYPTO_ERROR', 'Decryption failed — message discarded');
    }
    return new TextDecoder().decode(opened);
  }

  exportKeys(): { publicKeyHex: string; secretKeyHex: string } {
    this.assertAlive();
    return {
      publicKeyHex: this.publicKeyHex,
      secretKeyHex: bytesToHex(this.secretKey),
    };
  }

  dispose(): void {
    if (this.disposed) return;
    zero(this.secretKey);
    zero(this.publicKey);
    this.disposed = true;
  }

  private assertAlive(): void {
    if (this.disposed) {
      throw new TBridgeError('CRYPTO_ERROR', 'SessionCrypto disposed');
    }
  }
}
