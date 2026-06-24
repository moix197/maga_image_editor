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
  isTextNode: vi.fn((n: unknown) => "content" in (n as object)),
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

  it("template text node values are UNCHANGED after a full batch run (immutability guard)", async () => {
    // Template carries one unlocked text node. The hook must mutate LIVE state
    // via updateTextNode (not the template arg) and restore it after each
    // capture, so the shared template object is never permanently changed.
    const TEXT_ID = "text-1";
    const textTemplate: EditorState = {
      nodes: [
        { id: "node-1" as NodeId, src: "data:orig", x: 0, y: 0, width: 200, height: 150, opacity: 1, zIndex: 0, overlayType: "image" },
        { id: TEXT_ID as NodeId, content: "TEMPLATE", x: 0, y: 0, rotation: 0, zIndex: 1, fontSize: 12, color: "#000", opacity: 1, fontFamily: "Arial", fontWeight: "normal", fontStyle: "normal", shadow: null, textBackground: null } as unknown as EditorState["nodes"][0],
      ],
    };
    const overlays = [makeOverlay("a"), makeOverlay("b")];
    const itemNodeOverrides = { a: { [TEXT_ID]: { content: "A-text" } }, b: { [TEXT_ID]: { content: "B-text" } } };
    const updateTextNode = vi.fn();

    const { result } = renderHook(() =>
      useBatchRender(overlays, textTemplate, slot as VariableSlot, itemNodeOverrides, updateTextNode)
    );

    await act(async () => {
      await result.current.run(vi.fn(), vi.fn(), canvasEl, vi.fn<() => NodeId | null>().mockReturnValue(null), vi.fn());
    });

    // The shared template object's text node value is untouched.
    const textNode = textTemplate.nodes.find((n) => n.id === TEXT_ID) as unknown as { content: string };
    expect(textNode.content).toBe("TEMPLATE");
  });

  it("restores template text values even when compositeFromElement THROWS mid-capture", async () => {
    // If capture throws, the finally must still restore the live editor's text
    // node back to its template value — the shared template must never be left
    // holding the per-item override.
    const TEXT_ID = "text-1";
    const textTemplate: EditorState = {
      nodes: [
        { id: "node-1" as NodeId, src: "data:orig", x: 0, y: 0, width: 200, height: 150, opacity: 1, zIndex: 0, overlayType: "image" },
        { id: TEXT_ID as NodeId, content: "TEMPLATE", x: 0, y: 0, rotation: 0, zIndex: 1, fontSize: 12, color: "#000", opacity: 1, fontFamily: "Arial", fontWeight: "normal", fontStyle: "normal", shadow: null, textBackground: null } as unknown as EditorState["nodes"][0],
      ],
    };
    const overlays = [makeOverlay("a")];
    const itemNodeOverrides = { a: { [TEXT_ID]: { content: "A-text" } } };

    // Simulate the live editor state mutated by updateTextNode so we can assert
    // its final value after the (throwing) run.
    let liveContent = "TEMPLATE";
    const updateTextNode = vi.fn<(id: NodeId, patch: { content?: string }) => void>(
      (_id, patch) => { if (patch.content !== undefined) liveContent = patch.content; },
    );

    mockCompositeFromElement.mockRejectedValueOnce(new Error("composite boom"));

    const { result } = renderHook(() =>
      useBatchRender(overlays, textTemplate, slot as VariableSlot, itemNodeOverrides, updateTextNode)
    );

    await act(async () => {
      await result.current.run(vi.fn(), vi.fn(), canvasEl, vi.fn<() => NodeId | null>().mockReturnValue(null), vi.fn());
    });

    // Override was applied, then restored despite the throw.
    const contents = updateTextNode.mock.calls.map((c) => (c[1] as { content: string }).content);
    expect(contents).toEqual(["A-text", "TEMPLATE"]);
    // Live editor state ends on the template value, not the per-item override.
    expect(liveContent).toBe("TEMPLATE");
    // The shared template object itself is untouched.
    const textNode = textTemplate.nodes.find((n) => n.id === TEXT_ID) as unknown as { content: string };
    expect(textNode.content).toBe("TEMPLATE");
    // The error is surfaced.
    expect(result.current.error).toBe("composite boom");
  });

  it("each captured item receives its own per-item override, then is restored", async () => {
    const TEXT_ID = "text-1";
    const textTemplate: EditorState = {
      nodes: [
        { id: "node-1" as NodeId, src: "data:orig", x: 0, y: 0, width: 200, height: 150, opacity: 1, zIndex: 0, overlayType: "image" },
        { id: TEXT_ID as NodeId, content: "TEMPLATE", x: 0, y: 0, rotation: 0, zIndex: 1, fontSize: 12, color: "#000", opacity: 1, fontFamily: "Arial", fontWeight: "normal", fontStyle: "normal", shadow: null, textBackground: null } as unknown as EditorState["nodes"][0],
      ],
    };
    const overlays = [makeOverlay("a"), makeOverlay("b")];
    const itemNodeOverrides = { a: { [TEXT_ID]: { content: "A-text" } }, b: { [TEXT_ID]: { content: "B-text" } } };
    const updateTextNode = vi.fn<(id: NodeId, patch: { content?: string }) => void>();

    const { result } = renderHook(() =>
      useBatchRender(overlays, textTemplate, slot as VariableSlot, itemNodeOverrides, updateTextNode)
    );

    await act(async () => {
      await result.current.run(vi.fn(), vi.fn(), canvasEl, vi.fn<() => NodeId | null>().mockReturnValue(null), vi.fn());
    });

    // Per item: apply override then restore template value → 4 calls total.
    const contents = updateTextNode.mock.calls.map((c) => (c[1] as { content: string }).content);
    expect(contents).toEqual(["A-text", "TEMPLATE", "B-text", "TEMPLATE"]);
  });

  it("every text node is patched per-item — a previously-locked node now appears in output", async () => {
    // Pre-v4 a "locked" node was skipped (updateTextNode never called). The lock
    // model is gone: ALL text nodes are per-item, so each one is patched +
    // restored once per overlay.
    const TEXT_ID = "text-1";
    const textTemplate: EditorState = {
      nodes: [
        { id: "node-1" as NodeId, src: "data:orig", x: 0, y: 0, width: 200, height: 150, opacity: 1, zIndex: 0, overlayType: "image" },
        { id: TEXT_ID as NodeId, content: "TEMPLATE", x: 0, y: 0, rotation: 0, zIndex: 1, fontSize: 12, color: "#000", opacity: 1, fontFamily: "Arial", fontWeight: "normal", fontStyle: "normal", shadow: null, textBackground: null } as unknown as EditorState["nodes"][0],
      ],
    };
    const overlays = [makeOverlay("a"), makeOverlay("b")];
    const itemNodeOverrides = { a: { [TEXT_ID]: { content: "A-text" } } };
    const updateTextNode = vi.fn();

    const { result } = renderHook(() =>
      useBatchRender(overlays, textTemplate, slot as VariableSlot, itemNodeOverrides, updateTextNode)
    );

    await act(async () => {
      await result.current.run(vi.fn(), vi.fn(), canvasEl, vi.fn<() => NodeId | null>().mockReturnValue(null), vi.fn());
    });

    // 2 overlays × (apply + restore) = 4 calls; the node is no longer skipped.
    const contents = updateTextNode.mock.calls.map((c) => (c[1] as { content: string }).content);
    expect(contents).toEqual(["A-text", "TEMPLATE", "TEMPLATE", "TEMPLATE"]);
  });

  it("batch run produces non-empty outputs — addOutput called at least once per overlay", async () => {
    // Phase 1: Generate All fills outputs[] via addOutput; it does NOT touch
    // compositeDataUrl. The Results section big preview is driven by
    // outputs[0].outputBlobKey (not compositeDataUrl) after a batch run.
    const overlays = [makeOverlay("a"), makeOverlay("b")];
    const { result } = renderHook(() =>
      useBatchRender(overlays, template, slot as VariableSlot)
    );

    const collectedOutputs: { overlayAssetId: string; outputBlobKey: string }[] = [];
    const mockAddOutput = vi.fn((o: { overlayAssetId: string; outputBlobKey: string }) => {
      collectedOutputs.push(o);
    });

    await act(async () => {
      await result.current.run(
        mockAddOutput,
        vi.fn(),
        canvasEl,
        vi.fn<() => NodeId | null>().mockReturnValue(null),
        vi.fn(),
      );
    });

    // outputs is non-empty after a batch run
    expect(collectedOutputs.length).toBeGreaterThan(0);
    // one output per overlay
    expect(collectedOutputs).toHaveLength(overlays.length);
    // compositeDataUrl is NOT asserted here — Generate All never sets it
  });

  // ── Phase 3a: per-item STYLE overrides ─────────────────────────────────────

  /** A template with one image slot + one text node (style fields included). */
  function styleTemplate(textId: string): EditorState {
    return {
      nodes: [
        { id: "node-1" as NodeId, src: "data:orig", x: 0, y: 0, width: 200, height: 150, opacity: 1, zIndex: 0, overlayType: "image" },
        { id: textId as NodeId, content: "TEMPLATE", x: 0, y: 0, rotation: 0, zIndex: 1, fontSize: 12, color: "#000000", opacity: 1, fontFamily: "Arial", fontWeight: "normal", fontStyle: "normal", shadow: null, textBackground: null } as unknown as EditorState["nodes"][0],
      ],
    };
  }

  it("applies a per-item style override for unlocked layers in a single merged call", async () => {
    const TEXT_ID = "text-1";
    const template = styleTemplate(TEXT_ID);
    const overlays = [makeOverlay("a")];
    const itemNodeOverrides = { a: { [TEXT_ID]: { content: "A-text", fontSize: 28 } } };
    const updateTextNode = vi.fn();

    const { result } = renderHook(() =>
      useBatchRender(overlays, template, slot as VariableSlot, itemNodeOverrides, updateTextNode),
    );

    await act(async () => {
      await result.current.run(vi.fn(), vi.fn(), canvasEl, vi.fn<() => NodeId | null>().mockReturnValue(null), vi.fn());
    });

    // First call = apply: a single merged patch carrying BOTH content and style.
    const applyPatch = updateTextNode.mock.calls[0]![1] as { content: string; fontSize?: number };
    expect(applyPatch.content).toBe("A-text");
    expect(applyPatch.fontSize).toBe(28);
  });

  it("every layer receives its per-item style — a previously-locked layer is now patched", async () => {
    const TEXT_ID = "text-1";
    const template = styleTemplate(TEXT_ID);
    const overlays = [makeOverlay("a")];
    const itemNodeOverrides = { a: { [TEXT_ID]: { fontSize: 28 } } };
    const updateTextNode = vi.fn();

    const { result } = renderHook(() =>
      useBatchRender(overlays, template, slot as VariableSlot, itemNodeOverrides, updateTextNode),
    );

    await act(async () => {
      await result.current.run(vi.fn(), vi.fn(), canvasEl, vi.fn<() => NodeId | null>().mockReturnValue(null), vi.fn());
    });

    // The layer is no longer skipped: the apply call carries its per-item style.
    const applyPatch = updateTextNode.mock.calls[0]![1] as { fontSize?: number };
    expect(applyPatch.fontSize).toBe(28);
  });

  it("restore patch carries the template STYLE fields, not only content", async () => {
    const TEXT_ID = "text-1";
    const template = styleTemplate(TEXT_ID);
    const overlays = [makeOverlay("a")];
    const itemNodeOverrides = { a: { [TEXT_ID]: { fontSize: 28, color: "#ff0000" } } };
    const updateTextNode = vi.fn();

    const { result } = renderHook(() =>
      useBatchRender(overlays, template, slot as VariableSlot, itemNodeOverrides, updateTextNode),
    );

    await act(async () => {
      await result.current.run(vi.fn(), vi.fn(), canvasEl, vi.fn<() => NodeId | null>().mockReturnValue(null), vi.fn());
    });

    // Restore = the last call. It must reset BOTH content AND the full style
    // snapshot back to the template values (partial restore = regression).
    const restorePatch = updateTextNode.mock.calls.at(-1)![1] as {
      content: string;
      fontSize: number;
      color: string;
    };
    expect(restorePatch.content).toBe("TEMPLATE");
    expect(restorePatch.fontSize).toBe(12);
    expect(restorePatch.color).toBe("#000000");
  });

  it("template STYLE fields are unchanged after a full batch run (immutability guard)", async () => {
    const TEXT_ID = "text-1";
    const template = styleTemplate(TEXT_ID);
    const overlays = [makeOverlay("a"), makeOverlay("b")];
    const itemNodeOverrides = { a: { [TEXT_ID]: { fontSize: 28 } }, b: { [TEXT_ID]: { fontSize: 40 } } };

    // Simulate live editor mutation so we can assert the template arg is never
    // permanently changed.
    const updateTextNode = vi.fn();

    const { result } = renderHook(() =>
      useBatchRender(overlays, template, slot as VariableSlot, itemNodeOverrides, updateTextNode),
    );

    await act(async () => {
      await result.current.run(vi.fn(), vi.fn(), canvasEl, vi.fn<() => NodeId | null>().mockReturnValue(null), vi.fn());
    });

    const textNode = template.nodes.find((n) => n.id === TEXT_ID) as unknown as { fontSize: number };
    expect(textNode.fontSize).toBe(12);
  });

  it("THROW-RESTORE: finally restores BOTH content AND style when capture throws", async () => {
    const TEXT_ID = "text-1";
    const template = styleTemplate(TEXT_ID);
    const overlays = [makeOverlay("a")];
    const itemNodeOverrides = { a: { [TEXT_ID]: { fontSize: 28, color: "#ff0000" } } };

    // Track the live style as updateTextNode mutates it.
    let liveFontSize = 12;
    let liveColor = "#000000";
    const updateTextNode = vi.fn<(id: NodeId, patch: { fontSize?: number; color?: string }) => void>(
      (_id, patch) => {
        if (patch.fontSize !== undefined) liveFontSize = patch.fontSize;
        if (patch.color !== undefined) liveColor = patch.color;
      },
    );

    mockCompositeFromElement.mockRejectedValueOnce(new Error("composite boom"));

    const { result } = renderHook(() =>
      useBatchRender(overlays, template, slot as VariableSlot, itemNodeOverrides, updateTextNode),
    );

    await act(async () => {
      await result.current.run(vi.fn(), vi.fn(), canvasEl, vi.fn<() => NodeId | null>().mockReturnValue(null), vi.fn());
    });

    // Despite the throw, the live style ends on the template values.
    expect(liveFontSize).toBe(12);
    expect(liveColor).toBe("#000000");
    // The restore call (last) includes the style fields, not just content.
    const restorePatch = updateTextNode.mock.calls.at(-1)![1] as { fontSize: number; color: string };
    expect(restorePatch.fontSize).toBe(12);
    expect(restorePatch.color).toBe("#000000");
    expect(result.current.error).toBe("composite boom");
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

  // ── Phase 4: per-variant text-node hiding in batch render ────────────────────

  it("a hidden node for overlay X gets opacity 0 applied (not its per-item value)", async () => {
    const TEXT_ID = "text-1";
    const textTemplate: EditorState = {
      nodes: [
        { id: "node-1" as NodeId, src: "data:orig", x: 0, y: 0, width: 200, height: 150, opacity: 1, zIndex: 0, overlayType: "image" },
        { id: TEXT_ID as NodeId, content: "TEMPLATE", x: 0, y: 0, rotation: 0, zIndex: 1, fontSize: 12, color: "#000", opacity: 1, fontFamily: "Arial", fontWeight: "normal", fontStyle: "normal", shadow: null, textBackground: null } as unknown as EditorState["nodes"][0],
      ],
    };
    const overlays = [makeOverlay("a")];
    const itemNodeOverrides = { a: { [TEXT_ID]: { content: "A-text", hidden: true } } };
    const updateTextNode = vi.fn();

    const { result } = renderHook(() =>
      useBatchRender(overlays, textTemplate, slot as VariableSlot, itemNodeOverrides, updateTextNode),
    );

    await act(async () => {
      await result.current.run(vi.fn(), vi.fn(), canvasEl, vi.fn<() => NodeId | null>().mockReturnValue(null), vi.fn());
    });

    // The apply call should use opacity 0, NOT the per-item "A-text" value.
    const applyCalls = updateTextNode.mock.calls;
    const applyPatch = applyCalls[0]![1] as { opacity?: number; content?: string };
    expect(applyPatch.opacity).toBe(0);
    // content should NOT be "A-text" (the node is hidden, not patched with its value)
    expect(applyPatch.content).toBeUndefined();
  });

  it("a hidden node for overlay X is present (and NOT hidden) in overlay Y's render", async () => {
    const TEXT_ID = "text-1";
    const textTemplate: EditorState = {
      nodes: [
        { id: "node-1" as NodeId, src: "data:orig", x: 0, y: 0, width: 200, height: 150, opacity: 1, zIndex: 0, overlayType: "image" },
        { id: TEXT_ID as NodeId, content: "TEMPLATE", x: 0, y: 0, rotation: 0, zIndex: 1, fontSize: 12, color: "#000", opacity: 1, fontFamily: "Arial", fontWeight: "normal", fontStyle: "normal", shadow: null, textBackground: null } as unknown as EditorState["nodes"][0],
      ],
    };
    const overlays = [makeOverlay("a"), makeOverlay("b")];
    // node hidden only for overlay "a", NOT for overlay "b"
    const itemNodeOverrides = {
      a: { [TEXT_ID]: { content: "A-text", hidden: true } },
      b: { [TEXT_ID]: { content: "B-text" } },
    };
    const updateTextNode = vi.fn();

    const { result } = renderHook(() =>
      useBatchRender(overlays, textTemplate, slot as VariableSlot, itemNodeOverrides, updateTextNode),
    );

    await act(async () => {
      await result.current.run(vi.fn(), vi.fn(), canvasEl, vi.fn<() => NodeId | null>().mockReturnValue(null), vi.fn());
    });

    // Calls: [overlay-a apply (opacity 0), overlay-a restore, overlay-b apply (B-text), overlay-b restore]
    const allPatches = updateTextNode.mock.calls.map((c) => c[1] as Record<string, unknown>);
    // overlay-a apply: opacity 0, no content
    expect(allPatches[0]!.opacity).toBe(0);
    expect(allPatches[0]!.content).toBeUndefined();
    // overlay-b apply: "B-text" (not hidden)
    expect(allPatches[2]!.content).toBe("B-text");
    expect(allPatches[2]!.opacity).toBeUndefined();
  });

  it("a hidden node is still restored after capture (finally block integrity)", async () => {
    const TEXT_ID = "text-1";
    const textTemplate: EditorState = {
      nodes: [
        { id: "node-1" as NodeId, src: "data:orig", x: 0, y: 0, width: 200, height: 150, opacity: 1, zIndex: 0, overlayType: "image" },
        { id: TEXT_ID as NodeId, content: "TEMPLATE", x: 0, y: 0, rotation: 0, zIndex: 1, fontSize: 12, color: "#000", opacity: 1, fontFamily: "Arial", fontWeight: "normal", fontStyle: "normal", shadow: null, textBackground: null } as unknown as EditorState["nodes"][0],
      ],
    };
    const overlays = [makeOverlay("a")];
    const itemNodeOverrides = { a: { [TEXT_ID]: { hidden: true } } };
    const updateTextNode = vi.fn();

    const { result } = renderHook(() =>
      useBatchRender(overlays, textTemplate, slot as VariableSlot, itemNodeOverrides, updateTextNode),
    );

    await act(async () => {
      await result.current.run(vi.fn(), vi.fn(), canvasEl, vi.fn<() => NodeId | null>().mockReturnValue(null), vi.fn());
    });

    // Last call is restore — must include content: "TEMPLATE" and opacity: 1
    const restorePatch = updateTextNode.mock.calls.at(-1)![1] as { content: string; opacity: number };
    expect(restorePatch.content).toBe("TEMPLATE");
    expect(restorePatch.opacity).toBe(1);
  });

  // ── Phase 2: per-variant text POSITION (x/y) overrides ───────────────────────

  it("applies a per-item x/y override in the merged apply call", async () => {
    const TEXT_ID = "text-1";
    const template = styleTemplate(TEXT_ID);
    const overlays = [makeOverlay("a")];
    const itemNodeOverrides = { a: { [TEXT_ID]: { content: "A-text", x: 120, y: 240 } } };
    const updateTextNode = vi.fn();

    const { result } = renderHook(() =>
      useBatchRender(overlays, template, slot as VariableSlot, itemNodeOverrides, updateTextNode),
    );

    await act(async () => {
      await result.current.run(vi.fn(), vi.fn(), canvasEl, vi.fn<() => NodeId | null>().mockReturnValue(null), vi.fn());
    });

    // First call = apply: a single merged patch carrying content AND geometry.
    const applyPatch = updateTextNode.mock.calls[0]![1] as { content: string; x?: number; y?: number };
    expect(applyPatch.content).toBe("A-text");
    expect(applyPatch.x).toBe(120);
    expect(applyPatch.y).toBe(240);
  });

  it("restore patch resets x/y back to the template position", async () => {
    const TEXT_ID = "text-1";
    const template = styleTemplate(TEXT_ID); // template node is at x:0, y:0
    const overlays = [makeOverlay("a")];
    const itemNodeOverrides = { a: { [TEXT_ID]: { x: 120, y: 240 } } };
    const updateTextNode = vi.fn();

    const { result } = renderHook(() =>
      useBatchRender(overlays, template, slot as VariableSlot, itemNodeOverrides, updateTextNode),
    );

    await act(async () => {
      await result.current.run(vi.fn(), vi.fn(), canvasEl, vi.fn<() => NodeId | null>().mockReturnValue(null), vi.fn());
    });

    // Restore = the last call. It must reset x/y to the template values (0,0).
    const restorePatch = updateTextNode.mock.calls.at(-1)![1] as { x: number; y: number };
    expect(restorePatch.x).toBe(0);
    expect(restorePatch.y).toBe(0);
  });

  it("template x/y is unchanged after a full batch run (immutability guard)", async () => {
    const TEXT_ID = "text-1";
    const template = styleTemplate(TEXT_ID);
    const overlays = [makeOverlay("a"), makeOverlay("b")];
    const itemNodeOverrides = { a: { [TEXT_ID]: { x: 120, y: 240 } }, b: { [TEXT_ID]: { x: 50, y: 60 } } };
    const updateTextNode = vi.fn();

    const { result } = renderHook(() =>
      useBatchRender(overlays, template, slot as VariableSlot, itemNodeOverrides, updateTextNode),
    );

    await act(async () => {
      await result.current.run(vi.fn(), vi.fn(), canvasEl, vi.fn<() => NodeId | null>().mockReturnValue(null), vi.fn());
    });

    const textNode = template.nodes.find((n) => n.id === TEXT_ID) as unknown as { x: number; y: number };
    expect(textNode.x).toBe(0);
    expect(textNode.y).toBe(0);
  });

  it("THROW-RESTORE: finally restores x/y when capture throws mid-capture", async () => {
    const TEXT_ID = "text-1";
    const template = styleTemplate(TEXT_ID);
    const overlays = [makeOverlay("a")];
    const itemNodeOverrides = { a: { [TEXT_ID]: { x: 120, y: 240 } } };

    let liveX = 0;
    let liveY = 0;
    const updateTextNode = vi.fn<(id: NodeId, patch: { x?: number; y?: number }) => void>(
      (_id, patch) => {
        if (patch.x !== undefined) liveX = patch.x;
        if (patch.y !== undefined) liveY = patch.y;
      },
    );

    mockCompositeFromElement.mockRejectedValueOnce(new Error("composite boom"));

    const { result } = renderHook(() =>
      useBatchRender(overlays, template, slot as VariableSlot, itemNodeOverrides, updateTextNode),
    );

    await act(async () => {
      await result.current.run(vi.fn(), vi.fn(), canvasEl, vi.fn<() => NodeId | null>().mockReturnValue(null), vi.fn());
    });

    // Despite the throw, the live position ends back at the template (0,0).
    expect(liveX).toBe(0);
    expect(liveY).toBe(0);
    const restorePatch = updateTextNode.mock.calls.at(-1)![1] as { x: number; y: number };
    expect(restorePatch.x).toBe(0);
    expect(restorePatch.y).toBe(0);
    expect(result.current.error).toBe("composite boom");
  });

  // ── Phase 3: per-variant text SIZE (width/height/fontSize) overrides ──────────

  it("applies a per-item width/height/fontSize size override in the merged apply call", async () => {
    const TEXT_ID = "text-1";
    const template = styleTemplate(TEXT_ID);
    const overlays = [makeOverlay("a")];
    const itemNodeOverrides = { a: { [TEXT_ID]: { width: 300, height: 120, fontSize: 28 } } };
    const updateTextNode = vi.fn();

    const { result } = renderHook(() =>
      useBatchRender(overlays, template, slot as VariableSlot, itemNodeOverrides, updateTextNode),
    );

    await act(async () => {
      await result.current.run(vi.fn(), vi.fn(), canvasEl, vi.fn<() => NodeId | null>().mockReturnValue(null), vi.fn());
    });

    // First call = apply: a single merged patch carrying the size fields.
    const applyPatch = updateTextNode.mock.calls[0]![1] as { width?: number; height?: number; fontSize?: number };
    expect(applyPatch.width).toBe(300);
    expect(applyPatch.height).toBe(120);
    expect(applyPatch.fontSize).toBe(28);
  });

  it("restore patch resets fontSize and includes width/height keys (snapshot covers size)", async () => {
    const TEXT_ID = "text-1";
    const template = styleTemplate(TEXT_ID); // template node fontSize:12, no width/height
    const overlays = [makeOverlay("a")];
    const itemNodeOverrides = { a: { [TEXT_ID]: { width: 300, height: 120, fontSize: 28 } } };
    const updateTextNode = vi.fn();

    const { result } = renderHook(() =>
      useBatchRender(overlays, template, slot as VariableSlot, itemNodeOverrides, updateTextNode),
    );

    await act(async () => {
      await result.current.run(vi.fn(), vi.fn(), canvasEl, vi.fn<() => NodeId | null>().mockReturnValue(null), vi.fn());
    });

    // Restore = last call. fontSize reverts to template (12). width/height are not
    // declared on TextNode (undefined on the template node) but the snapshot
    // includes the keys so the override can't leak — restoring undefined is a no-op.
    const restorePatch = updateTextNode.mock.calls.at(-1)![1] as {
      fontSize: number;
      width?: number;
      height?: number;
    };
    expect(restorePatch.fontSize).toBe(12);
    expect("width" in restorePatch).toBe(true);
    expect("height" in restorePatch).toBe(true);
    expect(restorePatch.width).toBeUndefined();
    expect(restorePatch.height).toBeUndefined();
  });

  it("THROW-RESTORE: finally restores fontSize when capture throws mid-capture", async () => {
    const TEXT_ID = "text-1";
    const template = styleTemplate(TEXT_ID);
    const overlays = [makeOverlay("a")];
    const itemNodeOverrides = { a: { [TEXT_ID]: { fontSize: 28 } } };

    let liveFontSize = 12;
    const updateTextNode = vi.fn<(id: NodeId, patch: { fontSize?: number }) => void>(
      (_id, patch) => {
        if (patch.fontSize !== undefined) liveFontSize = patch.fontSize;
      },
    );

    mockCompositeFromElement.mockRejectedValueOnce(new Error("composite boom"));

    const { result } = renderHook(() =>
      useBatchRender(overlays, template, slot as VariableSlot, itemNodeOverrides, updateTextNode),
    );

    await act(async () => {
      await result.current.run(vi.fn(), vi.fn(), canvasEl, vi.fn<() => NodeId | null>().mockReturnValue(null), vi.fn());
    });

    // Despite the throw, the live fontSize ends back at the template (12).
    expect(liveFontSize).toBe(12);
    const restorePatch = updateTextNode.mock.calls.at(-1)![1] as { fontSize: number };
    expect(restorePatch.fontSize).toBe(12);
    expect(result.current.error).toBe("composite boom");
  });
});
