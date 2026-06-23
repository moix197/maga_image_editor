import { describe, it, expect } from "vitest";
import { reconcileVariantSelection } from "@/lib/variant-selection";

describe("reconcileVariantSelection", () => {
  it("active switch A→D with {A,B,C} selected → resets to {D}", () => {
    const result = reconcileVariantSelection({
      prev: new Set(["a", "b", "c"]),
      activeId: "d",
      overlayIds: ["a", "b", "c", "d"],
      activeChanged: true,
    });
    expect(result).toEqual(new Set(["d"]));
  });

  it("non-active deletion: {A,B,C} selected, active A, C removed → {A,B}", () => {
    const result = reconcileVariantSelection({
      prev: new Set(["a", "b", "c"]),
      activeId: "a",
      overlayIds: ["a", "b"],
      activeChanged: false,
    });
    expect(result).toEqual(new Set(["a", "b"]));
  });

  it("active deleted: active was C (now removed), new active A → {A}", () => {
    const result = reconcileVariantSelection({
      prev: new Set(["a", "b", "c"]),
      activeId: "a",
      overlayIds: ["a", "b"],
      activeChanged: true,
    });
    expect(result).toEqual(new Set(["a"]));
  });

  it("single variant → {thatId}", () => {
    const result = reconcileVariantSelection({
      prev: new Set(["x"]),
      activeId: "x",
      overlayIds: ["x"],
      activeChanged: false,
    });
    expect(result).toEqual(new Set(["x"]));
  });
});
