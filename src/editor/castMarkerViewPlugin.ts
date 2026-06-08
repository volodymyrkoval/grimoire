import { ViewPlugin, Decoration, type EditorView, type Extension } from '@codemirror/view';
import type { DecorationSet, ViewUpdate } from '@codemirror/view';
import { buildCastDecorations } from './buildCastDecorations';
import type { Logger } from '../infra/Logger';

/**
 * CodeMirror 6 ViewPlugin that decorates `@cast` lines in the editor viewport.
 *
 * Builds a `DecorationSet` on initialization and rebuilds it whenever the
 * document changes or the visible viewport shifts. Errors during decoration
 * building are caught and logged; the plugin remains functional by falling
 * back to `Decoration.none`.
 *
 * @param logger optional Logger for diagnostic output
 * @returns the ViewPlugin instance
 */
export function createCastMarkerViewPlugin(logger?: Logger): Extension {
	return ViewPlugin.fromClass(
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
						logger?.error('refine-marker-styling: decoration build failed', err);
						this.decorations = Decoration.none;
					}
				}
			}
		},
		{ decorations: (v) => v.decorations }
	);
}

/**
 * Default export for backward compatibility and for the refineMarkerExtension.
 */
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
export const castMarkerViewPlugin: Extension = createCastMarkerViewPlugin();
