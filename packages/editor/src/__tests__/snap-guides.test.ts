import { describe, it, expect } from "vitest";
import {
  computeContainerSnapTargets,
  computeSiblingSnapTargets,
  resolveSnap,
  resolveEqualSpacingSnap,
  resolveSizeMatchSnap,
  type SnapBox,
  type SnapReference,
} from "../snap-guides";

describe("computeContainerSnapTargets", () => {
  it("emits edge + center references on both axes", () => {
    const refs = computeContainerSnapTargets({ width: 200, height: 100 });
    expect(refs).toHaveLength(6);
    expect(refs).toContainEqual({ axis: "vertical", position: 0, kind: "edge" });
    expect(refs).toContainEqual({ axis: "vertical", position: 100, kind: "center" });
    expect(refs).toContainEqual({ axis: "vertical", position: 200, kind: "edge" });
    expect(refs).toContainEqual({ axis: "horizontal", position: 0, kind: "edge" });
    expect(refs).toContainEqual({ axis: "horizontal", position: 50, kind: "center" });
    expect(refs).toContainEqual({ axis: "horizontal", position: 100, kind: "edge" });
  });

  it("offsets references by origin (letterboxed image inside a larger canvas)", () => {
    const refs = computeContainerSnapTargets({ width: 80, height: 80 }, { x: 10, y: 10 });
    expect(refs).toContainEqual({ axis: "vertical", position: 50, kind: "center" });
    expect(refs).toContainEqual({ axis: "vertical", position: 10, kind: "edge" });
    expect(refs).toContainEqual({ axis: "vertical", position: 90, kind: "edge" });
  });
});

describe("resolveSnap — image/canvas center", () => {
  it("snaps a box center to the container center within threshold", () => {
    const refs = computeContainerSnapTargets({ width: 200, height: 100 });
    // Box 20x20; center at (98, 50) — 2px off the canvas center (100, 50).
    const box: SnapBox = { x: 88, y: 40, width: 20, height: 20 };
    const result = resolveSnap(box, refs, 8, 1);
    expect(result.x).toBe(90); // center now at 100
    expect(result.y).toBe(40); // already centered on 50
    expect(result.guides).toContainEqual({ axis: "vertical", position: 100, kind: "center" });
    expect(result.guides).toContainEqual({ axis: "horizontal", position: 50, kind: "center" });
  });

  it("distinguishes image-center from canvas-center (letterboxed layout)", () => {
    const refs = [
      ...computeContainerSnapTargets({ width: 200, height: 200 }), // canvas center (100, 100)
      ...computeContainerSnapTargets({ width: 80, height: 80 }, { x: 10, y: 10 }), // image center (50, 50)
    ];
    // Box centered near the IMAGE center (50, 50) snaps to the image center line.
    const nearImage: SnapBox = { x: 46, y: 46, width: 10, height: 10 };
    const imageResult = resolveSnap(nearImage, refs, 8, 1);
    expect(imageResult.x).toBe(45); // center -> 50
    expect(imageResult.guides).toContainEqual({ axis: "vertical", position: 50, kind: "center" });

    // Box centered near the CANVAS center (100, 100) snaps to the canvas center line.
    const nearCanvas: SnapBox = { x: 96, y: 96, width: 10, height: 10 };
    const canvasResult = resolveSnap(nearCanvas, refs, 8, 1);
    expect(canvasResult.x).toBe(95); // center -> 100
    expect(canvasResult.guides).toContainEqual({ axis: "vertical", position: 100, kind: "center" });
  });
});

describe("resolveSnap — thresholds", () => {
  const centerRef: SnapReference[] = [{ axis: "vertical", position: 50, kind: "center" }];

  it("snaps when exactly at the threshold, not one unit past it", () => {
    // width 20 → center = x + 10. threshold 8 (scale 1).
    const atThreshold: SnapBox = { x: 32, y: 0, width: 20, height: 20 }; // center 42, delta 8
    const atResult = resolveSnap(atThreshold, centerRef, 8, 1);
    expect(atResult.x).toBe(40); // snapped, center -> 50
    expect(atResult.guides).toHaveLength(1);

    const pastThreshold: SnapBox = { x: 31, y: 0, width: 20, height: 20 }; // center 41, delta 9
    const pastResult = resolveSnap(pastThreshold, centerRef, 8, 1);
    expect(pastResult.x).toBe(31); // unchanged
    expect(pastResult.guides).toHaveLength(0);
  });

  it("does not snap outside the threshold", () => {
    const box: SnapBox = { x: 0, y: 0, width: 20, height: 20 }; // center 10, delta 40
    const result = resolveSnap(box, centerRef, 8, 1);
    expect(result.x).toBe(0);
    expect(result.guides).toHaveLength(0);
  });

  it("converts the threshold to canvas-space via / scale", () => {
    const box: SnapBox = { x: 32, y: 0, width: 20, height: 20 }; // center 42, delta 8
    // scale 2 → canvas threshold 4 < 8 → no snap.
    expect(resolveSnap(box, centerRef, 8, 2).guides).toHaveLength(0);
    // scale 0.5 → canvas threshold 16 > 8 → snaps.
    expect(resolveSnap(box, centerRef, 8, 0.5).x).toBe(40);
  });
});

