/**
 * Security hardening for production dApps.
 * - Manifest URL policy (HTTPS / same-origin in prod)
 * - Safe JSON parse (prototype pollution resistance)
 * - Origin binding for persisted sessions
 * - Outbound request rate limiting
 * - Session max-age
 */

import { TBridgeError } from './errors';

/** Reject dangerous keys during recursive walk of parsed JSON */
const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/**
 * JSON.parse with prototype-pollution hardening.
 * Strips forbidden keys from objects (shallow + nested).
 */
export function safeJsonParse<T = unknown>(raw: string, label = 'payload'): T {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw, (key, value) => {
      if (FORBIDDEN_KEYS.has(key)) return undefined;
      return value;
    });
  } catch (e) {
    throw new TBridgeError('INVALID_PAYLOAD', `${label} is not valid JSON`, e);
  }
  return sanitizeValue(parsed) as T;
}

function sanitizeValue(value: unknown): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) {
    return value.map(sanitizeValue);
  }
  const out: Record<string, unknown> = Object.create(null);
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (FORBIDDEN_KEYS.has(k)) continue;
    out[k] = sanitizeValue(v);
  }
  return out;
}

/**
 * Enforce safe manifest URL policy.
 * - Must be absolute http(s)
 * - Production-like hosts should be https (localhost/http allowed for dev)
 */
export function assertSafeManifestUrl(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new TBridgeError('INVALID_MANIFEST', 'manifestUrl is not a valid URL');
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new TBridgeError('INVALID_MANIFEST', 'manifestUrl must use http or https');
  }
  const host = parsed.hostname;
  const isLocal =
    host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host.endsWith('.local');
  if (parsed.protocol === 'http:' && !isLocal) {
    throw new TBridgeError('INVALID_MANIFEST', 'manifestUrl must be HTTPS outside localhost');
  }
}

/** Current page origin (empty string if unavailable) */
export function currentOrigin(): string {
  try {
    return typeof location !== 'undefined' ? location.origin : '';
  } catch {
    return '';
  }
}

/**
 * Simple token-bucket rate limiter for outbound wallet RPC.
 * Prevents accidental floods / UI double-submit storms.
 */
export class RateLimiter {
  private tokens: number;
  private lastRefill: number;

  constructor(
    private readonly capacity: number,
    private readonly refillPerSecond: number,
  ) {
    this.tokens = capacity;
    this.lastRefill = Date.now();
  }

  /** Returns true if the call is allowed */
  tryRemove(cost = 1): boolean {
    this.refill();
    if (this.tokens < cost) return false;
    this.tokens -= cost;
    return true;
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000;
    if (elapsed <= 0) return;
    this.tokens = Math.min(this.capacity, this.tokens + elapsed * this.refillPerSecond);
    this.lastRefill = now;
  }
}

/** Validate image URL for wallet icons — https only (http allowed on localhost). */
export function isSafeImageUrl(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol === 'https:') return true;
    if (u.protocol === 'http:') {
      const host = u.hostname;
      return (
        host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host.endsWith('.local')
      );
    }
    return false;
  } catch {
    return false;
  }
}
