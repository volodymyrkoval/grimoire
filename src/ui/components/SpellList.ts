import type { Spell, Sentinel } from "../../domain/spells/Spell";
import type { SpellPath } from "../../domain/spells/SpellPath";
import type { TypedEmitter } from "../TypedEmitter";
import type { SpellEvents } from "../SpellEvents";
import { SpellRow } from "./SpellRow";
import { SentinelRow } from "./SentinelRow";

export class SpellList {
  readonly el: HTMLElement;
  private rows: (SpellRow | SentinelRow)[] = [];

  constructor(
    container: HTMLElement,
    private readonly emitter: TypedEmitter<SpellEvents>,
    private readonly sentinels: Sentinel[] = []
  ) {
    this.el = container.createDiv({ cls: "spells-list" });
  }

  render(spells: Spell[], selectedIndex: number, hasOverride: (path: SpellPath) => boolean = () => false): void {
    this.el.empty();
    const spellRows = spells.map((spell, i) => {
      const row = new SpellRow(this.el, spell, i === selectedIndex, hasOverride(spell.path));
      row.el.onClickEvent(() => this.emitter.emit("cast", spell));
      return row;
    });
    const sentinelContainer = this.sentinels.length > 0
      ? this.el.createDiv({ cls: "sentinels-section" })
      : this.el;
    const sentinelRows = this.sentinels.map((sentinel, i) => {
      const row = new SentinelRow(sentinelContainer, sentinel, spells.length + i === selectedIndex);
      row.el.onClickEvent(() => this.emitter.emit("sentinel", sentinel));
      return row;
    });
    this.rows = [...spellRows, ...sentinelRows];
    // Chromium doesn't recalculate :hover after DOM mutation without a mouse-move;
    // toggling pointer-events + forcing a reflow resets stale hover states immediately.
    if (this.el.style) {
      // eslint-disable-next-line obsidianmd/no-static-styles-assignment -- intentional Chromium hover-reset hack; not a theming concern
      this.el.style.pointerEvents = "none";
      void this.el.offsetHeight;
      // eslint-disable-next-line obsidianmd/no-static-styles-assignment -- restore after reflow
      this.el.style.pointerEvents = "";
    }
  }

  updateSelection(prev: number, next: number): void {
    this.rows[prev]?.el.removeClass("is-selected");
    this.rows[next]?.el.addClass("is-selected");
    this.rows[next]?.el.scrollIntoView({ block: "nearest" });
  }

  get length(): number {
    return this.rows.length;
  }
}
