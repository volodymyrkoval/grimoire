import { Effort } from "../../domain/settings/Settings";
import { OptionsFormSnapshot } from "./OptionsFormState";

export interface OptionsSnapshot {
  model: string;
  effort: Effort | null;
}

export function snapshotEqualsCurrent(snap: OptionsSnapshot, current: OptionsFormSnapshot): boolean {
  return snap.model === current.model && snap.effort === current.effort;
}
