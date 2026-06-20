import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { AssetList } from "@/components/batch/AssetList";
import type { ProjectAsset } from "@maga/projects";

function makeAsset(id: string, filename: string): ProjectAsset {
  return { id, filename, blobKey: `data:image/png;base64,${id}` };
}

describe("AssetList drag-and-drop reorder", () => {
  const assets: ProjectAsset[] = [
    makeAsset("1", "a.png"),
    makeAsset("2", "b.png"),
    makeAsset("3", "c.png"),
  ];

  it("renders all assets", () => {
    const { getAllByRole } = render(
      <AssetList label="Overlays" assets={assets} onReorder={vi.fn()} />
    );
    // Each draggable div has aria-label
    expect(getAllByRole("img")).toHaveLength(3);
  });

  it("calls onReorder with correct new order after drag-start + drop", () => {
    const onReorder = vi.fn();
    const { getAllByRole } = render(
      <AssetList label="Overlays" assets={assets} onReorder={onReorder} />
    );

    const imgs = getAllByRole("img");
    // Get the draggable containers (parent of img)
    const items = imgs.map((img) => img.parentElement!);

    // Drag item 0 ("a.png") and drop onto item 2 ("c.png")
    fireEvent.dragStart(items[0]!);
    fireEvent.dragOver(items[2]!, { preventDefault: () => {} });
    fireEvent.drop(items[2]!, { preventDefault: () => {} });

    expect(onReorder).toHaveBeenCalledOnce();
    const newOrder = onReorder.mock.calls[0]![0] as ProjectAsset[];
    expect(newOrder.map((a) => a.filename)).toEqual(["b.png", "c.png", "a.png"]);
  });

  it("does not call onReorder when dropping on same item", () => {
    const onReorder = vi.fn();
    const { getAllByRole } = render(
      <AssetList label="Overlays" assets={assets} onReorder={onReorder} />
    );

    const imgs = getAllByRole("img");
    const items = imgs.map((img) => img.parentElement!);

    fireEvent.dragStart(items[1]!);
    fireEvent.dragOver(items[1]!, { preventDefault: () => {} });
    fireEvent.drop(items[1]!, { preventDefault: () => {} });

    expect(onReorder).not.toHaveBeenCalled();
  });

  it("does not enable draggable or call onReorder when onReorder is not provided", () => {
    const { getAllByRole } = render(
      <AssetList label="Overlays" assets={assets} />
    );
    const imgs = getAllByRole("img");
    const items = imgs.map((img) => img.parentElement!);
    expect(items[0]!.getAttribute("draggable")).not.toBe("true");
  });

  it("clears the drop-target highlight class after dragEnd", () => {
    const onReorder = vi.fn();
    const { getAllByRole } = render(
      <AssetList label="Overlays" assets={assets} onReorder={onReorder} />
    );

    const imgs = getAllByRole("img");
    const items = imgs.map((img) => img.parentElement!);

    // Establish a highlight on item 2 by dragging over it
    fireEvent.dragStart(items[0]!);
    fireEvent.dragOver(items[2]!, { preventDefault: () => {} });
    expect(items[2]!.className).toContain("border-primary");

    // dragEnd should clear the highlight
    fireEvent.dragEnd(items[0]!);
    expect(items[2]!.className).not.toContain("border-primary");
  });

  it("clears the drop-target highlight class after drop", () => {
    const onReorder = vi.fn();
    const { getAllByRole } = render(
      <AssetList label="Overlays" assets={assets} onReorder={onReorder} />
    );

    const imgs = getAllByRole("img");
    const items = imgs.map((img) => img.parentElement!);

    fireEvent.dragStart(items[0]!);
    fireEvent.dragOver(items[2]!, { preventDefault: () => {} });
    expect(items[2]!.className).toContain("border-primary");

    fireEvent.drop(items[2]!, { preventDefault: () => {} });
    expect(items[2]!.className).not.toContain("border-primary");
  });
});