describe("computeSiblingSnapTargets", () => {
  it("emits edge + center references per sibling box", () => {
    const boxes: SnapBox[] = [
      { x: 10, y: 20, width: 30, height: 40 },
      { x: 100, y: 100, width: 10, height: 10 },
    ];
    const refs = computeSiblingSnapTargets(boxes);
    expect(refs).toHaveLength(12); // 6 per box
    expect(refs).toContainEqual({ axis: "vertical", position: 10, kind: "edge" });
    expect(refs).toContainEqual({ axis: "vertical", position: 25, kind: "center" }); // 10 + 30/2
    expect(refs).toContainEqual({ axis: "vertical", position: 40, kind: "edge" });
    expect(refs).toContainEqual({ axis: "horizontal", position: 20, kind: "edge" });
    expect(refs).toContainEqual({ axis: "horizontal", position: 40, kind: "center" }); // 20 + 40/2
    expect(refs).toContainEqual({ axis: "horizontal", position: 60, kind: "edge" });
  });

  it("snaps a dragged box to a sibling box's edge and center", () => {
    const sibling: SnapBox = { x: 100, y: 50, width: 40, height: 20 }; // left 100, center 120, right 140
    const dragBox: SnapBox = { x: 97, y: 50, width: 20, height: 20 }; // left 97, 3px off sibling's left edge
    const refs = computeSiblingSnapTargets([sibling]);
    const result = resolveSnap(dragBox, refs, 8, 1);
    expect(result.x).toBe(100);
    expect(result.guides).toContainEqual({ axis: "vertical", position: 100, kind: "edge" });
  });

  it("does not exclude the dragged box itself — the caller must exclude it before calling", () => {
    const dragBox: SnapBox = { x: 50, y: 50, width: 20, height: 20 };

    // Misuse: caller forgets to exclude the dragged box from the sibling list
    // -> it trivially "snaps" to its own edges (delta 0). This module carries
    // no self-exclusion logic by design (see plan "Sibling-snap staleness").
    const refsIncludingSelf = computeSiblingSnapTargets([dragBox]);
    const selfSnap = resolveSnap(dragBox, refsIncludingSelf, 8, 1);
    expect(selfSnap.guides.length).toBeGreaterThan(0);

    // Correct usage: caller excludes the dragged node's own box first.
    const refsExcludingSelf = computeSiblingSnapTargets([]);
    const noSelfSnap = resolveSnap(dragBox, refsExcludingSelf, 8, 1);
    expect(noSelfSnap.guides).toHaveLength(0);
    expect(noSelfSnap.x).toBe(dragBox.x);
    expect(noSelfSnap.y).toBe(dragBox.y);
  });
});

