import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { OverlayPickerDialog } from "@/components/batch/OverlayPickerDialog";
import type { ProjectAsset } from "@maga/projects";

function makeAsset(id: string, filename = id + ".png"): ProjectAsset {
  return { id, filename, blobKey: "data:image/png;base64," + id };
}

function defaultProps(assets: ProjectAsset[]) {
  return {
    open: true,
    onOpenChange: vi.fn(),
    assets,
    onConfirm: vi.fn(),
    onUploadNew: vi.fn(),
  };
}

describe("OverlayPickerDialog", () => {
  it("renders one thumbnail per asset", () => {
    const assets = [makeAsset("a"), makeAsset("b"), makeAsset("c")];
    render(<OverlayPickerDialog {...defaultProps(assets)} />);

    expect(screen.getAllByRole("option")).toHaveLength(3);
    expect(screen.getAllByRole("img")).toHaveLength(3);
  });

  it("accumulates ids as checkboxes are toggled", async () => {
    const user = userEvent.setup();
    const assets = [makeAsset("alpha"), makeAsset("beta")];
    const onConfirm = vi.fn();
    render(<OverlayPickerDialog {...defaultProps(assets)} onConfirm={onConfirm} />);

    await user.click(screen.getByRole("checkbox", { name: /select alpha/i }));
    await user.click(screen.getByRole("checkbox", { name: /select beta/i }));
    await user.click(screen.getByRole("button", { name: /^add$/i }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
    const ids = onConfirm.mock.calls[0]![0] as string[];
    expect(new Set(ids)).toEqual(new Set(["alpha", "beta"]));
  });

  it("fires onConfirm with only the toggled-on id when a checkbox is unchecked", async () => {
    const user = userEvent.setup();
    const assets = [makeAsset("one"), makeAsset("two")];
    const onConfirm = vi.fn();
    render(<OverlayPickerDialog {...defaultProps(assets)} onConfirm={onConfirm} />);

    await user.click(screen.getByRole("checkbox", { name: /select one/i }));
    await user.click(screen.getByRole("checkbox", { name: /select two/i }));
    await user.click(screen.getByRole("checkbox", { name: /select one/i }));
    await user.click(screen.getByRole("button", { name: /^add$/i }));

    expect(onConfirm).toHaveBeenCalledWith(["two"]);
  });

  it("fires onUploadNew when 'Upload new file' is clicked", async () => {
    const user = userEvent.setup();
    const onUploadNew = vi.fn();
    const onOpenChange = vi.fn();
    render(
      <OverlayPickerDialog
        {...defaultProps([makeAsset("a")])}
        onUploadNew={onUploadNew}
        onOpenChange={onOpenChange}
      />
    );

    await user.click(screen.getByRole("button", { name: /upload new file/i }));

    expect(onUploadNew).toHaveBeenCalledTimes(1);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("disables Add when no asset is selected", () => {
    render(<OverlayPickerDialog {...defaultProps([makeAsset("a")])} />);
    expect(screen.getByRole("button", { name: /^add$/i })).toBeDisabled();
  });

  it("closes without emitting when Cancel is clicked", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const onOpenChange = vi.fn();
    render(
      <OverlayPickerDialog
        {...defaultProps([makeAsset("a")])}
        onConfirm={onConfirm}
        onOpenChange={onOpenChange}
      />
    );

    await user.click(screen.getByRole("checkbox", { name: /select a/i }));
    await user.click(screen.getByRole("button", { name: /cancel/i }));

    expect(onConfirm).not.toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("renders nothing selectable when assets is empty", () => {
    render(<OverlayPickerDialog {...defaultProps([])} />);
    expect(screen.queryAllByRole("option")).toHaveLength(0);
    expect(screen.getByRole("button", { name: /^add$/i })).toBeDisabled();
  });
});
