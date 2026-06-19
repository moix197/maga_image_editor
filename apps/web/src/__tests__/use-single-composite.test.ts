import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

// vi.hoisted ensures these refs are created before vi.mock factories run.
const { mockCoverCrop, mockCompositeFromElement } = vi.hoisted(() => ({
  mockCoverCrop: vi.fn<() => Promise<string>>(),
  mockCompositeFromElement: vi.fn<() => Promise<string>>(),
}));

vi.mock("@/lib/cover-crop", () => ({
  coverCropDataUrl: mockCoverCrop,
}));

vi.mock("@/lib/export-helpers", () => ({
  compositeFromElement: mockCompositeFromElement,
  exportCanvasElement: vi.fn(),
}));

// ── subject under test ──────────────────────────────────────────────────────

import { useSingleComposite } from "@/hooks/use-single-composite";
import type { EditorState } from "@maga/editor";
import type { VariableSlot } from "@maga/projects";

// ── helpers ─────────────────────────────────────────────────────────────────

function makeSlot(overlayNodeId: string, width = 200, height = 150): VariableSlot {
  return { overlayNodeId: overlayNodeId as VariableSlot["overlayNodeId"], width, height };
}

function makeTemplate(nodeId: string): EditorState {
  return {
    nodes: [
      {
        id: nodeId as EditorState["nodes"][0]["id"],
        src: "data:original",
        x: 10,
        y: 10,
        width: 200,
        height: 150,
        opacity: 1,
        zIndex: 0,
        overlayType: "image",
      },
    ],
  };
}

const CROPPED = "data:image/png;base64,CROPPED";
const COMPOSITE = "data:image/png;base64,COMPOSITE";

// ── tests ────────────────────────────────────────────────────────────────────

describe("useSingleComposite", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCoverCrop.mockResolvedValue(CROPPED);
    mockCompositeFromElement.mockResolvedValue(COMPOSITE);
  });

  it("starts with compositeDataUrl null, isRendering false, error null", () => {
    const { result } = renderHook(() => useSingleComposite());
    expect(result.current.compositeDataUrl).toBeNull();
    expect(result.current.isRendering).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("isRendering transitions false → true → false across generate()", async () => {
    let resolveComposite!: (v: string) => void;
    mockCompositeFromElement.mockReturnValue(
      new Promise<string>((res) => { resolveComposite = res; })
    );

    const { result } = renderHook(() => useSingleComposite());
    const el = document.createElement("div");
    const slot = makeSlot("node-1");
    const template = makeTemplate("node-1");

    // Kick off generate (don't await — compositeFromElement is still pending).
    let generatePromise!: Promise<void>;
    act(() => {
      generatePromise = result.current.generate(el, template, slot, "data:src");
    });

    // After coverCrop resolves (next microtask), compositeFromElement is in-flight.
    await act(async () => { await Promise.resolve(); });
    const midFlight = result.current.isRendering;

    // Resolve and finish.
    await act(async () => { resolveComposite(COMPOSITE); await generatePromise; });
    const afterDone = result.current.isRendering;

    expect(midFlight).toBe(true);
    expect(afterDone).toBe(false);
  });

  it("variable slot src is replaced with croppedSrc before compositeFromElement is called", async () => {
    const { result } = renderHook(() => useSingleComposite());
    const el = document.createElement("div");
    const slot = makeSlot("node-abc", 300, 200);
    const template = makeTemplate("node-abc");

    await act(async () => {
      await result.current.generate(el, template, slot, "data:original");
    });

    // coverCrop called with correct slot dims
    expect(mockCoverCrop).toHaveBeenCalledWith("data:original", 300, 200);

    // compositeFromElement received the node with croppedSrc
    const firstCall = mockCompositeFromElement.mock.calls[0] as unknown as [HTMLElement, Array<{ id: string; src: string }>];
    const passedNodes = firstCall[1];
    const slotNode = passedNodes.find((n) => n.id === "node-abc");
    expect(slotNode?.src).toBe(CROPPED);
  });

  it("sets compositeDataUrl on success", async () => {
    const { result } = renderHook(() => useSingleComposite());
    const el = document.createElement("div");
    const slot = makeSlot("node-1");
    const template = makeTemplate("node-1");

    await act(async () => {
      await result.current.generate(el, template, slot, "data:src");
    });

    expect(result.current.compositeDataUrl).toBe(COMPOSITE);
    expect(result.current.error).toBeNull();
  });

  it("sets error and clears isRendering when compositeFromElement rejects", async () => {
    mockCompositeFromElement.mockRejectedValue(new Error("Canvas failure"));

    const { result } = renderHook(() => useSingleComposite());
    const el = document.createElement("div");
    const slot = makeSlot("node-1");
    const template = makeTemplate("node-1");

    await act(async () => {
      await result.current.generate(el, template, slot, "data:src");
    });

    expect(result.current.error).toBe("Canvas failure");
    expect(result.current.isRendering).toBe(false);
    expect(result.current.compositeDataUrl).toBeNull();
  });

  it("sets error when coverCropDataUrl rejects", async () => {
    mockCoverCrop.mockRejectedValue(new Error("Image load failed"));

    const { result } = renderHook(() => useSingleComposite());
    const el = document.createElement("div");
    const slot = makeSlot("node-1");
    const template = makeTemplate("node-1");

    await act(async () => {
      await result.current.generate(el, template, slot, "data:src");
    });

    expect(result.current.error).toBe("Image load failed");
    expect(result.current.isRendering).toBe(false);
  });
});
