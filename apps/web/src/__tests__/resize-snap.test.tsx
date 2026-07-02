/**
 * Phase 4.5 (plan "canvas-zoom-and-smart-guides"): resize-to-match-sibling-
 * size behavior. Injects a real `computeResizeSnap` built from @maga/editor's
 * `resolveSizeMatchSnap` (mirroring BatchWorkspace.tsx's wiring) directly into
 * TextNodeLayer/OverlayNodeLayer — exercises the actual resize-snap wiring in
 * `handleResizePointerMove`/`handleResizePointerUp`, not a stub. This is a
 * SEPARATE, ADDITIVE path from move-guide snapping (`text-node-snap.test.tsx`)
 * — it only shares the `SnapGuide` type and the `onGuidesChange` callback.
 */
import { describe, it, expect, vi, beforeAll } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TextNodeLayer } from "@/components/text-node-layer";
import { OverlayNodeLayer, recordIntrinsicRatio } from "@/components/overlay-node-layer";
import { resolveSizeMatchSnap } from "@maga/editor";
import type { TextNode, OverlayNode, NodeId, SnapGuide } from "@maga/editor";

beforeAll(() => {
  if (!Element.prototype.setPointerCapture) {
    Element.prototype.setPointerCapture = vi.fn();
  }
  if (!Element.prototype.releasePointerCapture) {
    Element.prototype.releasePointerCapture = vi.fn();
  }
});

const SNAP_THRESHOLD_PX = 8;

/** Mirrors BatchWorkspace.tsx's computeResizeSnap wiring against a fixed sibling size list. */
function makeComputeResizeSnap(siblingSizes: { width: number; height: number }[]) {
  return (dragSize: { width: number; height: number }, _canvasSize: { width: number; height: number }) =>
    resolveSizeMatchSnap(dragSize, siblingSizes, SNAP_THRESHOLD_PX, 1);
}

function makeTextNode(overrides: Partial<TextNode> = {}): TextNode {
  return {
    id: "node-1" as NodeId,
    content: "Hi",
    x: 10,
    y: 10,
    rotation: 0,
    zIndex: 0,
    fontSize: 16,
    color: "#000000",
    opacity: 1,
    fontFamily: "Inter",
    fontWeight: "normal",
    fontStyle: "normal",
    shadow: null,
    textBackground: null,
    ...overrides,
  };
}

const baseImageNode: OverlayNode = {
  id: "overlay-1" as NodeId,
  src: "data:image/png;base64,abc",
  x: 10,
  y: 10,
  width: 150,
  height: 100,
  opacity: 1,
  zIndex: 0,
  overlayType: "image",
};

