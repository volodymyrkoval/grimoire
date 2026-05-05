export class DebouncedSaver {
  #save: () => void | Promise<void>;
  #delayMs: number;
  #timer: ReturnType<typeof setTimeout> | null = null;

  constructor(save: () => void | Promise<void>, delayMs: number) {
    this.#save = save;
    this.#delayMs = delayMs;
  }

  schedule(): void {
    if (this.#timer !== null) clearTimeout(this.#timer);
    this.#timer = setTimeout(() => {
      this.#timer = null;
      void this.#runSave();
    }, this.#delayMs);
  }

  flush(): void {
    if (this.#timer === null) return;
    clearTimeout(this.#timer);
    this.#timer = null;
    this.#runSave();
  }

  async #runSave(): Promise<void> {
    try {
      await this.#save();
    } catch (e) {
      console.error(e);
    }
  }
}
