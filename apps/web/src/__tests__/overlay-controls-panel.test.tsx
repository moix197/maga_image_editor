import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { OverlayControlsPanel, applyAspectRatioLock } from "@/components/overlay-controls-panel";
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

  it("rotation value input fires onChange with rotation patch", () => {
    render(<OverlayControlsPanel node={mockNode} onChange={onChange} onDelete={noop} onReorder={noop} />);
    fireEvent.change(screen.getByLabelText("Rotation value"), { target: { value: "45" } });
    expect(onChange).toHaveBeenCalledWith({ rotation: 45 });
  });

  it("renders Corner Radius slider", () => {
    render(<OverlayControlsPanel node={mockNode} onChange={onChange} onDelete={noop} onReorder={noop} />);
    expect(screen.getByLabelText("Corner radius")).toBeDefined();
  });

  it("drop shadow toggle enables the section with default shadow", () => {
    render(<OverlayControlsPanel node={mockNode} onChange={onChange} onDelete={noop} onReorder={noop} />);
    const toggle = screen.getByRole("checkbox", { name: /enable drop shadow/i }) as HTMLInputElement;
    expect(toggle.checked).toBe(false);
    expect(screen.queryByLabelText("Shadow X")).toBeNull();
    fireEvent.click(toggle);
    expect(onChange).toHaveBeenCalledWith({
      dropShadow: { x: 5, y: 5, blur: 10, color: "#000000", opacity: 0.5 },
    });
  });

  it("drop shadow inputs fire onChange with merged patch when enabled", () => {
    const shadowNode: OverlayNode = {
      ...mockNode,
      dropShadow: { x: 5, y: 5, blur: 10, color: "#000000", opacity: 0.5 },
    };
    render(<OverlayControlsPanel node={shadowNode} onChange={onChange} onDelete={noop} onReorder={noop} />);
    fireEvent.change(screen.getByLabelText("Shadow blur"), { target: { value: "20" } });
    expect(onChange).toHaveBeenCalledWith({
      dropShadow: { x: 5, y: 5, blur: 20, color: "#000000", opacity: 0.5 },
    });
  });

  it("drop shadow toggle off clears the shadow", () => {
    const shadowNode: OverlayNode = {
      ...mockNode,
      dropShadow: { x: 5, y: 5, blur: 10, color: "#000000", opacity: 0.5 },
    };
    render(<OverlayControlsPanel node={shadowNode} onChange={onChange} onDelete={noop} onReorder={noop} />);
    fireEvent.click(screen.getByRole("checkbox", { name: /enable drop shadow/i }));
    expect(onChange).toHaveBeenCalledWith({ dropShadow: undefined });
  });
});

describe("applyAspectRatioLock", () => {
  const base: OverlayNode = {
    id: "n" as NodeId,
    src: "data:,",
    x: 0,
    y: 0,
    width: 200,
    height: 100,
    opacity: 1,
    zIndex: 0,
    overlayType: "image",
    aspectRatioLocked: true,
  };

  it("lock ON scales H from current W:H ratio", () => {
    expect(applyAspectRatioLock({ width: 400 }, base)).toEqual({ width: 400, height: 200 });
  });

  it("lock OFF leaves H untouched", () => {
    expect(applyAspectRatioLock({ width: 400 }, { ...base, aspectRatioLocked: false })).toEqual({
      width: 400,
    });
  });
});
