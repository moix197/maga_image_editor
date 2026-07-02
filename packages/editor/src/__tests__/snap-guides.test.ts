import { describe, it, expect } from "vitest";
import {
  computeContainerSnapTargets,
  resolveSnap,
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

describe("resolveSnap — upright bbox only", () => {
  it("ignores any rotation-like field on the input box (upright semantics)", () => {
    const refs = computeContainerSnapTargets({ width: 200, height: 100 });
    const upright: SnapBox = { x: 88, y: 40, width: 20, height: 20 };
    const withRotation = { ...upright, rotation: 45 } as SnapBox;
    expect(resolveSnap(withRotation, refs, 8, 1)).toEqual(resolveSnap(upright, refs, 8, 1));
  });
});
