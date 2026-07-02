/**
 * Phase 2 (plan "canvas-zoom-and-smart-guides"): drag-to-snap behavior.
 * Renders the real TextOverlayCanvas with a real computeSnap closure built
 * from @maga/editor's computeContainerSnapTargets/resolveSnap (mirroring
 * BatchWorkspace.tsx's wiring), so this exercises the actual snap math + DOM
 * wiring, not a stub. getBoundingClientRect is mocked per-element: the
 * canvasCallbackRef div gets the canvas/image bounds, any other element (the
 * dragged node's own root div) gets a fixed live-measured box — this is what
 * proves the TextNode SnapBox comes from the node's OWN rendered rect, not
 * `node.width`/`node.height` (which may be undefined for auto-sized text).
 */
import { describe, it, expect, vi, beforeAll } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { useState, useRef } from "react";
import { TextOverlayCanvas } from "@/components/text-overlay-canvas";
import {
  computeContainerSnapTargets,
  computeSiblingSnapTargets,
  resolveSnap,
  resolveEqualSpacingSnap,
} from "@maga/editor";
import type { EditorState, SnapBox, SnapGuide, TextNode, NodeId } from "@maga/editor";

beforeAll(() => {
  if (!Element.prototype.setPointerCapture) {
    Element.prototype.setPointerCapture = vi.fn();
  }
  if (!Element.prototype.releasePointerCapture) {
    Element.prototype.releasePointerCapture = vi.fn();
  }
});

const SNAP_THRESHOLD_PX = 8;
const CANVAS_WIDTH = 400;
const CANVAS_HEIGHT = 300;
/** The dragged node's OWN live-measured box (mocked getBoundingClientRect), distinct from any node.width/height. */
const LIVE_NODE_WIDTH = 40;
const LIVE_NODE_HEIGHT = 20;

function computeSnap(
  box: SnapBox,
  canvasSize: { width: number; height: number },
): { x: number; y: number; guides: SnapGuide[] } {
  const references = computeContainerSnapTargets(canvasSize);
  return resolveSnap(box, references, SNAP_THRESHOLD_PX, 1);
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

/** Renders TextOverlayCanvas wired exactly like BatchWorkspace.tsx: computeSnap in, guides state round-tripped. */
function Harness({ initial }: { initial: TextNode }) {
  const [node, setNode] = useState(initial);
  const [guides, setGuides] = useState<SnapGuide[]>([]);
  const state: EditorState = { nodes: [node] };
  return (
    <TextOverlayCanvas
      state={state}
      onNodeMove={(_id, x, y) => setNode((n) => ({ ...n, x, y }))}
      onNodeResize={vi.fn()}
      onNodeTextResize={vi.fn()}
      onNodeTextHeightResize={vi.fn()}
      onNodeContentChange={vi.fn()}
      onNodeSelect={vi.fn()}
      selectedNodeId={null}
      canvasCallbackRef={() => {}}
      imageSrc="data:image/png;base64,x"
      computeSnap={computeSnap}
      onGuidesChange={setGuides}
      activeGuides={guides}
    />
  );
}

/** Mocks getBoundingClientRect: the canvasCallbackRef div returns canvas bounds; any other element returns a fixed live-node box. */
function mockRects(canvasDiv: HTMLElement) {
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (
    this: HTMLElement,
  ) {
    if (this === canvasDiv) {
      return {
        left: 0,
        top: 0,
        width: CANVAS_WIDTH,
        height: CANVAS_HEIGHT,
        right: CANVAS_WIDTH,
        bottom: CANVAS_HEIGHT,
        x: 0,
        y: 0,
        toJSON() {},
      } as DOMRect;
    }
    return {
      left: 0,
      top: 0,
      width: LIVE_NODE_WIDTH,
      height: LIVE_NODE_HEIGHT,
      right: LIVE_NODE_WIDTH,
      bottom: LIVE_NODE_HEIGHT,
      x: 0,
      y: 0,
      toJSON() {},
    } as DOMRect;
  });
}

/**
 * Phase 3: mirrors BatchWorkspace.tsx's sibling-snap wiring — computeSnap
 * combines container refs with `computeSiblingSnapTargets` built from the
 * OTHER nodes currently in state, excluding the node being dragged via
 * `selectedNodeId` (set synchronously on pointer-down, before any
 * pointer-move, in text-node-layer.tsx's handlePointerDown -> onSelect()).
 */
