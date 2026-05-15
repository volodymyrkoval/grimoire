import type { Spell, Sentinel } from "../../domain/spells/Spell";
import type { SpellPath } from "../../domain/spells/SpellPath";
import type { TypedEmitter } from "../../infra/TypedEmitter";
import type { SpellEvents } from "../../domain/spells/SpellEvents";
import { SpellRow } from "./SpellRow";
import { SentinelRow } from "./SentinelRow";

export class SpellList {
  readonly el: HTMLElement;
  #rows: (SpellRow | SentinelRow)[] = [];
  readonly #emitter: TypedEmitter<SpellEvents>;
  readonly #sentinels: Sentinel[];

  constructor(
    container: HTMLElement,
    emitter: TypedEmitter<SpellEvents>,
    sentinels: Sentinel[] = []
  ) {
    this.#emitter = emitter;
    this.#sentinels = sentinels;
    this.el = container.createDiv({ cls: "spells-list" });
  }

  render(spells: Spell[], selectedIndex: number, hasOverride: (path: SpellPath) => boolean = () => false): void {
    this.el.empty();
    const spellRows = this.#buildSpellRows(spells, selectedIndex, hasOverride);
    const sentinelContainer = this.#buildSentinelContainer();
    const sentinelRows = this.#buildSentinelRows(sentinelContainer, spells.length, selectedIndex);
    this.#rows = [...spellRows, ...sentinelRows];
    this.#resetHoverState();
  }

  #buildSpellRows(spells: Spell[], selectedIndex: number, hasOverride: (path: SpellPath) => boolean): SpellRow[] {
    return spells.map((spell, i) => {
      const row = new SpellRow();
      row.render(this.el, spell, i === selectedIndex, hasOverride(spell.path));
      row.el.onClickEvent(() => this.#emitter.emit("cast", spell));
      return row;
    });
  }

  #buildSentinelContainer(): HTMLElement {
    return this.#sentinels.length > 0
      ? this.el.createDiv({ cls: "sentinels-section" })
      : this.el;
  }

  #buildSentinelRows(container: HTMLElement, offset: number, selectedIndex: number): SentinelRow[] {
    return this.#sentinels.map((sentinel, i) => {
      const row = new SentinelRow();
      row.render(container, sentinel, offset + i === selectedIndex);
      row.el.onClickEvent(() => this.#emitter.emit("sentinel", sentinel));
      return row;
    });
  }

  // Chromium doesn't recalculate :hover after DOM mutation without a mouse-move;
  // toggling pointer-events + forcing a reflow resets stale hover states immediately.
  #resetHoverState(): void {
    this.el.addClass("spells-list--hover-reset");
    void this.el.offsetHeight;
    this.el.removeClass("spells-list--hover-reset");
  }

  updateSelection(prev: number, next: number): void {
    this.#rows[prev]?.el.removeClass("is-selected");
    this.#rows[next]?.el.addClass("is-selected");
    this.#rows[next]?.el.scrollIntoView({ block: "nearest" });
  }

  get length(): number {
    return this.#rows.length;
  }
}
