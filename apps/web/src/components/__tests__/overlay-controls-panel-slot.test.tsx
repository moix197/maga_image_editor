import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { OverlayControlsPanel } from "@/components/overlay-controls-panel";
import type { OverlayNode, NodeId } from "@maga/editor";

const imageNode: OverlayNode = {
  id: "ov-1" as NodeId,
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

const noop = vi.fn();

describe("OverlayControlsPanel — variable slot toggle", () => {
  it("renders the toggle when isVariableSlot and onToggleVariableSlot are provided", () => {
    render(
      <OverlayControlsPanel
        node={imageNode}
        onChange={noop}
        onDelete={noop}
        onReorder={noop}
        isVariableSlot={false}
        onToggleVariableSlot={noop}
      />,
    );
    expect(screen.getByRole("checkbox", { name: /use as variable slot/i })).toBeInTheDocument();
  });

  it("toggle is checked when isVariableSlot is true", () => {
    render(
      <OverlayControlsPanel
        node={imageNode}
        onChange={noop}
        onDelete={noop}
        onReorder={noop}
        isVariableSlot={true}
        onToggleVariableSlot={noop}
      />,
    );
    const toggle = screen.getByRole("checkbox", { name: /use as variable slot/i }) as HTMLInputElement;
    expect(toggle.checked).toBe(true);
  });

  it("calls onToggleVariableSlot when the toggle is clicked", () => {
    const onToggleVariableSlot = vi.fn();
    render(
      <OverlayControlsPanel
        node={imageNode}
        onChange={noop}
        onDelete={noop}
        onReorder={noop}
        isVariableSlot={false}
        onToggleVariableSlot={onToggleVariableSlot}
      />,
    );
    fireEvent.click(screen.getByRole("checkbox", { name: /use as variable slot/i }));
    expect(onToggleVariableSlot).toHaveBeenCalledTimes(1);
  });

  it("does NOT render the toggle when onToggleVariableSlot is omitted", () => {
    render(
      <OverlayControlsPanel
        node={imageNode}
        onChange={noop}
        onDelete={noop}
        onReorder={noop}
      />,
    );
    expect(screen.queryByRole("checkbox", { name: /use as variable slot/i })).toBeNull();
  });
});
