import type { Tone } from "@/lib/portal/status";

export const ACCESS_TONE: Record<string, Tone> = {
  active: "success",
  invited: "info",
  disabled: "danger",
};
