type Listener<T> = (payload: T) => void;

/**
 * Minimal type-safe event emitter keyed by an event map type.
 * Keys in the map are event names; values are the payload types.
 */
export class TypedEmitter<T extends Record<string, unknown>> {
  readonly #listeners = new Map<keyof T, Listener<unknown>[]>();

  /** Registers a listener for the given event. */
  on<K extends keyof T>(event: K, listener: Listener<T[K]>): void {
    const bucket = this.#listeners.get(event) ?? [];
    bucket.push(listener);
    this.#listeners.set(event, bucket);
  }

  /** Emits an event, invoking all registered listeners with the given payload. */
  emit<K extends keyof T>(event: K, payload: T[K]): void {
    this.#listeners.get(event)?.forEach((l) => l(payload));
  }
}
