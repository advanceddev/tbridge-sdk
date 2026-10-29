/**
 * Abstract storage for session persistence.
 * Default implementation uses localStorage (browser-only).
 */

import { assertBrowser, TBridgeError } from './errors';

export interface StorageAdapter {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

/**
 * localStorage-backed adapter.
 * All operations are async to keep the interface uniform
 * (future IndexedDB / secure storage can implement the same contract).
 */
export class LocalStorageAdapter implements StorageAdapter {
  async getItem(key: string): Promise<string | null> {
    assertBrowser();
    try {
      return window.localStorage.getItem(key);
    } catch (e) {
      throw new TBridgeError('STORAGE_ERROR', 'Failed to read from localStorage', e);
    }
  }

  async setItem(key: string, value: string): Promise<void> {
    assertBrowser();
    try {
      window.localStorage.setItem(key, value);
    } catch (e) {
      throw new TBridgeError('STORAGE_ERROR', 'Failed to write to localStorage', e);
    }
  }

  async removeItem(key: string): Promise<void> {
    assertBrowser();
    try {
      window.localStorage.removeItem(key);
    } catch (e) {
      throw new TBridgeError('STORAGE_ERROR', 'Failed to remove from localStorage', e);
    }
  }
}

/** In-memory adapter — useful for tests and ephemeral sessions */
export class MemoryStorageAdapter implements StorageAdapter {
  private readonly map = new Map<string, string>();

  async getItem(key: string): Promise<string | null> {
    return this.map.get(key) ?? null;
  }

  async setItem(key: string, value: string): Promise<void> {
    this.map.set(key, value);
  }

  async removeItem(key: string): Promise<void> {
    this.map.delete(key);
  }
}
