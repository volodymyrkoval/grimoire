import { Decoration, type DecorationSet, type EditorView } from '@codemirror/view';
import { RangeSetBuilder } from '@codemirror/state';
import { CAST_LINE_REGEX } from './castLineRegex';
import { isInsideFencedCodeBlock } from './isInsideFencedCodeBlock';

/**
 * Builds the set of CodeMirror decorations for all `@cast` lines visible in
 * the current viewport.
 *
 * For each visible `@cast` line that is not inside a fenced or inline code
 * block, two decorations are emitted:
 *  1. A **line decoration** (`grimoire-cast-line`) that marks the whole line.
 *  2. A **mark decoration** (`grimoire-cast-marker`) covering the 5-character
 *     `@cast` token at the start of the line.
 *
 * The line decoration is always added before the mark at the same `from`
 * position to satisfy `RangeSetBuilder`'s non-decreasing ordering requirement
 * (line decorations have `startSide = -Infinity`).
 */
export function buildCastDecorations(view: EditorView): DecorationSet {
	const builder = new RangeSetBuilder<Decoration>();
	const { state } = view;
	for (const { from, to } of view.visibleRanges) {
		let pos = from;
		while (pos <= to) {
			const line = state.doc.lineAt(pos);
			const match = CAST_LINE_REGEX.exec(line.text);
			if (match && !isInsideFencedCodeBlock(state, line.from)) {
				// Line decoration must come before mark decoration at equal from.
				builder.add(line.from, line.from, Decoration.line({ class: 'grimoire-cast-line' }));
				builder.add(line.from, line.from + 5, Decoration.mark({ class: 'grimoire-cast-marker' }));
			}
			pos = line.to + 1;
		}
	}
	return builder.finish();
}