function MultiNodeHarness({ initial }: { initial: TextNode[] }) {
  const [nodes, setNodes] = useState(initial);
  const [selectedNodeId, setSelectedNodeId] = useState<NodeId | null>(null);
  const [guides, setGuides] = useState<SnapGuide[]>([]);
  const state: EditorState = { nodes };

  function siblingSnapBox(node: TextNode, canvasSize: { width: number; height: number }): SnapBox {
    return {
      x: (node.x / 100) * canvasSize.width,
      y: (node.y / 100) * canvasSize.height,
      width: node.width ?? 0,
      height: node.height ?? 0,
    };
  }

  // Phase 4: equal-spacing tried per axis, only when that axis wasn't already
  // snapped by edge/center above — mirrors BatchWorkspace.tsx's precedence
  // rule (edge/center wins over spacing when both are in range).
  function computeSnapWithSiblings(
    box: SnapBox,
    canvasSize: { width: number; height: number },
  ): { x: number; y: number; guides: SnapGuide[] } {
    const siblingBoxes = nodes
      .filter((n) => n.id !== selectedNodeId)
      .map((n) => siblingSnapBox(n, canvasSize));
    const references = [
      ...computeContainerSnapTargets(canvasSize),
      ...computeSiblingSnapTargets(siblingBoxes),
    ];
    const edgeCenterResult = resolveSnap(box, references, SNAP_THRESHOLD_PX, 1);

    let x = edgeCenterResult.x;
    let y = edgeCenterResult.y;
    const guides = [...edgeCenterResult.guides];

    if (!edgeCenterResult.guides.some((g) => g.axis === "vertical")) {
      const spacingX = resolveEqualSpacingSnap(box, siblingBoxes, "vertical", SNAP_THRESHOLD_PX, 1);
      if (spacingX) {
        x = spacingX.position;
        guides.push(spacingX.guide);
      }
    }
    if (!edgeCenterResult.guides.some((g) => g.axis === "horizontal")) {
      const spacingY = resolveEqualSpacingSnap(box, siblingBoxes, "horizontal", SNAP_THRESHOLD_PX, 1);
      if (spacingY) {
        y = spacingY.position;
        guides.push(spacingY.guide);
      }
    }

    return { x, y, guides };
  }

  return (
    <TextOverlayCanvas
      state={state}
      onNodeMove={(id, x, y) => setNodes((ns) => ns.map((n) => (n.id === id ? { ...n, x, y } : n)))}
      onNodeResize={vi.fn()}
      onNodeTextResize={vi.fn()}
      onNodeTextHeightResize={vi.fn()}
      onNodeContentChange={vi.fn()}
      onNodeSelect={(id) => setSelectedNodeId(id as NodeId)}
      selectedNodeId={selectedNodeId}
      canvasCallbackRef={() => {}}
      imageSrc="data:image/png;base64,x"
      computeSnap={computeSnapWithSiblings}
      onGuidesChange={setGuides}
      activeGuides={guides}
    />
  );
}

/**
 * Regression harness for the "no purple line with default text nodes" bug
 * (plan "canvas-zoom-and-smart-guides" Phase 4 bugfix): mirrors
 * BatchWorkspace.tsx's FIXED siblingSnapBox — an auto-sized TextNode sibling
 * (no stored width/height) is measured from its own live DOM element via a
 * `nodeElementsRef` registry populated through `registerNodeElement`
 * (threaded down to TextNodeLayer), instead of collapsing to a zero-size
 * point box. Deliberately does NOT set width/height on any node, unlike
 * MultiNodeHarness above (which still uses the pre-fix zero-size fallback
 * and relies on siblings having an explicit `height` to get cross-axis
 * overlap) — that's the whole point of this regression test.
 */
