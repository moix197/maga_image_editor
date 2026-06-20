import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { VariantStrip } from "@/components/batch/VariantStrip";
import type { ProjectAsset } from "@maga/projects";

function makeAsset(id: string, filename = id + ".png"): ProjectAsset {
  return { id, filename, blobKey: "data:image/png;base64," + id };
}

describe("VariantStrip", () => {
  it("renders one thumbnail button per overlay", () => {
    const overlays = [makeAsset("a"), makeAsset("b"), makeAsset("c")];
    render(<VariantStrip overlays={overlays} activeId="a" onSelect={vi.fn()} />);

    const buttons = screen.getAllByRole("option");
    expect(buttons).toHaveLength(3);
  });

  it("renders nothing when overlays array is empty", () => {
    const { container } = render(
      <VariantStrip overlays={[]} activeId={null} onSelect={vi.fn()} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("calls onSelect with the correct id when a thumbnail is clicked", async () => {
    const user = userEvent.setup();
    const overlays = [makeAsset("alpha"), makeAsset("beta")];
    const onSelect = vi.fn();

    render(<VariantStrip overlays={overlays} activeId="alpha" onSelect={onSelect} />);

    const betaButton = screen.getByRole("option", { name: /beta/i });
    await user.click(betaButton);

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith("beta");
  });

  it("active item has aria-selected=true", () => {
    const overlays = [makeAsset("x"), makeAsset("y")];
    render(<VariantStrip overlays={overlays} activeId="y" onSelect={vi.fn()} />);

    const xOption = screen.getByRole("option", { name: /x/i });
    const yOption = screen.getByRole("option", { name: /y/i });

    expect(xOption).toHaveAttribute("aria-selected", "false");
    expect(yOption).toHaveAttribute("aria-selected", "true");
  });

  it("active item has a highlight class (border-primary)", () => {
    const overlays = [makeAsset("img1"), makeAsset("img2")];
    render(<VariantStrip overlays={overlays} activeId="img1" onSelect={vi.fn()} />);

    const activeButton = screen.getByRole("option", { name: /img1/i });
    const inactiveButton = screen.getByRole("option", { name: /img2/i });

    expect(activeButton.className).toContain("border-primary");
    expect(inactiveButton.className).not.toContain("border-primary");
  });

  it("each thumbnail img uses the overlay blobKey as src", () => {
    const overlays = [makeAsset("foo"), makeAsset("bar")];
    render(<VariantStrip overlays={overlays} activeId="foo" onSelect={vi.fn()} />);

    const images = screen.getAllByRole("img");
    expect(images[0]).toHaveAttribute("src", overlays[0]!.blobKey);
    expect(images[1]).toHaveAttribute("src", overlays[1]!.blobKey);
  });

  it("onSelect is called once per click, not on non-active or already active same item without side effects", async () => {
    const user = userEvent.setup();
    const overlays = [makeAsset("one"), makeAsset("two")];
    const onSelect = vi.fn();
    render(<VariantStrip overlays={overlays} activeId="one" onSelect={onSelect} />);

    // Click active item — still fires onSelect (parent decides if state changes)
    const activeButton = screen.getByRole("option", { name: /one/i });
    await user.click(activeButton);
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith("one");
  });
});
