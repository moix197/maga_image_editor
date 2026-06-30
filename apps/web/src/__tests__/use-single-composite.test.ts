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
  EXPORT_PIXEL_RATIO: 2,
}));

vi.mock("@/lib/capture-helpers", () => ({
  waitTwoFrames: vi.fn().mockResolvedValue(undefined),
}));

// ── subject under test ──────────────────────────────────────────────────────

import { useSingleComposite } from "@/hooks/use-single-composite";
import type { EditorState, NodeId } from "@maga/editor";
import type { ProjectAsset, VariableSlot } from "@maga/projects";

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
      generatePromise = result.current.generate(el, template, slot, "data:src", () => null as NodeId | null, () => {});
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
      await result.current.generate(el, template, slot, "data:original", () => null as NodeId | null, () => {});
    });

    // coverCrop called with correct slot dims
    expect(mockCoverCrop).toHaveBeenCalledWith("data:original", 300, 200, 2);

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
      await result.current.generate(el, template, slot, "data:src", () => null as NodeId | null, () => {});
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
      await result.current.generate(el, template, slot, "data:src", () => null as NodeId | null, () => {});
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
      await result.current.generate(el, template, slot, "data:src", () => null as NodeId | null, () => {});
    });

    expect(result.current.error).toBe("Image load failed");
    expect(result.current.isRendering).toBe(false);
  });

  it("warns and early-returns when canvasEl is null", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { result } = renderHook(() => useSingleComposite());
    const slot = makeSlot("node-1");
    const template = makeTemplate("node-1");
    const onDeselect = vi.fn();
    const onRestore = vi.fn();

    await act(async () => {
      await result.current.generate(null, template, slot, "data:src", onDeselect, onRestore);
    });

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("canvasEl is null"));
    expect(mockCompositeFromElement).not.toHaveBeenCalled();
    expect(result.current.isRendering).toBe(false);
    warnSpy.mockRestore();
  });

  it("calls onDeselectForCapture before compositeFromElement and passes its return value to onRestoreSelection", async () => {
    const callOrder: string[] = [];
    mockCompositeFromElement.mockImplementation(async () => {
      callOrder.push("composite");
      return COMPOSITE;
    });

    const { result } = renderHook(() => useSingleComposite());
    const el = document.createElement("div");
    const slot = makeSlot("node-1");
    const template = makeTemplate("node-1");
    const onDeselect = vi.fn(() => { callOrder.push("deselect"); return "node-1" as NodeId; });
    const onRestore = vi.fn(() => { callOrder.push("restore"); });

    await act(async () => {
      await result.current.generate(el, template, slot, "data:src", onDeselect, onRestore);
    });

    expect(callOrder).toEqual(["deselect", "composite", "restore"]);
    expect(onRestore).toHaveBeenCalledWith("node-1");
  });

  it("calls compositeFromElement with the passed canvasEl (not a hidden div)", async () => {
    const { result } = renderHook(() => useSingleComposite());
    const el = document.createElement("div");
    el.setAttribute("data-testid", "live-canvas");
    const slot = makeSlot("node-1");
    const template = makeTemplate("node-1");

    await act(async () => {
      await result.current.generate(el, template, slot, "data:src", () => null as NodeId | null, () => {});
    });

    expect(mockCompositeFromElement).toHaveBeenCalledWith(el, expect.any(Array));
    const passedEl = (mockCompositeFromElement.mock.calls[0] as unknown as [HTMLElement, unknown[]])[0];
    expect(passedEl).toBe(el);
  });

  it("does not mutate static overlay node srcs (only slot node src is swapped)", async () => {
    const STATIC_SRC = "data:static-overlay";
    const templateWithStatic: EditorState = {
      nodes: [
        {
          id: "slot-node" as EditorState["nodes"][0]["id"],
          src: "data:original-slot",
          x: 0, y: 0, width: 200, height: 150,
          opacity: 1, zIndex: 0, overlayType: "image",
        },
        {
          id: "static-node" as EditorState["nodes"][0]["id"],
          src: STATIC_SRC,
          x: 50, y: 50, width: 100, height: 100,
          opacity: 1, zIndex: 1, overlayType: "image",
        },
      ],
    };

    const { result } = renderHook(() => useSingleComposite());
    const el = document.createElement("div");
    const slot = makeSlot("slot-node", 200, 150);

    await act(async () => {
      await result.current.generate(el, templateWithStatic, slot, "data:overlay-src", () => null as NodeId | null, () => {});
    });

    const passedNodes = (mockCompositeFromElement.mock.calls[0] as unknown as [HTMLElement, Array<{ id: string; src: string }>])[1];
    const staticNode = passedNodes.find((n) => n.id === "static-node");
    expect(staticNode?.src).toBe(STATIC_SRC);
    const slotNode = passedNodes.find((n) => n.id === "slot-node");
    expect(slotNode?.src).toBe(CROPPED);
  });

  it("calls onRestoreSelection in finally with prevId returned by onDeselectForCapture (even on error)", async () => {
    mockCompositeFromElement.mockRejectedValue(new Error("Capture failed"));

    const { result } = renderHook(() => useSingleComposite());
    const el = document.createElement("div");
    const slot = makeSlot("node-1");
    const template = makeTemplate("node-1");
    const onRestore = vi.fn();

    await act(async () => {
      await result.current.generate(el, template, slot, "data:src", () => "node-1" as NodeId, onRestore);
    });

    expect(onRestore).toHaveBeenCalledTimes(1);
    expect(onRestore).toHaveBeenCalledWith("node-1");
    expect(result.current.error).toBe("Capture failed");
  });
});

