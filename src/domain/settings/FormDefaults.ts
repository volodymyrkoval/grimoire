import type { Effort } from "./Settings";
import type { ModelId } from "./ModelId";

/** Default values to populate a spell form when creating or resetting options. */
export interface FormDefaults {
  defaultModel: ModelId;
  defaultEffort: Effort | null;
}
