import { Effort } from "../../domain/settings/Settings";
import { OptionsFormSnapshot } from "./OptionsFormState";
import type { ModelId } from "../../domain/settings/ModelId";

export interface OptionsSnapshot {
  model: ModelId;
  effort: Effort | null;
}

/**
 * Compares a baseline snapshot (from spell defaults or overrides) against the current form state.
 * Returns true if model and effort match (ignoring contextNotePaths, followUp, executeOnNote).
 * Used to determine whether to show the "Set as default" checkbox.
 */
export function snapshotEqualsCurrent(snap: OptionsSnapshot, current: OptionsFormSnapshot): boolean {
  return snap.model === current.model && snap.effort === current.effort;
}
