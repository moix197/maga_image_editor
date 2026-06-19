import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { OverlayControlsPanel } from "@/components/overlay-controls-panel";
import type { OverlayNode, NodeId } from "@maga/editor";

const mockNode: OverlayNode = {
  id: "ov-id" as NodeId,
  src: "data:image/png;base64,abc",
  x: 10,
  y: 20,
  width: 200,
  height: 100,
  opacity: 1,
  zIndex: 0,
  overlayType: "image",
  aspectRatioLocked: true,
};

describe("OverlayControlsPanel (image overlay)", () => {
  let onChange: (patch: Partial<Omit<OverlayNode, "id">>) => void;
  const noop = vi.fn();

  beforeEach(() => {
    onChange = vi.fn() as unknown as (patch: Partial<Omit<OverlayNode, "id">>) => void;
  });

  it("renders X / Y / W / H number inputs", () => {
    render(<OverlayControlsPanel node={mockNode} onChange={onChange} onDelete={noop} onReorder={noop} />);
    expect((screen.getByLabelText("Position X") as HTMLInputElement).value).toBe("10");
    expect((screen.getByLabelText("Position Y") as HTMLInputElement).value).toBe("20");
    expect((screen.getByLabelText("Width") as HTMLInputElement).value).toBe("200");
    expect((screen.getByLabelText("Height") as HTMLInputElement).value).toBe("100");
  });

  it("fires onChange with x when X input changes", () => {
    render(<OverlayControlsPanel node={mockNode} onChange={onChange} onDelete={noop} onReorder={noop} />);
    fireEvent.change(screen.getByLabelText("Position X"), { target: { value: "30" } });
    expect(onChange).toHaveBeenCalledWith({ x: 30 });
  });

  it("lock toggle fires onChange with aspectRatioLocked", () => {
    render(<OverlayControlsPanel node={mockNode} onChange={onChange} onDelete={noop} onReorder={noop} />);
    const toggle = screen.getByRole("checkbox", { name: /lock aspect ratio/i }) as HTMLInputElement;
    expect(toggle.checked).toBe(true);
    fireEvent.click(toggle);
    expect(onChange).toHaveBeenCalledWith({ aspectRatioLocked: false });
  });

  it("changing W with lock ON fires onChange with proportionally adjusted H", () => {
    // ratio 200:100 = 2:1, so W=400 => H=200
    render(<OverlayControlsPanel node={mockNode} onChange={onChange} onDelete={noop} onReorder={noop} />);
    fireEvent.change(screen.getByLabelText("Width"), { target: { value: "400" } });
    expect(onChange).toHaveBeenCalledWith({ width: 400, height: 200 });
  });

  it("changing W with lock OFF leaves H unchanged", () => {
    render(
      <OverlayControlsPanel
        node={{ ...mockNode, aspectRatioLocked: false }}
        onChange={onChange}
        onDelete={noop}
        onReorder={noop}
      />,
    );
    fireEvent.change(screen.getByLabelText("Width"), { target: { value: "400" } });
    expect(onChange).toHaveBeenCalledWith({ width: 400 });
  });
});
