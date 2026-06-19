import { describe, it, expect } from "vitest";
import { buildFeatherMaskCss } from "@/lib/css-helpers";

describe("buildFeatherMaskCss", () => {
  it("returns a gradient string with the expected inset stops", () => {
    const mask = buildFeatherMaskCss(20, 200, 100);
    expect(mask).toContain("linear-gradient(to bottom");
    expect(mask).toContain("linear-gradient(to right");
    expect(mask).toContain("transparent 0");
    expect(mask).toContain("black 20px");
    expect(mask).toContain("calc(100% - 20px)");
  });

  it("clamps the inset to half the smaller dimension", () => {
    // height 100 => max inset 50; radius 80 clamps to 50px
    const mask = buildFeatherMaskCss(80, 200, 100);
    expect(mask).toContain("black 50px");
  });

  it("returns empty string for radius 0", () => {
    expect(buildFeatherMaskCss(0, 200, 100)).toBe("");
  });
});
