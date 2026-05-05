type Listener<T> = (payload: T) => void;

/** Minimal type-safe event emitter keyed by the event map `T`. */
export class TypedEmitter<T extends Record<string, unknown>> {
  private readonly listeners = new Map<keyof T, Listener<unknown>[]>();

  on<K extends keyof T>(event: K, listener: Listener<T[K]>): void {
    const bucket = this.listeners.get(event) ?? [];
    bucket.push(listener as Listener<unknown>);
    this.listeners.set(event, bucket);
  }

  emit<K extends keyof T>(event: K, payload: T[K]): void {
    this.listeners.get(event)?.forEach((l) => l(payload));
  }
}