function LiveMeasuredMultiNodeHarness({ initial }: { initial: TextNode[] }) {
  const [nodes, setNodes] = useState(initial);
  const [selectedNodeId, setSelectedNodeId] = useState<NodeId | null>(null);
  const [guides, setGuides] = useState<SnapGuide[]>([]);
  const state: EditorState = { nodes };
  const nodeElementsRef = useRef(new Map<NodeId, HTMLElement>());
  const registerNodeElement = (id: NodeId, el: HTMLElement | null) => {
    if (el) nodeElementsRef.current.set(id, el);
    else nodeElementsRef.current.delete(id);
  };

  function siblingSnapBox(node: TextNode, canvasSize: { width: number; height: number }): SnapBox {
    const x = (node.x / 100) * canvasSize.width;
    const y = (node.y / 100) * canvasSize.height;
    if (node.width !== undefined && node.height !== undefined) {
      return { x, y, width: node.width, height: node.height };
    }
    const rect = nodeElementsRef.current.get(node.id)?.getBoundingClientRect();
    return {
      x,
      y,
      width: node.width ?? (rect ? rect.width : 0),
      height: node.height ?? (rect ? rect.height : 0),
    };
  }

  function computeSnapWithSiblings(
    box: SnapBox,
    canvasSize: { width: number; height: number },
  ): { x: number; y: number; guides: SnapGuide[] } {
    const siblingBoxes = nodes
      .filter((n) => n.id !== selectedNodeId)
      .map((n) => siblingSnapBox(n, canvasSize));
    const references = [
      ...computeContainerSnapTargets(canvasSize),
      ...computeSiblingSnapTargets(siblingBoxes),
    ];
    const edgeCenterResult = resolveSnap(box, references, SNAP_THRESHOLD_PX, 1);

    let x = edgeCenterResult.x;
    let y = edgeCenterResult.y;
    const guides = [...edgeCenterResult.guides];

    if (!edgeCenterResult.guides.some((g) => g.axis === "vertical")) {
      const spacingX = resolveEqualSpacingSnap(box, siblingBoxes, "vertical", SNAP_THRESHOLD_PX, 1);
      if (spacingX) {
        x = spacingX.position;
        guides.push(spacingX.guide);
      }
    }
    if (!edgeCenterResult.guides.some((g) => g.axis === "horizontal")) {
      const spacingY = resolveEqualSpacingSnap(box, siblingBoxes, "horizontal", SNAP_THRESHOLD_PX, 1);
      if (spacingY) {
        y = spacingY.position;
        guides.push(spacingY.guide);
      }
    }

    return { x, y, guides };
  }

  return (
    <TextOverlayCanvas
      state={state}
      onNodeMove={(id, x, y) => setNodes((ns) => ns.map((n) => (n.id === id ? { ...n, x, y } : n)))}
      onNodeResize={vi.fn()}
      onNodeTextResize={vi.fn()}
      onNodeTextHeightResize={vi.fn()}
      onNodeContentChange={vi.fn()}
      onNodeSelect={(id) => setSelectedNodeId(id as NodeId)}
      selectedNodeId={selectedNodeId}
      canvasCallbackRef={() => {}}
      imageSrc="data:image/png;base64,x"
      computeSnap={computeSnapWithSiblings}
      onGuidesChange={setGuides}
      activeGuides={guides}
      registerNodeElement={registerNodeElement}
    />
  );
}

function getCanvasDiv(): HTMLElement {
  return screen.getByAltText("Editor canvas").parentElement as HTMLElement;
}

function getNodeDiv(content: string): HTMLElement {
  return screen.getByLabelText(`Text node: ${content}`);
}

function dragNode(nodeDiv: HTMLElement, from: { x: number; y: number }, to: { x: number; y: number }) {
  // dx/dy = 0 (grab exactly at the node's rendered origin).
  fireEvent.pointerDown(nodeDiv, { clientX: (from.x / 100) * CANVAS_WIDTH, clientY: (from.y / 100) * CANVAS_HEIGHT, buttons: 1, pointerId: 1 });
  fireEvent.pointerMove(nodeDiv, { clientX: (to.x / 100) * CANVAS_WIDTH, clientY: (to.y / 100) * CANVAS_HEIGHT, buttons: 1 });
}

