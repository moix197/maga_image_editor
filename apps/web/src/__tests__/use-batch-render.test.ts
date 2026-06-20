import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

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

vi.mock("@maga/editor", () => ({
  isOverlayNode: vi.fn((n: unknown) => (n as { overlayType?: string })?.overlayType === "image"),
}));

vi.mock("@/lib/capture-helpers", () => ({
  waitTwoFrames: vi.fn().mockResolvedValue(undefined),
}));

import { useBatchRender } from "@/hooks/use-batch-render";
import type { EditorState, NodeId, OverlayNode } from "@maga/editor";
import type { ProjectAsset, VariableSlot } from "@maga/projects";

type SlotLike = { overlayNodeId: VariableSlot["overlayNodeId"]; width: number; height: number };

const CROPPED = "data:cropped";
const OUTPUT = "data:output";

function makeOverlay(id: string): ProjectAsset {
  return { id, filename: id + ".png", blobKey: "data:" + id };
}

function makeTemplate(nodeId: string): EditorState {
  return {
    nodes: [
      {
        id: nodeId as EditorState["nodes"][0]["id"],
        src: "data:orig",
        x: 0,
        y: 0,
        width: 200,
        height: 150,
        opacity: 1,
        zIndex: 0,
        overlayType: "image",
      },
    ],
  };
}

function makeSlot(overlayNodeId: string): SlotLike {
  return {
    overlayNodeId: overlayNodeId as SlotLike["overlayNodeId"],
    width: 200,
    height: 150,
  };
}