// ── overlayAssetId override tests ────────────────────────────────────────────

function makeAsset(id: string, blobKey: string): ProjectAsset {
  return { id, filename: id + ".png", blobKey };
}

describe("useSingleComposite — overlayAssetId override", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCoverCrop.mockResolvedValue(CROPPED);
    mockCompositeFromElement.mockResolvedValue(COMPOSITE);
  });

  it("uses overlays[0].blobKey by default when overlays option is provided and overlayAssetId is omitted", async () => {
    const overlays = [makeAsset("first", "data:first-blob"), makeAsset("second", "data:second-blob")];
    const { result } = renderHook(() => useSingleComposite({ overlays }));
    const el = document.createElement("div");
    const slot = makeSlot("node-1");
    const template = makeTemplate("node-1");

    await act(async () => {
      await result.current.generate(el, template, slot, "data:fallback", () => null as NodeId | null, () => {});
    });

    // Should use first overlay's blobKey, not the fallback
    expect(mockCoverCrop).toHaveBeenCalledWith("data:first-blob", slot.width, slot.height, 2);
  });

  it("selects the correct overlay when overlayAssetId matches a non-first overlay", async () => {
    const overlays = [makeAsset("first", "data:first-blob"), makeAsset("second", "data:second-blob")];
    const { result } = renderHook(() => useSingleComposite({ overlays }));
    const el = document.createElement("div");
    const slot = makeSlot("node-1");
    const template = makeTemplate("node-1");

    await act(async () => {
      await result.current.generate(
        el, template, slot, "data:fallback",
        () => null as NodeId | null, () => {},
        "second", // explicit overlayAssetId
      );
    });

    expect(mockCoverCrop).toHaveBeenCalledWith("data:second-blob", slot.width, slot.height, 2);
  });

  it("falls back to overlaySrc when overlays option is empty", async () => {
    const { result } = renderHook(() => useSingleComposite({ overlays: [] }));
    const el = document.createElement("div");
    const slot = makeSlot("node-1");
    const template = makeTemplate("node-1");

    await act(async () => {
      await result.current.generate(
        el, template, slot, "data:explicit-src",
        () => null as NodeId | null, () => {},
        "some-id",
      );
    });

    expect(mockCoverCrop).toHaveBeenCalledWith("data:explicit-src", slot.width, slot.height, 2);
  });

  it("existing call sites (no overlays option, no overlayAssetId) still compile and use overlaySrc", async () => {
    // Simulates the original call signature — no options object at all
    const { result } = renderHook(() => useSingleComposite());
    const el = document.createElement("div");
    const slot = makeSlot("node-1");
    const template = makeTemplate("node-1");

    await act(async () => {
      await result.current.generate(el, template, slot, "data:legacy-src", () => null as NodeId | null, () => {});
    });

    expect(mockCoverCrop).toHaveBeenCalledWith("data:legacy-src", slot.width, slot.height, 2);
  });
});
