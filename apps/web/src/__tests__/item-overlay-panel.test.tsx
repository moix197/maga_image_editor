import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ItemOverlayPanel } from "@/components/batch/BatchRightPanel";
import type { OverlayNode, NodeId } from "@maga/editor";
import type { useItemText } from "@/hooks/use-item-text";

const OVERLAY_ASSET_ID = "overlay-a";
const NODE_ID = "img-node-1";

function makeOverlayNode(id: string): OverlayNode {
  return {
    id: id as NodeId,
    src: "data:image/png;base64,abc",
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    opacity: 1,
    zIndex: 0,
    overlayType: "image",
  } as OverlayNode;
}

function makeItemText(
  hidden: boolean,
  setNodeHidden: ReturnType<typeof vi.fn>,
): ReturnType<typeof useItemText> {
  return {
    getTextValue: vi.fn().mockReturnValue(""),
    getTextStyle: vi.fn().mockReturnValue({}),
    setTextValue: vi.fn(),
    setTextStyle: vi.fn(),
    isNodeHidden: vi.fn().mockReturnValue(hidden),
    setNodeHidden,
    setNodeOverride: vi.fn(),
  } as unknown as ReturnType<typeof useItemText>;
}

describe("ItemOverlayPanel", () => {
  it("renders an eye toggle per overlay node (visible state)", () => {
    const overlayNodes = [makeOverlayNode(NODE_ID)];
    const setNodeHidden = vi.fn();
    const itemText = makeItemText(false, setNodeHidden);

    render(
      <ItemOverlayPanel
        overlayAssetId={OVERLAY_ASSET_ID}
        overlayLabel="test.png"
        overlayNodes={overlayNodes}
        itemText={itemText}
      />,
    );

    // Eye toggle button present for a visible node
    expect(screen.getByRole("button", { name: /hide image overlay/i })).toBeDefined();
  });

  it("shows Show aria-label (EyeOff icon) when node is hidden", () => {
    const overlayNodes = [makeOverlayNode(NODE_ID)];
    const setNodeHidden = vi.fn();
    const itemText = makeItemText(true, setNodeHidden);

    render(
      <ItemOverlayPanel
        overlayAssetId={OVERLAY_ASSET_ID}
        overlayLabel="test.png"
        overlayNodes={overlayNodes}
        itemText={itemText}
      />,
    );

    expect(screen.getByRole("button", { name: /show image overlay/i })).toBeDefined();
  });

  it("clicking the eye toggle on a visible node calls setNodeHidden(overlayId, nodeId, true)", () => {
    const overlayNodes = [makeOverlayNode(NODE_ID)];
    const setNodeHidden = vi.fn();
    const itemText = makeItemText(false, setNodeHidden);

    render(
      <ItemOverlayPanel
        overlayAssetId={OVERLAY_ASSET_ID}
        overlayLabel="test.png"
        overlayNodes={overlayNodes}
        itemText={itemText}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /hide image overlay/i }));
    expect(setNodeHidden).toHaveBeenCalledWith(OVERLAY_ASSET_ID, NODE_ID as NodeId, true);
  });

  it("clicking a hidden overlay's eye calls setNodeHidden(overlayId, nodeId, false) — restore", () => {
    const overlayNodes = [makeOverlayNode(NODE_ID)];
    const setNodeHidden = vi.fn();
    const itemText = makeItemText(true, setNodeHidden);

    render(
      <ItemOverlayPanel
        overlayAssetId={OVERLAY_ASSET_ID}
        overlayLabel="test.png"
        overlayNodes={overlayNodes}
        itemText={itemText}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /show image overlay/i }));
    expect(setNodeHidden).toHaveBeenCalledWith(OVERLAY_ASSET_ID, NODE_ID as NodeId, false);
  });

  it("renders one toggle per node", () => {
    const overlayNodes = [makeOverlayNode("n1"), makeOverlayNode("n2")];
    const setNodeHidden = vi.fn();
    const itemText = makeItemText(false, setNodeHidden);

    render(
      <ItemOverlayPanel
        overlayAssetId={OVERLAY_ASSET_ID}
        overlayLabel="test.png"
        overlayNodes={overlayNodes}
        itemText={itemText}
      />,
    );

    expect(screen.getAllByRole("button", { name: /hide image overlay/i })).toHaveLength(2);
  });
});
