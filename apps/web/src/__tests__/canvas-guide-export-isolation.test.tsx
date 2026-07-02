/**
 * Structural invariant (plan "Dependencies & Risks -> export non-contamination
 * (b)"): guide-line DOM must never exist outside an active drag, and
 * export-helpers.ts's stripGuideLines guard must remove any that are
 * (abnormally) present at capture time — belt-and-suspenders enforcement
 * independent of the "export never runs mid-drag" timing assumption.
 */
import { describe, it, expect, vi, beforeAll } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { useState } from "react";
import { TextOverlayCanvas } from "@/components/text-overlay-canvas";
import { stripGuideLines } from "@/lib/export-helpers";
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

describe("guide-line DOM non-contamination", () => {
  it("no [data-guide-line] nodes exist before a drag starts", () => {
    render(<Harness initial={makeTextNode()} />);
    expect(document.querySelectorAll("[data-guide-line]").length).toBe(0);
  });

  it("[data-guide-line] nodes appear only while a snapping drag is in-flight, and are gone after pointer-up", () => {
    render(<Harness initial={makeTextNode()} />);
    const canvasDiv = getCanvasDiv();
    mockRects(canvasDiv);
    const nodeDiv = screen.getByLabelText("Text node: Hi");

    expect(document.querySelectorAll("[data-guide-line]").length).toBe(0);

    // Drag near center (see text-node-snap.test.tsx for the geometry): both
    // axes land within the 8px threshold and snap, reporting 2 guides.
    fireEvent.pointerDown(nodeDiv, { clientX: 40, clientY: 30, buttons: 1, pointerId: 1 });
    fireEvent.pointerMove(nodeDiv, { clientX: 182, clientY: 142, buttons: 1 });
    expect(document.querySelectorAll("[data-guide-line]").length).toBe(2);

    fireEvent.pointerUp(nodeDiv, { pointerId: 1 });
    expect(document.querySelectorAll("[data-guide-line]").length).toBe(0);
  });
});

describe("stripGuideLines export guard", () => {
  it("removes [data-guide-line] elements from a subtree, leaving other elements intact", () => {
    const root = document.createElement("div");
    const guide1 = document.createElement("div");
    guide1.setAttribute("data-guide-line", "");
    const guide2 = document.createElement("div");
    guide2.setAttribute("data-guide-line", "");
    const kept = document.createElement("span");
    kept.textContent = "kept";
    root.append(guide1, kept, guide2);

    stripGuideLines(root);

    expect(root.querySelectorAll("[data-guide-line]").length).toBe(0);
    expect(root.contains(kept)).toBe(true);
    expect(root.textContent).toBe("kept");
  });

  it("is a no-op when no [data-guide-line] elements are present", () => {
    const root = document.createElement("div");
    const child = document.createElement("span");
    child.textContent = "hello";
    root.append(child);

    expect(() => stripGuideLines(root)).not.toThrow();
    expect(root.contains(child)).toBe(true);
    expect(root.querySelectorAll("[data-guide-line]").length).toBe(0);
  });
});