describe("text node smart-guide snap (auto-sized TextNode, no stored width/height)", () => {
  it("snaps to the canvas/image center and renders a guide line; releasing persists the snapped position", () => {
    const node = makeTextNode();
    render(<Harness initial={node} />);
    mockRects(getCanvasDiv());

    const nodeDiv = getNodeDiv("Hi");
    // Drag near center: raw box (45.5%, 47.33%) -> canvas-space (182, 142),
    // 2px off the true center reference (180, 140) on both axes — within the
    // 8px threshold, so both axes snap exactly to center.
    dragNode(nodeDiv, { x: 10, y: 10 }, { x: 45.5, y: 47.33333333333333 });

    expect(document.querySelectorAll("[data-guide-line]").length).toBe(2);
    expect(parseFloat(nodeDiv.style.left)).toBeCloseTo(45, 5); // 180/400*100
    expect(parseFloat(nodeDiv.style.top)).toBeCloseTo(46.666666666666664, 5); // 140/300*100

    fireEvent.pointerUp(nodeDiv, { pointerId: 1 });
    expect(document.querySelectorAll("[data-guide-line]").length).toBe(0);
    // Position is unaffected by the guide clear on release.
    expect(parseFloat(nodeDiv.style.left)).toBeCloseTo(45, 5);
    expect(parseFloat(nodeDiv.style.top)).toBeCloseTo(46.666666666666664, 5);
  });

  it("dragging away from center produces no snap and no guide line", () => {
    const node = makeTextNode();
    render(<Harness initial={node} />);
    mockRects(getCanvasDiv());

    const nodeDiv = getNodeDiv("Hi");
    // 25%/25% -> canvas-space (100, 75) box origin — far from any edge/center
    // reference (nearest is 0 or 200/150), well outside the 8px threshold.
    dragNode(nodeDiv, { x: 10, y: 10 }, { x: 25, y: 25 });

    expect(document.querySelectorAll("[data-guide-line]").length).toBe(0);
    expect(parseFloat(nodeDiv.style.left)).toBeCloseTo(25, 5);
    expect(parseFloat(nodeDiv.style.top)).toBeCloseTo(25, 5);
  });

  it("builds the SnapBox from the node's own live measured rect, not node.width/node.height", () => {
    // width/height are set to values wildly different from the mocked live
    // rect (LIVE_NODE_WIDTH/HEIGHT) — if the component wrongly used
    // node.width/height for the SnapBox, the snap result would differ from
    // the auto-sized case above.
    const node = makeTextNode({ width: 999, height: 999 });
    render(<Harness initial={node} />);
    mockRects(getCanvasDiv());

    const nodeDiv = getNodeDiv("Hi");
    dragNode(nodeDiv, { x: 10, y: 10 }, { x: 45.5, y: 47.33333333333333 });

    expect(document.querySelectorAll("[data-guide-line]").length).toBe(2);
    expect(parseFloat(nodeDiv.style.left)).toBeCloseTo(45, 5);
    expect(parseFloat(nodeDiv.style.top)).toBeCloseTo(46.666666666666664, 5);
  });
});

describe("text node smart-guide snap — equal spacing (Phase 4)", () => {
  // Left/Right span canvas-space y=[0,100] (explicit height, not auto-sized)
  // so they overlap the dragged node's live-measured y-range [30,50] on the
  // cross axis (required for equal-spacing detection) while their own
  // horizontal edge/center references (0, 50, 100) stay a safe >8px away
  // from the dragged box's y-anchors (30, 40, 50) — avoiding an incidental
  // edge/center match on the Y axis that isn't the point of this test.
  // Their x (auto-sized, no stored width) sits at canvas-space 40 and 280
  // (10%/70% of the 400-wide mocked canvas) — the axis under test.
  it("dragging a node into the equal-gap position between two neighbors triggers the spacing guide and snap", () => {
    // With the dragged node's own live-measured width (40), the equalized
    // x position is 140 (35%): gap = (280 - 40 - 40) / 2 = 100 on each side.
    const left = makeTextNode({ id: "node-2" as NodeId, content: "Left", x: 10, y: 0, height: 100 });
    const right = makeTextNode({ id: "node-3" as NodeId, content: "Right", x: 70, y: 0, height: 100 });
    const dragged = makeTextNode({ content: "Dragged", x: 5, y: 10 });
    render(<MultiNodeHarness initial={[dragged, left, right]} />);
    mockRects(getCanvasDiv());

    const nodeDiv = getNodeDiv("Dragged");
    // Target raw box lands 4px off the equalized position (136 vs 140) —
    // within the 8px threshold, and far from any container/sibling
    // edge/center reference, so only the spacing snap applies.
    dragNode(nodeDiv, { x: 5, y: 10 }, { x: 34, y: 10 });

    expect(document.querySelectorAll("[data-guide-line]").length).toBe(1);
    expect(document.querySelectorAll('[data-guide-kind="spacing"]').length).toBe(1);
    expect(parseFloat(nodeDiv.style.left)).toBeCloseTo(35, 5); // 140/400*100
    expect(parseFloat(nodeDiv.style.top)).toBeCloseTo(10, 5); // unaffected

    fireEvent.pointerUp(nodeDiv, { pointerId: 1 });
    expect(document.querySelectorAll("[data-guide-line]").length).toBe(0);
    expect(parseFloat(nodeDiv.style.left)).toBeCloseTo(35, 5);
  });

  it("edge/center snap takes precedence over the equal-spacing snap on the same axis", () => {
    // Right moves out to canvas x=370 so the equalized spacing position is
    // far from the drag target, while the canvas center (200) is exactly on
    // it — isolating the edge/center branch and confirming the winning
    // guide is "center", never "spacing", per the LOCKED precedence rule.
    const left = makeTextNode({ id: "node-2" as NodeId, content: "Left", x: 10, y: 0, height: 100 });
    const right = makeTextNode({ id: "node-3" as NodeId, content: "Right", x: 92.5, y: 0, height: 100 }); // canvas x=370
    const dragged = makeTextNode({ content: "Dragged", x: 5, y: 10 });
    render(<MultiNodeHarness initial={[dragged, left, right]} />);
    mockRects(getCanvasDiv());

    const nodeDiv = getNodeDiv("Dragged");
    dragNode(nodeDiv, { x: 5, y: 10 }, { x: 45, y: 10 }); // raw box x=180, center=200 (canvas center)

    expect(document.querySelectorAll('[data-guide-kind="center"]').length).toBe(1);
    expect(document.querySelectorAll('[data-guide-kind="spacing"]').length).toBe(0);
    expect(parseFloat(nodeDiv.style.left)).toBeCloseTo(45, 5); // 180/400*100, already centered
  });
});

