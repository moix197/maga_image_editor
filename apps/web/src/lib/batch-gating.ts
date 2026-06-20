import type { VariableSlot } from "@maga/projects";

export function canGenerateBatch(variableSlot: VariableSlot | null, overlayCount: number): boolean {
  return variableSlot != null && overlayCount >= 1;
}
