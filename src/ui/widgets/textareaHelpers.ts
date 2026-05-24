/** Auto-expands the textarea height as the user types. */
export function attachAutogrow(ta: HTMLTextAreaElement, signal: AbortSignal): void {
  ta.addEventListener('input', () => {
    // eslint-disable-next-line obsidianmd/no-static-styles-assignment
    ta.style.height = 'auto';
    ta.style.height = ta.scrollHeight + 'px';
  }, { signal });
}

/** Continues a Markdown list item when the user presses Enter inside one. */
export function attachListContinuation(ta: HTMLTextAreaElement, signal: AbortSignal): void {
  ta.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || e.shiftKey) return;
    const { value, selectionStart } = ta;
    const lineStart = value.lastIndexOf('\n', selectionStart - 1) + 1;
    const line = value.slice(lineStart, selectionStart);
    const m = line.match(/^(\s*)(?:([-*+])|(\d+)\.)\s+/);
    if (!m) return;
    e.preventDefault();
    const [full, indent, bullet, num] = m;
    if (line.length === full.length) {
      const before = value.slice(0, lineStart);
      const after = value.slice(selectionStart);
      ta.value = before + after;
      ta.setSelectionRange(lineStart, lineStart);
      ta.dispatchEvent(new Event('input'));
      return;
    }
    const insert = '\n' + (bullet ? `${indent}${bullet} ` : `${indent}${+num + 1}. `);
    const before = value.slice(0, selectionStart);
    const after = value.slice(ta.selectionEnd);
    ta.value = before + insert + after;
    ta.setSelectionRange(selectionStart + insert.length, selectionStart + insert.length);
    ta.dispatchEvent(new Event('input'));
  }, { signal });
}
