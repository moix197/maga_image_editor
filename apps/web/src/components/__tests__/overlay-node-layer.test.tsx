import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { OverlayNodeLayer } from "@/components/overlay-node-layer";
import type { OverlayNode, BorderOverlay, NodeId } from "@maga/editor";

const baseImageNode: OverlayNode = {
  id: "overlay-1" as NodeId,
  src: "data:image/png;base64,abc",
  x: 10,
  y: 10,
  width: 150,
  height: 100,
  opacity: 1,
  zIndex: 0,
  overlayType: "image",
};

const baseBorderNode: BorderOverlay = {
  id: "border-1" as NodeId,
  src: "",
  x: 5,
  y: 5,
  width: 90,
  height: 80,
  opacity: 1,
  zIndex: 0,
  overlayType: "border",
  borderStyle: "solid",
  borderColor: "#ff0000",
  borderWidth: 4,
  borderRadius: 8,
};

const noop = vi.fn();

describe("OverlayNodeLayer — image overlay", () => {
  it("renders an img element with correct src", () => {
    const { container } = render(
      <OverlayNodeLayer node={baseImageNode} onMove={noop} onResize={noop} onSelect={noop} isSelected={false} />
    );
    const img = container.querySelector("img");
    expect(img).not.toBeNull();
    expect(img!.src).toContain("data:image/png;base64,abc");
  });

  it("applies correct width and height styles", () => {
    const { container } = render(
      <OverlayNodeLayer node={baseImageNode} onMove={noop} onResize={noop} onSelect={noop} isSelected={false} />
    );
    const div = container.firstElementChild as HTMLElement;
    expect(div.style.width).toBe("150px");
    expect(div.style.height).toBe("100px");
  });

  it("shows selection outline when isSelected is true", () => {
    const { container } = render(
      <OverlayNodeLayer node={baseImageNode} onMove={noop} onResize={noop} onSelect={noop} isSelected={true} />
    );
    const div = container.firstElementChild as HTMLElement;
    expect(div.style.outline).toContain("2px solid");
  });

  it("shows resize handle when isSelected is true", () => {
    const { getByLabelText } = render(
      <OverlayNodeLayer node={baseImageNode} onMove={noop} onResize={noop} onSelect={noop} isSelected={true} />
    );
    expect(getByLabelText("Resize handle")).toBeTruthy();
  });

  it("clips corner radius on the img, not the outer container (so the handle isn't clipped)", () => {
    const node = { ...baseImageNode, cornerRadius: 12 };
    const { container } = render(
      <OverlayNodeLayer node={node} onMove={noop} onResize={noop} onSelect={noop} isSelected={true} />
    );
    const div = container.firstElementChild as HTMLElement;
    const img = container.querySelector("img") as HTMLImageElement;
    // Outer div must NOT clip — otherwise the resize handle (outside the box) is hidden.
    expect(div.style.overflow).not.toBe("hidden");
    expect(div.style.borderRadius).toBe("");
    // The clip + radius live on the image instead.
    expect(img.style.overflow).toBe("hidden");
    expect(img.style.borderRadius).toBe("12px");
  });
});

describe("OverlayNodeLayer — border overlay", () => {
  it("does not render an img element", () => {
    const { container } = render(
      <OverlayNodeLayer node={baseBorderNode} onMove={noop} onResize={noop} onSelect={noop} isSelected={false} />
    );
    expect(container.querySelector("img")).toBeNull();
  });

  it("applies border styles from node", () => {
    const { container } = render(
      <OverlayNodeLayer node={baseBorderNode} onMove={noop} onResize={noop} onSelect={noop} isSelected={false} />
    );
    const div = container.firstElementChild as HTMLElement;
    expect(div.style.border).toContain("4px");
    expect(div.style.border).toContain("solid");
    expect(div.style.borderRadius).toBe("8px");
  });
});

describe("OverlayNodeLayer — drag interaction", () => {
  it("calls onSelect on pointer down", () => {
    const onSelect = vi.fn();
    const { container } = render(
      <OverlayNodeLayer node={baseImageNode} onMove={noop} onResize={noop} onSelect={onSelect} isSelected={false} />
    );
    const div = container.firstElementChild as HTMLElement;
    // jsdom does not implement setPointerCapture — stub it so the handler can run.
    div.setPointerCapture = vi.fn();
    fireEvent.pointerDown(div, { clientX: 100, clientY: 100, buttons: 1 });
    expect(onSelect).toHaveBeenCalledTimes(1);
  });
});
