import { describe, it, expect } from "vitest";
import { resolveOverlayFromAssets } from "@/lib/overlay-from-assets";
import type { ProjectAsset } from "@maga/projects";

function makeAsset(id: string): ProjectAsset {
  return { id, filename: id + ".png", blobKey: "data:image/png;base64," + id };
}

const OVERLAYS: ProjectAsset[] = [makeAsset("a"), makeAsset("b"), makeAsset("c")];

describe("resolveOverlayFromAssets", () => {
  it("1 id → static-node intent (no variable slot)", () => {
    const decision = resolveOverlayFromAssets(["b"], OVERLAYS);
    expect(decision).toEqual({
      nodeSrc: OVERLAYS[1]!.blobKey,
      makeVariableSlot: false,
      variantIds: ["b"],
    });
  });

  it("2+ ids → makeVariableSlot true with the picked ids as the variant set", () => {
    const decision = resolveOverlayFromAssets(["a", "c"], OVERLAYS);
    expect(decision).toEqual({
      nodeSrc: OVERLAYS[0]!.blobKey,
      makeVariableSlot: true,
      variantIds: ["a", "c"],
    });
  });

  it("uses the first picked asset's blobKey as nodeSrc, preserving pick order", () => {
    const decision = resolveOverlayFromAssets(["c", "a"], OVERLAYS);
    expect(decision?.nodeSrc).toBe(OVERLAYS[2]!.blobKey);
    expect(decision?.variantIds).toEqual(["c", "a"]);
  });

  it("returns null when no picked id resolves to a known asset", () => {
    expect(resolveOverlayFromAssets(["missing"], OVERLAYS)).toBeNull();
  });

  it("returns null for an empty selection", () => {
    expect(resolveOverlayFromAssets([], OVERLAYS)).toBeNull();
  });

  it("ignores unresolved ids but still resolves the known ones (2+ after filtering)", () => {
    const decision = resolveOverlayFromAssets(["a", "missing", "b"], OVERLAYS);
    expect(decision).toEqual({
      nodeSrc: OVERLAYS[0]!.blobKey,
      makeVariableSlot: true,
      variantIds: ["a", "b"],
    });
  });
});
