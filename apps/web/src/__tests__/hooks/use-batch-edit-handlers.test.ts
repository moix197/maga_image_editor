import { describe, it, expect, vi } from "vitest";
import { makeTextEditHandlers } from "@/components/batch/make-text-edit-handlers";
import type { TextStyle } from "@maga/projects";
import type { NodeId, TextNode } from "@maga/editor";

// --- helpers ---

type MockUpdateTextNode = (id: NodeId, patch: Partial<Omit<TextNode, "id">>) => void;

function makeHandlers(textLayerLocks: Record<string, boolean> = {}) {
  const setItemTextValue = vi.fn() as unknown as (
    overlayAssetId: string,
    textNodeId: string,
    value: string,
  ) => void;
  const setItemTextStyle = vi.fn() as unknown as (
    overlayAssetId: string,
    textNodeId: string,
    style: Partial<TextStyle>,
  ) => void;
  const updateTextNode = vi.fn() as unknown as MockUpdateTextNode;

  const handlers = makeTextEditHandlers({
    textLayerLocks,
    setItemTextValue,
    setItemTextStyle,
    updateTextNode,
  });

  return { ...handlers, setItemTextValue, setItemTextStyle, updateTextNode };
}

const OVERLAY_A = "overlay-a";
const NODE_1 = "node-1";

// --- tests ---

describe("makeTextEditHandlers", () => {
  it("(1) unlocked content edit calls setItemTextValue, NOT updateTextNode", () => {
    const { routedSetItemTextValue, setItemTextValue, updateTextNode } = makeHandlers({
      [NODE_1]: false,
    });

    routedSetItemTextValue(OVERLAY_A, NODE_1, "new value");

    expect(setItemTextValue).toHaveBeenCalledOnce();
    expect(setItemTextValue).toHaveBeenCalledWith(OVERLAY_A, NODE_1, "new value");
    expect(updateTextNode).not.toHaveBeenCalled();
  });

  it("(2) unlocked style edit calls setItemTextStyle, NOT updateTextNode", () => {
    const patch: Partial<TextStyle> = { fontSize: 24, color: "#ff0000" };
    const { routedSetItemTextStyle, setItemTextStyle, updateTextNode } = makeHandlers({
      [NODE_1]: false,
    });

    routedSetItemTextStyle(OVERLAY_A, NODE_1, patch);

    expect(setItemTextStyle).toHaveBeenCalledOnce();
    expect(setItemTextStyle).toHaveBeenCalledWith(OVERLAY_A, NODE_1, patch);
    expect(updateTextNode).not.toHaveBeenCalled();
  });

  it("(3) locked content edit calls updateTextNode, NOT setItemTextValue", () => {
    const { routedSetItemTextValue, setItemTextValue, updateTextNode } = makeHandlers({
      [NODE_1]: true,
    });

    routedSetItemTextValue(OVERLAY_A, NODE_1, "shared value");

    expect(updateTextNode).toHaveBeenCalledOnce();
    expect(updateTextNode).toHaveBeenCalledWith(NODE_1, { content: "shared value" });
    expect(setItemTextValue).not.toHaveBeenCalled();
  });

  it("(4) locked style edit calls updateTextNode, NOT setItemTextStyle", () => {
    const patch: Partial<TextStyle> = { fontSize: 32 };
    const { routedSetItemTextStyle, setItemTextStyle, updateTextNode } = makeHandlers({
      [NODE_1]: true,
    });

    routedSetItemTextStyle(OVERLAY_A, NODE_1, patch);

    expect(updateTextNode).toHaveBeenCalledOnce();
    expect(updateTextNode).toHaveBeenCalledWith(NODE_1, patch);
    expect(setItemTextStyle).not.toHaveBeenCalled();
  });

  it("(5) unlocked layer with missing lock entry defaults to unlocked (newTextLayerLockDefault=false)", () => {
    // No entry in textLayerLocks for NODE_1 — should resolve to unlocked (false).
    const { routedSetItemTextValue, setItemTextValue, updateTextNode } = makeHandlers({});

    routedSetItemTextValue(OVERLAY_A, NODE_1, "per-item");

    // Unlocked → writes to per-item store, not the shared template.
    expect(setItemTextValue).toHaveBeenCalledWith(OVERLAY_A, NODE_1, "per-item");
    expect(updateTextNode).not.toHaveBeenCalled();
  });

  it("unlocked content edit uses the provided overlayAssetId (not a global active id)", () => {
    const OVERLAY_B = "overlay-b";
    const { routedSetItemTextValue, setItemTextValue } = makeHandlers({ [NODE_1]: false });

    routedSetItemTextValue(OVERLAY_B, NODE_1, "value for B");

    expect(setItemTextValue).toHaveBeenCalledWith(OVERLAY_B, NODE_1, "value for B");
  });

  it("locked content edit ignores overlayAssetId and writes to shared template", () => {
    const { routedSetItemTextValue, updateTextNode, setItemTextValue } = makeHandlers({
      [NODE_1]: true,
    });

    routedSetItemTextValue(OVERLAY_A, NODE_1, "template value");

    expect(updateTextNode).toHaveBeenCalledWith(NODE_1, { content: "template value" });
    expect(setItemTextValue).not.toHaveBeenCalled();
  });

  // Test case 5 (plan requirement): null/undefined activeOverlayId scenario.
  //
  // The factory accepts `overlayAssetId` per-call (not at construction time), so
  // there is no early-return null guard inside makeTextEditHandlers itself.
  // The null guard lives entirely in BatchWorkspace:
  //   - ItemTextPanel is only rendered when `activeOverlay && textNodes.length > 0`
  //     (BatchWorkspace.tsx line ~472), so routedSetItemTextValue / routedSetItemTextStyle
  //     are never invoked with a null overlayAssetId from that path.
  //   - BulkTextPanel iterates overlays explicitly and always passes a real id.
  //
  // If a caller somehow passes null, the factory forwards it to setItemTextValue /
  // setItemTextStyle unchanged (unlocked) or ignores it entirely (locked → updateTextNode).
  // Both outcomes are safe; this test documents the forwarding behavior.
  it("(5) null overlayAssetId is forwarded to setItemTextValue when layer is unlocked (guard is in BatchWorkspace, not this factory)", () => {
    const { routedSetItemTextValue, routedSetItemTextStyle, setItemTextValue, setItemTextStyle, updateTextNode } =
      makeHandlers({ [NODE_1]: false });

    // Cast null to satisfy the string type — simulates a caller bypassing the
    // BatchWorkspace guard. The factory has no internal null check.
    routedSetItemTextValue(null as unknown as string, NODE_1, "value");
    routedSetItemTextStyle(null as unknown as string, NODE_1, { fontSize: 12 });

    // Unlocked: both per-item setters are called (with the null id forwarded).
    // updateTextNode must NOT be called.
    expect(setItemTextValue).toHaveBeenCalledWith(null, NODE_1, "value");
    expect(setItemTextStyle).toHaveBeenCalledWith(null, NODE_1, { fontSize: 12 });
    expect(updateTextNode).not.toHaveBeenCalled();
  });
});