describe("TextNodeLayer resize-to-match-sibling-size (Phase 4.5)", () => {
  it("snaps width to a sibling's width within threshold and reports a size guide", () => {
    const onResize = vi.fn();
    const onGuidesChange = vi.fn();
    const node = makeTextNode({ width: 100, height: 50 });
    // dw=50 -> candidate width 150, 4px off the sibling's 154 -> within the 8px threshold.
    const computeResizeSnap = makeComputeResizeSnap([{ width: 154, height: 999 }]);
    render(
      <TextNodeLayer
        node={node}
        onMove={vi.fn()}
        onSelect={vi.fn()}
        isSelected={true}
        onResize={onResize}
        onHeightResize={vi.fn()}
        computeResizeSnap={computeResizeSnap}
        onGuidesChange={onGuidesChange}
      />,
    );

    const handle = screen.getByLabelText(/resize handle/i);
    fireEvent.pointerDown(handle, { clientX: 200, buttons: 1, pointerId: 1 });
    fireEvent.pointerMove(handle, { clientX: 250, buttons: 1 });

    expect(onResize).toHaveBeenCalledWith(154);
    const lastGuides = onGuidesChange.mock.calls.at(-1)?.[0] as SnapGuide[];
    expect(lastGuides).toHaveLength(1);
    expect(lastGuides[0]?.kind).toBe("size");
    expect(lastGuides[0]?.axis).toBe("vertical");
  });

  it("clears the reported guide on pointer-up", () => {
    const onGuidesChange = vi.fn();
    const node = makeTextNode({ width: 100, height: 50 });
    const computeResizeSnap = makeComputeResizeSnap([{ width: 154, height: 999 }]);
    render(
      <TextNodeLayer
        node={node}
        onMove={vi.fn()}
        onSelect={vi.fn()}
        isSelected={true}
        onResize={vi.fn()}
        onHeightResize={vi.fn()}
        computeResizeSnap={computeResizeSnap}
        onGuidesChange={onGuidesChange}
      />,
    );

    const handle = screen.getByLabelText(/resize handle/i);
    fireEvent.pointerDown(handle, { clientX: 200, buttons: 1, pointerId: 1 });
    fireEvent.pointerMove(handle, { clientX: 250, buttons: 1 });
    fireEvent.pointerUp(handle, { pointerId: 1 });

    expect(onGuidesChange.mock.calls.at(-1)?.[0]).toEqual([]);
  });

  it("does not snap or report a guide when resizing away from every sibling size", () => {
    const onResize = vi.fn();
    const onGuidesChange = vi.fn();
    const node = makeTextNode({ width: 100, height: 50 });
    const computeResizeSnap = makeComputeResizeSnap([{ width: 500, height: 500 }]);
    render(
      <TextNodeLayer
        node={node}
        onMove={vi.fn()}
        onSelect={vi.fn()}
        isSelected={true}
        onResize={onResize}
        onHeightResize={vi.fn()}
        computeResizeSnap={computeResizeSnap}
        onGuidesChange={onGuidesChange}
      />,
    );

    const handle = screen.getByLabelText(/resize handle/i);
    fireEvent.pointerDown(handle, { clientX: 200, buttons: 1, pointerId: 1 });
    fireEvent.pointerMove(handle, { clientX: 250, buttons: 1 });

    expect(onResize).toHaveBeenCalledWith(150); // raw candidate, unchanged — no sibling within threshold
    expect(onGuidesChange.mock.calls.at(-1)?.[0]).toEqual([]);
  });

  it("preserves existing resize behavior (no snap regression) when computeResizeSnap is absent", () => {
    const onResize = vi.fn();
    const node = makeTextNode({ width: 100, height: 50 });
    render(
      <TextNodeLayer node={node} onMove={vi.fn()} onSelect={vi.fn()} isSelected={true} onResize={onResize} onHeightResize={vi.fn()} />,
    );

    const handle = screen.getByLabelText(/resize handle/i);
    fireEvent.pointerDown(handle, { clientX: 200, buttons: 1, pointerId: 1 });
    fireEvent.pointerMove(handle, { clientX: 250, buttons: 1 });

    expect(onResize).toHaveBeenCalledWith(150);
  });
});

