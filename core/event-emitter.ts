/**
 * Minimal typed event emitter.
 * No external deps. Safe for browser.
 */

type Handler<T> = (payload: T) => void;

export class TypedEventEmitter<EventMap extends Record<string, unknown>> {
  private readonly listeners = new Map<keyof EventMap, Set<Handler<EventMap[keyof EventMap]>>>();

  on<K extends keyof EventMap>(event: K, handler: Handler<EventMap[K]>): () => void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(handler as Handler<EventMap[keyof EventMap]>);

    return () => {
      set!.delete(handler as Handler<EventMap[keyof EventMap]>);
      if (set!.size === 0) {
        this.listeners.delete(event);
      }
    };
  }

  once<K extends keyof EventMap>(event: K, handler: Handler<EventMap[K]>): () => void {
    const off = this.on(event, (payload) => {
      off();
      handler(payload);
    });
    return off;
  }

  off<K extends keyof EventMap>(event: K, handler: Handler<EventMap[K]>): void {
    const set = this.listeners.get(event);
    if (set) {
      set.delete(handler as Handler<EventMap[keyof EventMap]>);
      if (set.size === 0) {
        this.listeners.delete(event);
      }
    }
  }

  emit<K extends keyof EventMap>(event: K, payload: EventMap[K]): void {
    const set = this.listeners.get(event);
    if (!set) return;

    const snapshot = Array.from(set);
    for (const handler of snapshot) {
      try {
        (handler as Handler<EventMap[K]>)(payload);
      } catch {}
    }
  }

  removeAllListeners(event?: keyof EventMap): void {
    if (event !== undefined) {
      this.listeners.delete(event);
    } else {
      this.listeners.clear();
    }
  }

  listenerCount(event: keyof EventMap): number {
    return this.listeners.get(event)?.size ?? 0;
  }
}
