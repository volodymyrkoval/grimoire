import type { PopupPhase, PopupPhaseContext } from './PopupPhase';

/**
 * Detail phase: all keyboard/navigation events are blocked; only Escape/close will trigger back.
 * Holds the active detail panel (e.g., ForgeSentinelDetail, SpellOptionsDetail) and its destroy hook.
 */
export class DetailPhase implements PopupPhase {
  readonly kind = 'detail' as const;
  #ctx: PopupPhaseContext;
  #onDetailBack: (() => void) | null = null;
  #activeDetail: { destroy(): void } | null = null;

  constructor(ctx: PopupPhaseContext) {
    this.#ctx = ctx;
  }

  setActive(detail: { destroy(): void }, onBack: () => void): void {
    this.#onDetailBack = onBack;
    this.#activeDetail = detail;
  }

  handleArrow(_delta: -1 | 1): boolean {
    return false;
  }

  handleEnter(): boolean {
    return false;
  }

  handleTab(): boolean {
    return false;
  }

  handleArrowRight(): boolean {
    return false;
  }

  interceptClose(): boolean {
    if (this.#onDetailBack) {
      const back = this.#onDetailBack;
      this.#onDetailBack = null;
      this.#activeDetail?.destroy?.();
      this.#activeDetail = null;
      back();
      return true;
    }
    this.#ctx.exitDetail();
    return true;
  }
}
