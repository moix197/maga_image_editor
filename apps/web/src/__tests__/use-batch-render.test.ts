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

import { useBatchRender } from "@/hooks/use-batch-render";
import type { EditorState } from "@maga/editor";
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
      useBatchRender(canvasEl, overlays, template, slot as VariableSlot)
    );

    const mockAddOutput = vi.fn();
    const mockClearOutputs = vi.fn();

    await act(async () => {
      await result.current.run(mockAddOutput, mockClearOutputs);
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
      useBatchRender(canvasEl, overlays, template, slot as VariableSlot)
    );

    const mockAddOutput = vi.fn();

    await act(async () => {
      await result.current.run(mockAddOutput, vi.fn());
    });

    // After run completes, progress.current should equal total
    expect(result.current.progress.current).toBe(3);
    expect(result.current.progress.total).toBe(3);
  });

  it("cancel flag stops loop after current item completes", async () => {
    const overlays = [makeOverlay("1"), makeOverlay("2"), makeOverlay("3")];
    const { result } = renderHook(() =>
      useBatchRender(canvasEl, overlays, template, slot as VariableSlot)
    );

    const mockAddOutput = vi.fn();

    // On first compositeFromElement call, trigger cancel
    mockCompositeFromElement.mockImplementationOnce(async () => {
      result.current.cancel();
      return OUTPUT;
    });

    await act(async () => {
      await result.current.run(mockAddOutput, vi.fn());
    });

    // Item 0 completes (cancel fires after its composite resolves),
    // then the cancel check at the top of the next iteration stops the loop.
    expect(mockAddOutput).toHaveBeenCalledTimes(1);
    expect(mockAddOutput.mock.calls[0]![0].overlayAssetId).toBe("1");
  });

  it("compositeFromElement called serially, never concurrent", async () => {
    const overlays = [makeOverlay("p"), makeOverlay("q"), makeOverlay("r")];
    const { result } = renderHook(() =>
      useBatchRender(canvasEl, overlays, template, slot as VariableSlot)
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
      await result.current.run(vi.fn(), vi.fn());
    });

    expect(mockCompositeFromElement).toHaveBeenCalledTimes(3);
    expect(maxConcurrent).toBe(1);
  });

  it("zero overlays → no outputs, compositeFromElement not called", async () => {
    const { result } = renderHook(() =>
      useBatchRender(canvasEl, [], template, slot as VariableSlot)
    );

    const mockAddOutput = vi.fn();

    await act(async () => {
      await result.current.run(mockAddOutput, vi.fn());
    });

    expect(mockAddOutput).not.toHaveBeenCalled();
    expect(mockCompositeFromElement).not.toHaveBeenCalled();
  });

  it("event-loop yield (setTimeout) called once per iteration", async () => {
    const overlays = [makeOverlay("u"), makeOverlay("v"), makeOverlay("w")];
    const { result } = renderHook(() =>
      useBatchRender(canvasEl, overlays, template, slot as VariableSlot)
    );

    const setTimeoutSpy = vi.spyOn(globalThis, "setTimeout");

    await act(async () => {
      await result.current.run(vi.fn(), vi.fn());
    });

    // One setTimeout per non-cancelled iteration (3 overlays → 3 yields)
    const yieldCalls = setTimeoutSpy.mock.calls.filter(
      ([, delay]) => delay === 0,
    );
    expect(yieldCalls.length).toBe(3);

    setTimeoutSpy.mockRestore();
  });
});
