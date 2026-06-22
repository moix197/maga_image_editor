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
});
