import type { Extension } from '@codemirror/state';
import { castMarkerViewPlugin } from './castMarkerViewPlugin';

/** Returns the CM6 Extension array for refine-marker styling. Entry point for `registerEditorExtension`; add future co-installed extensions here. */
export function refineMarkerExtension(): Extension {
	return [castMarkerViewPlugin];
}
