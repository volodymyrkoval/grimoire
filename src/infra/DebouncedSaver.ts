/**
 * Defers save operations by a fixed delay, cancelling earlier pending saves if a new one is scheduled.
 * Supports immediate flush on demand (e.g., at plugin unload).
 */
export class DebouncedSaver {
  #save: () => void | Promise<void>;
  #delayMs: number;
  #timer: ReturnType<typeof activeWindow.setTimeout> | null = null;

  constructor(save: () => void | Promise<void>, delayMs: number) {
    this.#save = save;
    this.#delayMs = delayMs;
  }

  /** Schedules a save, cancelling any pending save from an earlier call. */
  schedule(): void {
    if (this.#timer !== null) activeWindow.clearTimeout(this.#timer);
    this.#timer = activeWindow.setTimeout(() => {
      this.#timer = null;
      void this.#runSave();
    }, this.#delayMs);
  }

  /** Immediately executes any pending save without waiting for the delay. */
  flush(): void {
    if (this.#timer === null) return;
    activeWindow.clearTimeout(this.#timer);
    this.#timer = null;
    void this.#runSave();
  }

  async #runSave(): Promise<void> {
    try {
      await this.#save();
    } catch (e) {
      console.error(e);
    }
  }
}