describe("useBatchRender", () => {
  const canvasEl = document.createElement("div");
  const NODE_ID = "node-1";
  const template = makeTemplate(NODE_ID);
  const slot = makeSlot(NODE_ID);

  beforeEach(() => {
    vi.clearAllMocks();
    mockCoverCrop.mockResolvedValue(CROPPED);
    mockCompositeFromElement.mockResolvedValue(OUTPUT);
  });

  it("N overlays → N outputs appended in order", async () => {
    const overlays = [makeOverlay("a"), makeOverlay("b"), makeOverlay("c")];
    const { result } = renderHook(() =>
      useBatchRender(overlays, template, slot as VariableSlot)
    );

    const mockAddOutput = vi.fn();
    const mockClearOutputs = vi.fn();

    await act(async () => {
      await result.current.run(mockAddOutput, mockClearOutputs, canvasEl, vi.fn<() => NodeId | null>().mockReturnValue(null), vi.fn());
    });

    expect(mockAddOutput).toHaveBeenCalledTimes(3);
    const [call0, call1, call2] = mockAddOutput.mock.calls;
    expect(call0![0].overlayAssetId).toBe("a");
    expect(call1![0].overlayAssetId).toBe("b");
    expect(call2![0].overlayAssetId).toBe("c");
  });

  it("progress.current increments each step", async () => {
    const overlays = [makeOverlay("x"), makeOverlay("y"), makeOverlay("z")];
    const { result } = renderHook(() =>
      useBatchRender(overlays, template, slot as VariableSlot)
    );

    const mockAddOutput = vi.fn();

    await act(async () => {
      await result.current.run(mockAddOutput, vi.fn(), canvasEl, vi.fn<() => NodeId | null>().mockReturnValue(null), vi.fn());
    });

    // After run completes, progress.current should equal total
    expect(result.current.progress.current).toBe(3);
    expect(result.current.progress.total).toBe(3);
  });

  it("cancel flag stops loop after current item completes", async () => {
    const overlays = [makeOverlay("1"), makeOverlay("2"), makeOverlay("3")];
    const { result } = renderHook(() =>
      useBatchRender(overlays, template, slot as VariableSlot)
    );

    const mockAddOutput = vi.fn();

    // On first compositeFromElement call, trigger cancel
    mockCompositeFromElement.mockImplementationOnce(async () => {
      result.current.cancel();
      return OUTPUT;
    });

    await act(async () => {
      await result.current.run(mockAddOutput, vi.fn(), canvasEl, vi.fn<() => NodeId | null>().mockReturnValue(null), vi.fn());
    });

    // Item 0 completes (cancel fires after its composite resolves),
    // then the cancel check at the top of the next iteration stops the loop.
    expect(mockAddOutput).toHaveBeenCalledTimes(1);
    expect(mockAddOutput.mock.calls[0]![0].overlayAssetId).toBe("1");
  });

  it("compositeFromElement called serially, never concurrent", async () => {
    const overlays = [makeOverlay("p"), makeOverlay("q"), makeOverlay("r")];
    const { result } = renderHook(() =>
      useBatchRender(overlays, template, slot as VariableSlot)
    );

    let maxConcurrent = 0;
    let inFlight = 0;

    mockCompositeFromElement.mockImplementation(async () => {
      inFlight++;
      maxConcurrent = Math.max(maxConcurrent, inFlight);
      await Promise.resolve();
      inFlight--;
      return OUTPUT;
    });

    await act(async () => {
      await result.current.run(vi.fn(), vi.fn(), canvasEl, vi.fn<() => NodeId | null>().mockReturnValue(null), vi.fn());
    });

    expect(mockCompositeFromElement).toHaveBeenCalledTimes(3);
    expect(maxConcurrent).toBe(1);
  });

  it("zero overlays → no outputs, compositeFromElement not called", async () => {
    const { result } = renderHook(() =>
      useBatchRender([], template, slot as VariableSlot)
    );

    const mockAddOutput = vi.fn();

    await act(async () => {
      await result.current.run(mockAddOutput, vi.fn(), canvasEl, vi.fn<() => NodeId | null>().mockReturnValue(null), vi.fn());
    });

    expect(mockAddOutput).not.toHaveBeenCalled();
    expect(mockCompositeFromElement).not.toHaveBeenCalled();
  });

  it("compositeFromElement called with patched slot src; static overlay src unchanged", async () => {
    const STATIC_NODE_ID = "static-node";
    const multiTemplate: EditorState = {
      nodes: [
        { id: "node-1" as NodeId, src: "data:orig", x: 0, y: 0, width: 200, height: 150, opacity: 1, zIndex: 0, overlayType: "image" },
        { id: STATIC_NODE_ID as NodeId, src: "data:static", x: 50, y: 50, width: 100, height: 100, opacity: 1, zIndex: 1, overlayType: "image" },
      ],
    };
    const overlays = [makeOverlay("a")];
    const { result } = renderHook(() => useBatchRender(overlays, multiTemplate, slot as VariableSlot));
    await act(async () => {
      await result.current.run(vi.fn(), vi.fn(), canvasEl, vi.fn<() => NodeId | null>().mockReturnValue(null), vi.fn());
    });
    const patchedNodes = (mockCompositeFromElement.mock.calls[0] as unknown as [HTMLElement, OverlayNode[]])[1];
    const slotNode = patchedNodes.find((n) => n.id === "node-1");
    const staticNode = patchedNodes.find((n) => n.id === STATIC_NODE_ID);
    expect(slotNode?.src).toBe(CROPPED);
    expect(staticNode?.src).toBe("data:static");
  });

  it("onDeselectForCapture called before loop; onRestoreSelection called after loop", async () => {
    const overlays = [makeOverlay("a"), makeOverlay("b")];
    const { result } = renderHook(() => useBatchRender(overlays, template, slot as VariableSlot));
    const onDeselect = vi.fn<() => NodeId | null>().mockReturnValue("prev-node" as NodeId);
    const onRestore = vi.fn();
    const callOrder: string[] = [];
    onDeselect.mockImplementation(() => { callOrder.push("deselect"); return "prev-node" as NodeId; });
    mockCompositeFromElement.mockImplementation(async () => { callOrder.push("composite"); return OUTPUT; });
    onRestore.mockImplementation(() => callOrder.push("restore"));
    await act(async () => {
      await result.current.run(vi.fn(), vi.fn(), canvasEl, onDeselect, onRestore);
    });
    expect(onDeselect).toHaveBeenCalledTimes(1);
    expect(onRestore).toHaveBeenCalledTimes(1);
    expect(onRestore).toHaveBeenCalledWith("prev-node");
    // deselect happens before any composite
    expect(callOrder[0]).toBe("deselect");
    expect(callOrder[callOrder.length - 1]).toBe("restore");
  });

  it("iterates ALL overlays regardless of any external activeOverlayId — batch loop is unaffected by preview selection", async () => {
    // activeOverlayId lives in BatchWorkspace state and controls only the
    // preview canvas; useBatchRender receives the full list and must produce
    // one output per overlay without filtering or skipping.
    const allOverlays = [makeOverlay("a"), makeOverlay("b"), makeOverlay("c"), makeOverlay("d")];
    const { result } = renderHook(() =>
      useBatchRender(allOverlays, template, slot as VariableSlot)
    );
    const mockAddOutput = vi.fn();

    await act(async () => {
      await result.current.run(mockAddOutput, vi.fn(), canvasEl, vi.fn<() => NodeId | null>().mockReturnValue(null), vi.fn());
    });

    expect(mockAddOutput).toHaveBeenCalledTimes(4);
    const ids = mockAddOutput.mock.calls.map(
      (c) => (c[0] as { overlayAssetId: string }).overlayAssetId,
    );
    expect(ids).toEqual(["a", "b", "c", "d"]);
  });
});
