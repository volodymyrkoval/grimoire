import { ViewPlugin, Decoration, type EditorView } from '@codemirror/view';
import type { DecorationSet, ViewUpdate } from '@codemirror/view';
import { buildCastDecorations } from './buildCastDecorations';

/**
 * CodeMirror 6 ViewPlugin that decorates `@cast` lines in the editor viewport.
 *
 * Builds a `DecorationSet` on initialization and rebuilds it whenever the
 * document changes or the visible viewport shifts. Errors during decoration
 * building are caught and logged; the plugin remains functional by falling
 * back to `Decoration.none`.
 */
export const castMarkerViewPlugin = ViewPlugin.fromClass(
	class {
		decorations: DecorationSet;

		constructor(view: EditorView) {
			this.decorations = buildCastDecorations(view);
		}

		update(u: ViewUpdate) {
			if (u.docChanged || u.viewportChanged) {
				try {
					this.decorations = buildCastDecorations(u.view);
				} catch (err) {
					console.error('refine-marker-styling: decoration build failed', err);
					this.decorations = Decoration.none;
				}
			}
		}
	},
	{ decorations: (v) => v.decorations }
);
