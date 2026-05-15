import type { Effort } from "./Settings";

/** Default values to populate a spell form when creating or resetting options. */
export interface FormDefaults {
  defaultModel: string;
  defaultEffort: Effort | null;
}
