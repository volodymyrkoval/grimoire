/** Appends the shared `↵ cast · → options` keyboard-hint chip to `el`.
 * Emits a single `.spells-row-hint` wrapper span (the flex child of the row)
 * containing two children: a plain cast hint (`↵ cast · `) and a clickable
 * `.grimoire-options-chip`. The wrapper ensures both pieces stay on one line.
 * Single source of truth for chip vocabulary — both SpellRow and SentinelRow draw from here.
 * @param el — target container element
 * @param onOptionsClick — optional callback fired when the options chip is clicked (fires after stopPropagation)
 */
export function appendRowHint(el: HTMLElement, onOptionsClick?: () => void): void {
  // Single wrapper carries the shared spells-row-hint flex/visibility rules,
  // ensuring both children stay on one line as a unit.
  const wrapper = el.createSpan({ cls: 'spells-row-hint' });

  // Plain cast hint — not interactive
  wrapper.createSpan({ cls: 'spells-row-hint-cast', text: '↵ cast · ' });

  // Clickable options chip — no spells-row-hint class needed here; wrapper provides it
  const optionsChip = wrapper.createSpan({ cls: 'grimoire-options-chip' });
  optionsChip.setAttribute('role', 'button');
  optionsChip.setAttribute('tabindex', '-1');
  optionsChip.createSpan({ text: '→ options' });

  // Attach click handler if callback provided
  if (onOptionsClick) {
    optionsChip.addEventListener('click', (event: Event) => {
      event.stopPropagation();
      onOptionsClick();
    });
  }
}
