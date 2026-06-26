import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ItemOverlayPanel } from "@/components/batch/BatchRightPanel";
import { TextStylePanel } from "@/components/text-style-panel";
import type { OverlayNode, NodeId, TextNode } from "@maga/editor";
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

function makeTextNode(overrides: Partial<TextNode> = {}): TextNode {
  return {
    id: "text-node-1" as NodeId,
    content: "Hello",
    x: 50,
    y: 50,
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

describe("TextStylePanel — Width field", () => {
  it("renders a Width input with placeholder Auto when node.width is undefined", () => {
    const node = makeTextNode({ width: undefined });
    render(
      <TextStylePanel
        node={node}
        onChange={vi.fn()}
        onDelete={vi.fn()}
        onReorder={vi.fn()}
      />,
    );
    const input = screen.getByPlaceholderText("Auto") as HTMLInputElement;
    expect(input).toBeDefined();
    expect(input.value).toBe("");
  });

  it("renders a Width input showing the current width when set", () => {
    const node = makeTextNode({ width: 200 });
    render(
      <TextStylePanel
        node={node}
        onChange={vi.fn()}
        onDelete={vi.fn()}
        onReorder={vi.fn()}
      />,
    );
    const input = screen.getByPlaceholderText("Auto") as HTMLInputElement;
    expect(input.value).toBe("200");
  });

  it("onChange is called with { width: number } when user types a value", () => {
    const onChange = vi.fn();
    const node = makeTextNode({ width: undefined });
    render(
      <TextStylePanel
        node={node}
        onChange={onChange}
        onDelete={vi.fn()}
        onReorder={vi.fn()}
      />,
    );
    const input = screen.getByPlaceholderText("Auto");
    fireEvent.change(input, { target: { value: "150" } });
    expect(onChange).toHaveBeenCalledWith({ width: 150 });
  });

  it("onChange is called with { width: undefined } when input is cleared", () => {
    const onChange = vi.fn();
    const node = makeTextNode({ width: 200 });
    render(
      <TextStylePanel
        node={node}
        onChange={onChange}
        onDelete={vi.fn()}
        onReorder={vi.fn()}
      />,
    );
    const input = screen.getByPlaceholderText("Auto");
    fireEvent.change(input, { target: { value: "" } });
    expect(onChange).toHaveBeenCalledWith({ width: undefined });
  });

  it("onChange clamps width to 20 minimum", () => {
    const onChange = vi.fn();
    const node = makeTextNode({ width: undefined });
    render(
      <TextStylePanel
        node={node}
        onChange={onChange}
        onDelete={vi.fn()}
        onReorder={vi.fn()}
      />,
    );
    const input = screen.getByPlaceholderText("Auto");
    fireEvent.change(input, { target: { value: "5" } });
    expect(onChange).toHaveBeenCalledWith({ width: 20 });
  });

  it("width patch routes to onChange which callers must forward via setNodeOverride (not setTextStyle)", () => {
    // This test verifies that TextStylePanel fires onChange with { width }
    // in a patch that contains ONLY width — the caller (BatchRightPanel) must
    // then split that patch and route width via setNodeOverride, not setTextStyle.
    const onChange = vi.fn();
    const node = makeTextNode();
    render(
      <TextStylePanel
        node={node}
        onChange={onChange}
        onDelete={vi.fn()}
        onReorder={vi.fn()}
      />,
    );
    const input = screen.getByPlaceholderText("Auto");
    fireEvent.change(input, { target: { value: "120" } });
    // The patch must only contain width — no style keys mixed in.
    expect(onChange).toHaveBeenCalledWith({ width: 120 });
    const patch = onChange.mock.calls[0]![0];
    expect(Object.keys(patch)).toEqual(["width"]);
  });
});
