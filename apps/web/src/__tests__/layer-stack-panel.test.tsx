import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { LayerStackPanel } from "@/components/batch/LayerStackPanel";
import type { EditorNode, NodeId } from "@maga/editor";

function makeTextNode(id: string, zIndex: number, content = "Hello"): EditorNode {
  return {
    id: id as NodeId,
    content,
    x: 0, y: 0,
    rotation: 0,
    zIndex,
    fontSize: 14,
    color: "#000",
    opacity: 1,
    fontFamily: "Arial",
    fontWeight: "normal",
    fontStyle: "normal",
    shadow: null,
    textBackground: null,
  } as EditorNode;
}

function makeOverlayNode(id: string, zIndex: number, overlayType: "image" | "border" = "image"): EditorNode {
  return {
    id: id as NodeId,
    src: "data:image/png;base64,x",
    x: 0, y: 0,
    width: 100, height: 100,
    opacity: 1,
    zIndex,
    overlayType,
  } as EditorNode;
}

function renderPanel(
  props: Partial<React.ComponentProps<typeof LayerStackPanel>> & Pick<React.ComponentProps<typeof LayerStackPanel>, "nodes">
) {
  return render(
    <LayerStackPanel
      onReorderNode={vi.fn()}
      selectedNodeId={null}
      onSelectNode={vi.fn()}
      {...props}
    />
  );
}

describe("LayerStackPanel", () => {
  it("returns null when nodes array is empty", () => {
    const { container } = renderPanel({ nodes: [] });
    expect(container.firstChild).toBeNull();
  });

  it("renders nodes sorted by zIndex descending (highest first)", () => {
    const nodes = [
      makeTextNode("n1", 1, "Bottom"),
      makeOverlayNode("n2", 3),
      makeTextNode("n3", 2, "Middle"),
    ];
    const { getAllByRole } = renderPanel({ nodes });
    const rows = getAllByRole("button");
    expect(rows).toHaveLength(3);
    // First row should be the highest zIndex (n2 = zIndex 3)
    expect(rows[0]!.getAttribute("aria-label")).toContain("Image Overlay");
    // Last row should be the lowest zIndex (n1 = zIndex 1)
    expect(rows[2]!.getAttribute("aria-label")).toContain("Bottom");
  });

  it("calls onReorderNode with 'down' when dragging from index 0 to index 1 in descending list", () => {
    // Descending list: [zIndex=3, zIndex=1]
    // Dragging index 0 (z=3) to index 1 (z=1) = moving "down" in zIndex
    const nodes = [
      makeOverlayNode("top", 3),
      makeTextNode("bottom", 1, "Low"),
    ];
    const onReorderNode = vi.fn();
    const { getAllByRole } = renderPanel({ nodes, onReorderNode });

    const rows = getAllByRole("button");

    fireEvent.dragStart(rows[0]!);
    fireEvent.dragOver(rows[1]!, { preventDefault: () => {} });
    fireEvent.drop(rows[1]!, { preventDefault: () => {} });

    expect(onReorderNode).toHaveBeenCalledWith("top" as NodeId, "down");
    expect(onReorderNode).toHaveBeenCalledTimes(1);
  });

  it("calls onReorderNode with 'up' when dragging from index 1 to index 0 in descending list", () => {
    const nodes = [
      makeOverlayNode("top", 3),
      makeTextNode("bottom", 1, "Low"),
    ];
    const onReorderNode = vi.fn();
    const { getAllByRole } = renderPanel({ nodes, onReorderNode });

    const rows = getAllByRole("button");

    fireEvent.dragStart(rows[1]!);
    fireEvent.dragOver(rows[0]!, { preventDefault: () => {} });
    fireEvent.drop(rows[0]!, { preventDefault: () => {} });

    expect(onReorderNode).toHaveBeenCalledWith("bottom" as NodeId, "up");
    expect(onReorderNode).toHaveBeenCalledTimes(1);
  });

  it("does not call onReorderNode when dropping on same item", () => {
    const nodes = [makeOverlayNode("n1", 1), makeTextNode("n2", 2)];
    const onReorderNode = vi.fn();
    const { getAllByRole } = renderPanel({ nodes, onReorderNode });

    const rows = getAllByRole("button");

    fireEvent.dragStart(rows[0]!);
    fireEvent.dragOver(rows[0]!, { preventDefault: () => {} });
    fireEvent.drop(rows[0]!, { preventDefault: () => {} });

    expect(onReorderNode).not.toHaveBeenCalled();
  });

  it("clears the drop-target highlight after dragEnd", () => {
    const nodes = [makeOverlayNode("top", 3), makeTextNode("bottom", 1, "Low")];
    const { getAllByRole } = renderPanel({ nodes });

    const rows = getAllByRole("button");

    // Establish highlight on row 1 by dragging over it
    fireEvent.dragStart(rows[0]!);
    fireEvent.dragOver(rows[1]!, { preventDefault: () => {} });
    expect(rows[1]!.className).toContain("ring-primary");

    // dragEnd should clear it
    fireEvent.dragEnd(rows[0]!);
    expect(rows[1]!.className).not.toContain("ring-primary");
  });

  it("clears the drop-target highlight after drop", () => {
    const nodes = [makeOverlayNode("top", 3), makeTextNode("bottom", 1, "Low")];
    const { getAllByRole } = renderPanel({ nodes });

    const rows = getAllByRole("button");

    fireEvent.dragStart(rows[0]!);
    fireEvent.dragOver(rows[1]!, { preventDefault: () => {} });
    expect(rows[1]!.className).toContain("ring-primary");

    fireEvent.drop(rows[1]!, { preventDefault: () => {} });
    expect(rows[1]!.className).not.toContain("ring-primary");
  });

  it("calls onSelectNode with the node id when a row is clicked", () => {
    const nodes = [makeOverlayNode("top", 3), makeTextNode("bottom", 1, "Low")];
    const onSelectNode = vi.fn();
    const { getAllByRole } = renderPanel({ nodes, onSelectNode });

    const rows = getAllByRole("button");
    fireEvent.click(rows[1]!);

    expect(onSelectNode).toHaveBeenCalledWith("bottom" as NodeId);
    expect(onSelectNode).toHaveBeenCalledTimes(1);
  });

  it("marks the selected row with aria-pressed and a highlight ring", () => {
    const nodes = [makeOverlayNode("top", 3), makeTextNode("bottom", 1, "Low")];
    const { getAllByRole } = renderPanel({ nodes, selectedNodeId: "bottom" as NodeId });

    const rows = getAllByRole("button");
    expect(rows[0]!.getAttribute("aria-pressed")).toBe("false");
    expect(rows[1]!.getAttribute("aria-pressed")).toBe("true");
    expect(rows[1]!.className).toContain("ring-primary");
  });
});
