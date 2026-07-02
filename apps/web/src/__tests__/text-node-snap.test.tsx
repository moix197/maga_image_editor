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
import { useState } from "react";
import { TextOverlayCanvas } from "@/components/text-overlay-canvas";
import { computeContainerSnapTargets, resolveSnap } from "@maga/editor";
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
