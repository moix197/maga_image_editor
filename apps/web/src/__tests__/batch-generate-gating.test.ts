import { describe, it, expect } from "vitest";
import type { VariableSlot } from "@maga/projects";
import type { NodeId } from "@maga/editor";
import { canGenerateBatch } from "@/lib/batch-gating";

function makeSlot(nodeId: string): VariableSlot {
  return { overlayNodeId: nodeId as NodeId, width: 100, height: 100 };
}

describe("canGenerateBatch gating", () => {
  it("false when variableSlot is null", () => {
    expect(canGenerateBatch(null, 3)).toBe(false);
  });

  it("false when overlayCount is 0", () => {
    expect(canGenerateBatch(makeSlot("node-1"), 0)).toBe(false);
  });

  it("true when variableSlot set and overlayCount >= 1", () => {
    expect(canGenerateBatch(makeSlot("node-1"), 1)).toBe(true);
    expect(canGenerateBatch(makeSlot("node-1"), 5)).toBe(true);
  });

  it("false when slot node was deleted (variableSlot set to null)", () => {
    const slotAfterDelete: VariableSlot | null = null;
    expect(canGenerateBatch(slotAfterDelete, 3)).toBe(false);
  });
});
