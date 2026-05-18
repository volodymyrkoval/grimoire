import type { PopupPhase, PopupPhaseContext } from './PopupPhase';

/**
 * Detail phase: all keyboard/navigation events are blocked; only Escape/close will trigger back.
 * Holds the active detail panel (e.g., ForgeSentinelDetail, OptionsDetail) and its destroy hook.
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

  /**
   * Tear down the currently-active detail (if any) and forget its back callback.
   * Idempotent — safe to call when there is no active detail. Used to ensure
   * every detail-to-detail and detail-to-search handoff goes through a single
   * symmetric teardown path, so component-owned keyboard bindings cannot leak
   * past their owner's lifetime.
   */
  clearActive(): void {
    this.#activeDetail?.destroy?.();
    this.#activeDetail = null;
    this.#onDetailBack = null;
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
      this.clearActive();
      back();
      return true;
    }
    this.#ctx.exitDetail();
    return true;
  }

  disablesTabBar(): boolean {
    return true;
  }
}