describe("text node smart-guide snap — sibling nodes (Phase 3)", () => {
  it("snaps a dragged node to a sibling node's edge and shows a guide", () => {
    const dragged = makeTextNode({ content: "Dragged", x: 10, y: 10 });
    // Sibling has no stored width/height -> its SnapBox is a zero-size point
    // at canvas-space (240, 60) (60%/20% of the 400x300 mocked canvas).
    const sibling = makeTextNode({ id: "node-2" as NodeId, content: "Sibling", x: 60, y: 20 });
    render(<MultiNodeHarness initial={[dragged, sibling]} />);
    mockRects(getCanvasDiv());

    const nodeDiv = getNodeDiv("Dragged");
    // Target raw box: own live box (40x20) lands at (236, 63) — 4px off the
    // sibling's left edge (240) and 3px off its top edge (60), both within
    // the 8px threshold, so both axes snap to the sibling's edges.
    dragNode(nodeDiv, { x: 10, y: 10 }, { x: 59, y: 21 });

    expect(document.querySelectorAll("[data-guide-line]").length).toBe(2);
    expect(parseFloat(nodeDiv.style.left)).toBeCloseTo(60, 5); // 240/400*100
    expect(parseFloat(nodeDiv.style.top)).toBeCloseTo(20, 5); // 60/300*100

    fireEvent.pointerUp(nodeDiv, { pointerId: 1 });
    expect(document.querySelectorAll("[data-guide-line]").length).toBe(0);
    // Snapped position persists after release, unaffected by the guide clear.
    expect(parseFloat(nodeDiv.style.left)).toBeCloseTo(60, 5);
    expect(parseFloat(nodeDiv.style.top)).toBeCloseTo(20, 5);
  });

  it("dragging away from every sibling produces no snap and no guide line", () => {
    const dragged = makeTextNode({ content: "Dragged", x: 10, y: 10 });
    const sibling = makeTextNode({ id: "node-2" as NodeId, content: "Sibling", x: 60, y: 20 });
    render(<MultiNodeHarness initial={[dragged, sibling]} />);
    mockRects(getCanvasDiv());

    const nodeDiv = getNodeDiv("Dragged");
    // Far from the sibling's box (240, 60) and from any container edge/center.
    dragNode(nodeDiv, { x: 10, y: 10 }, { x: 25, y: 25 });

    expect(document.querySelectorAll("[data-guide-line]").length).toBe(0);
    expect(parseFloat(nodeDiv.style.left)).toBeCloseTo(25, 5);
    expect(parseFloat(nodeDiv.style.top)).toBeCloseTo(25, 5);
  });

  it("excludes the dragged node from its own sibling reference set (no spurious self-snap)", () => {
    // Only one node on the canvas — any snap observed here could only come
    // from the node incorrectly referencing its own (just-committed) box.
    const solo = makeTextNode({ content: "Solo", x: 10, y: 10 });
    render(<MultiNodeHarness initial={[solo]} />);
    mockRects(getCanvasDiv());

    const nodeDiv = getNodeDiv("Solo");
    // First move commits the node at (30, 30); far from any container
    // reference, so it moves freely with no snap.
    dragNode(nodeDiv, { x: 10, y: 10 }, { x: 30, y: 30 });
    expect(document.querySelectorAll("[data-guide-line]").length).toBe(0);
    expect(parseFloat(nodeDiv.style.left)).toBeCloseTo(30, 5);
    expect(parseFloat(nodeDiv.style.top)).toBeCloseTo(30, 5);

    // Second move (same drag, no pointer-up in between) targets a box just
    // within the 8px threshold of the node's OWN just-committed canvas-space
    // position (120, 90). If self-exclusion were broken, the dragged box
    // would spuriously "snap" back toward its own prior box instead of
    // following the pointer freely to (32, 31).
    fireEvent.pointerMove(nodeDiv, {
      clientX: (32 / 100) * CANVAS_WIDTH,
      clientY: (31 / 100) * CANVAS_HEIGHT,
      buttons: 1,
    });

    expect(document.querySelectorAll("[data-guide-line]").length).toBe(0);
    expect(parseFloat(nodeDiv.style.left)).toBeCloseTo(32, 5);
    expect(parseFloat(nodeDiv.style.top)).toBeCloseTo(31, 5);
  });
});