describe("resolveEqualSpacingSnap", () => {
  it("returns null with only 1 other box (2 elements total) — nothing to space against", () => {
    const dragBox: SnapBox = { x: 50, y: 0, width: 20, height: 20 };
    const other: SnapBox = { x: 0, y: 0, width: 20, height: 20 };
    expect(resolveEqualSpacingSnap(dragBox, [other], "vertical", 8, 1)).toBeNull();
  });

  it("detects equal spacing among 3+ evenly-spaced elements", () => {
    const before: SnapBox = { x: 0, y: 0, width: 20, height: 20 };
    const after: SnapBox = { x: 100, y: 0, width: 20, height: 20 };
    // Gap on each side of dragBox is 30 (already evenly spaced) -> delta 0.
    const dragBox: SnapBox = { x: 50, y: 0, width: 20, height: 20 };
    const result = resolveEqualSpacingSnap(dragBox, [before, after], "vertical", 8, 1);
    expect(result).not.toBeNull();
    expect(result?.position).toBe(50);
    expect(result?.guide).toEqual({ axis: "vertical", position: 60, kind: "spacing" });
  });

  it("snaps to the equalized position when a near-miss is within threshold", () => {
    const before: SnapBox = { x: 0, y: 0, width: 20, height: 20 };
    const after: SnapBox = { x: 100, y: 0, width: 20, height: 20 };
    // Equalized position is x=50; dragBox is 4px off, within the 8px threshold.
    const dragBox: SnapBox = { x: 46, y: 0, width: 20, height: 20 };
    const result = resolveEqualSpacingSnap(dragBox, [before, after], "vertical", 8, 1);
    expect(result?.position).toBe(50);
  });

  it("returns null when the equalized position is outside threshold", () => {
    const before: SnapBox = { x: 0, y: 0, width: 20, height: 20 };
    const after: SnapBox = { x: 100, y: 0, width: 20, height: 20 };
    // Equalized position is x=50; dragBox is 20px off, past the 8px threshold.
    const dragBox: SnapBox = { x: 30, y: 0, width: 20, height: 20 };
    expect(resolveEqualSpacingSnap(dragBox, [before, after], "vertical", 8, 1)).toBeNull();
  });

  it("ignores boxes that don't overlap on the cross axis (no false positive)", () => {
    const before: SnapBox = { x: 0, y: 0, width: 20, height: 20 };
    // Far away on y (the cross axis for a "vertical" snap) — not a same-row neighbor.
    const farOnCrossAxis: SnapBox = { x: 100, y: 200, width: 20, height: 20 };
    const dragBox: SnapBox = { x: 50, y: 0, width: 20, height: 20 };
    expect(resolveEqualSpacingSnap(dragBox, [before, farOnCrossAxis], "vertical", 8, 1)).toBeNull();
  });

  it("is axis-agnostic — detects equal spacing along the horizontal (y) axis", () => {
    const before: SnapBox = { x: 0, y: 0, width: 20, height: 20 };
    const after: SnapBox = { x: 0, y: 100, width: 20, height: 20 };
    const dragBox: SnapBox = { x: 0, y: 50, width: 20, height: 20 };
    const result = resolveEqualSpacingSnap(dragBox, [before, after], "horizontal", 8, 1);
    expect(result?.position).toBe(50);
    expect(result?.guide).toEqual({ axis: "horizontal", position: 60, kind: "spacing" });
  });
});

describe("resolveSizeMatchSnap", () => {
  it("matches width only when height has no qualifying sibling", () => {
    const siblingSizes = [{ width: 104, height: 500 }];
    const result = resolveSizeMatchSnap({ width: 100, height: 50 }, siblingSizes, 8, 1);
    expect(result.width).toBe(104);
    expect(result.height).toBe(50); // unchanged — 500 is way outside threshold
    expect(result.guides).toEqual([{ axis: "vertical", position: 104, kind: "size" }]);
  });

  it("matches height only when width has no qualifying sibling", () => {
    const siblingSizes = [{ width: 500, height: 54 }];
    const result = resolveSizeMatchSnap({ width: 100, height: 50 }, siblingSizes, 8, 1);
    expect(result.width).toBe(100); // unchanged
    expect(result.height).toBe(54);
    expect(result.guides).toEqual([{ axis: "horizontal", position: 54, kind: "size" }]);
  });

  it("matches width and height independently against different siblings", () => {
    const siblingSizes = [
      { width: 103, height: 999 },
      { width: 999, height: 47 },
    ];
    const result = resolveSizeMatchSnap({ width: 100, height: 50 }, siblingSizes, 8, 1);
    expect(result.width).toBe(103);
    expect(result.height).toBe(47);
    expect(result.guides).toHaveLength(2);
    expect(result.guides).toContainEqual({ axis: "vertical", position: 103, kind: "size" });
    expect(result.guides).toContainEqual({ axis: "horizontal", position: 47, kind: "size" });
  });

  it("does not snap when every sibling dimension is outside the threshold", () => {
    const siblingSizes = [{ width: 200, height: 200 }];
    const result = resolveSizeMatchSnap({ width: 100, height: 50 }, siblingSizes, 8, 1);
    expect(result).toEqual({ width: 100, height: 50, guides: [] });
  });

  it("returns no match when there are no siblings", () => {
    const result = resolveSizeMatchSnap({ width: 100, height: 50 }, [], 8, 1);
    expect(result).toEqual({ width: 100, height: 50, guides: [] });
  });

  it("converts the threshold to canvas-space via / scale", () => {
    const siblingSizes = [{ width: 108, height: 999 }]; // width 8px off at scale 1; height far outside any scale
    expect(resolveSizeMatchSnap({ width: 100, height: 50 }, siblingSizes, 8, 2).guides).toHaveLength(0);
    expect(resolveSizeMatchSnap({ width: 100, height: 50 }, siblingSizes, 8, 0.5).width).toBe(108);
  });
});

describe("resolveSnap — upright bbox only", () => {
  it("ignores any rotation-like field on the input box (upright semantics)", () => {
    const refs = computeContainerSnapTargets({ width: 200, height: 100 });
    const upright: SnapBox = { x: 88, y: 40, width: 20, height: 20 };
    const withRotation = { ...upright, rotation: 45 } as SnapBox;
    expect(resolveSnap(withRotation, refs, 8, 1)).toEqual(resolveSnap(upright, refs, 8, 1));
  });
});
