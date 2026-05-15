/** Appends the shared `↵ cast · → options` keyboard-hint chip to `el`.
 * Single source of truth for chip vocabulary — both SpellRow and SentinelRow draw from here. */
export function appendRowHint(el: HTMLElement): void {
  el.createSpan({ cls: 'spells-row-hint', text: '↵ cast · → options' });
}