describe("text node smart-guide snap — equal spacing with auto-sized siblings (bugfix regression)", () => {
  // Regression test for: "no purple dashed spacing guide ever appears with
  // default text nodes." Root cause: siblingSnapBox used to fall back to a
  // ZERO-size box for any TextNode sibling without a stored width/height
  // (the app's default), so resolveEqualSpacingSnap's crossAxisOverlaps
  // check (which needs a genuine cross-axis RANGE, not a point) almost never
  // passed. The fix live-measures an auto-sized sibling's own rendered DOM
  // box via nodeElementsRef/registerNodeElement (LiveMeasuredMultiNodeHarness
  // above), the same mechanism the DRAGGED node already used for itself
  // (Phase 2, text-node-layer.tsx handlePointerMove — untouched by this fix).
  //
  // ALL THREE nodes here (Left, Right, Dragged) are fully auto-sized: no
  // `width`, no `height` on any of them. mockRects gives every non-canvas
  // element a fixed live-measured box of LIVE_NODE_WIDTH x LIVE_NODE_HEIGHT
  // (40x20), so:
  //  - Left:  canvas-space box x=[40,80],  y=[40,60] (10%/13.3333% of 400x300)
  //  - Right: canvas-space box x=[280,320], y=[40,60] (70%/13.3333%)
  //  - Dragged (before this move): y=[30,50] (10%) — offset 10px from the
  //    siblings' y-range, which is enough to keep every edge/center pairing
  //    >8px apart (no incidental Y-axis edge/center snap) while still
  //    satisfying the cross-axis overlap the spacing check requires.
  // Equalizing gap on X: beforeEnd = 80, afterStart = 280, dragged width 40
  // (its own live box) -> gap = (280 - 80 - 40) / 2 = 80 -> target x = 160
  // (40% of 400). The drag lands 4px off that target (156), within the 8px
  // threshold.
  it("dragging a node between two auto-sized siblings (no stored width/height) triggers the spacing guide", () => {
    const left = makeTextNode({ id: "node-2" as NodeId, content: "Left", x: 10, y: 40 / 3 });
    const right = makeTextNode({ id: "node-3" as NodeId, content: "Right", x: 70, y: 40 / 3 });
    const dragged = makeTextNode({ content: "Dragged", x: 5, y: 10 });
    render(<LiveMeasuredMultiNodeHarness initial={[dragged, left, right]} />);
    mockRects(getCanvasDiv());

    const nodeDiv = getNodeDiv("Dragged");
    dragNode(nodeDiv, { x: 5, y: 10 }, { x: 39, y: 10 });

    expect(document.querySelectorAll("[data-guide-line]").length).toBe(1);
    expect(document.querySelectorAll('[data-guide-kind="spacing"]').length).toBe(1);
    expect(parseFloat(nodeDiv.style.left)).toBeCloseTo(40, 5); // 160/400*100
    expect(parseFloat(nodeDiv.style.top)).toBeCloseTo(10, 5); // unaffected

    fireEvent.pointerUp(nodeDiv, { pointerId: 1 });
    expect(document.querySelectorAll("[data-guide-line]").length).toBe(0);
    expect(parseFloat(nodeDiv.style.left)).toBeCloseTo(40, 5);
  });
});