describe("OverlayNodeLayer resize-to-match-sibling-size (Phase 4.5)", () => {
  function dragResizeHandle(dx: number, dy: number) {
    const handle = screen.getByLabelText("Resize handle");
    handle.setPointerCapture = vi.fn();
    handle.releasePointerCapture = vi.fn();
    fireEvent.pointerDown(handle, { clientX: 0, clientY: 0 });
    fireEvent.pointerMove(handle, { clientX: dx, clientY: dy, buttons: 1 });
  }

  it("snaps height to a sibling's height within threshold and reports a size guide", () => {
    const onResize = vi.fn();
    const onGuidesChange = vi.fn();
    const node: OverlayNode = { ...baseImageNode, id: "overlay-snap" as NodeId };
    // dy=20 -> candidate height 120, 3px off the sibling's 123 -> within threshold.
    const computeResizeSnap = makeComputeResizeSnap([{ width: 999, height: 123 }]);
    render(
      <OverlayNodeLayer
        node={node}
        onMove={vi.fn()}
        onResize={onResize}
        onSelect={vi.fn()}
        isSelected={true}
        computeResizeSnap={computeResizeSnap}
        onGuidesChange={onGuidesChange}
      />,
    );

    dragResizeHandle(0, 20);

    expect(onResize).toHaveBeenCalledWith(150, 123); // width unchanged, height snapped
    const lastGuides = onGuidesChange.mock.calls.at(-1)?.[0] as SnapGuide[];
    expect(lastGuides).toHaveLength(1);
    expect(lastGuides[0]?.kind).toBe("size");
    expect(lastGuides[0]?.axis).toBe("horizontal");
  });

  it("clears the reported guide on pointer-up", () => {
    const onGuidesChange = vi.fn();
    const node: OverlayNode = { ...baseImageNode, id: "overlay-clear" as NodeId };
    const computeResizeSnap = makeComputeResizeSnap([{ width: 999, height: 123 }]);
    render(
      <OverlayNodeLayer
        node={node}
        onMove={vi.fn()}
        onResize={vi.fn()}
        onSelect={vi.fn()}
        isSelected={true}
        computeResizeSnap={computeResizeSnap}
        onGuidesChange={onGuidesChange}
      />,
    );

    dragResizeHandle(0, 20);
    fireEvent.pointerUp(screen.getByLabelText("Resize handle"), { pointerId: 1 });

    expect(onGuidesChange.mock.calls.at(-1)?.[0]).toEqual([]);
  });

  it("does not snap when resizing away from every sibling size", () => {
    const onResize = vi.fn();
    const onGuidesChange = vi.fn();
    const node: OverlayNode = { ...baseImageNode, id: "overlay-no-snap" as NodeId };
    const computeResizeSnap = makeComputeResizeSnap([{ width: 999, height: 999 }]);
    render(
      <OverlayNodeLayer
        node={node}
        onMove={vi.fn()}
        onResize={onResize}
        onSelect={vi.fn()}
        isSelected={true}
        computeResizeSnap={computeResizeSnap}
        onGuidesChange={onGuidesChange}
      />,
    );

    dragResizeHandle(0, 20);

    expect(onResize).toHaveBeenCalledWith(150, 120); // raw candidate, unchanged
    expect(onGuidesChange.mock.calls.at(-1)?.[0]).toEqual([]);
  });

  it("aspect-ratio lock takes precedence: a size-match snap is re-constrained to the intrinsic ratio", () => {
    const onResize = vi.fn();
    const node: OverlayNode = { ...baseImageNode, id: "overlay-locked-snap" as NodeId, aspectRatioLocked: true };
    recordIntrinsicRatio(node.id, 300, 100); // intrinsic 3:1
    // Sibling width 180 is exactly the unlocked candidate (dw=30 -> 180) — matches trivially,
    // but the locked ratio must still re-derive height = 180 / 3 = 60, not the raw dy-derived height.
    const computeResizeSnap = makeComputeResizeSnap([{ width: 180, height: 999 }]);
    render(
      <OverlayNodeLayer
        node={node}
        onMove={vi.fn()}
        onResize={onResize}
        onSelect={vi.fn()}
        isSelected={true}
        computeResizeSnap={computeResizeSnap}
      />,
    );

    dragResizeHandle(30, 999); // dy ignored by the ratio lock, same as the non-snap locked-resize tests

    expect(onResize).toHaveBeenCalledWith(180, 60);
  });

  it("aspect-ratio lock: a height-axis size-match never reports a guide the final size doesn't have", () => {
    // Regression for a bug found in code review: `constrainResizeToRatio`
    // always re-derives height as width/ratio when locked, discarding any
    // snapped height — so a height-axis "size" guide would claim a match
    // the persisted size doesn't actually hold. The guide must be dropped.
    const onResize = vi.fn();
    const onGuidesChange = vi.fn();
    const node: OverlayNode = { ...baseImageNode, id: "overlay-locked-height-match" as NodeId, aspectRatioLocked: true };
    recordIntrinsicRatio(node.id, 300, 100); // intrinsic 3:1
    // dx=0 -> candidateWidth stays 150 -> ratio-derived candidateHeight = 150/3 = 50.
    // Sibling height 52 is within the 8px threshold of that candidate height,
    // so computeResizeSnap WOULD report a height-axis size match if not filtered.
    // Sibling width 999 stays far from 150, so no width-axis match competes.
    const computeResizeSnap = makeComputeResizeSnap([{ width: 999, height: 52 }]);
    render(
      <OverlayNodeLayer
        node={node}
        onMove={vi.fn()}
        onResize={onResize}
        onSelect={vi.fn()}
        isSelected={true}
        computeResizeSnap={computeResizeSnap}
        onGuidesChange={onGuidesChange}
      />,
    );

    dragResizeHandle(0, 999); // dy ignored by the ratio lock

    // Final size is purely ratio-derived (150 / 3 = 50) — NOT the sibling's 52.
    expect(onResize).toHaveBeenCalledWith(150, 50);
    // No guide claims a height match, since the final height doesn't have one.
    const lastGuides = onGuidesChange.mock.calls.at(-1)?.[0] as SnapGuide[];
    expect(lastGuides.some((g) => g.kind === "size" && g.axis === "horizontal")).toBe(false);
  });
});
