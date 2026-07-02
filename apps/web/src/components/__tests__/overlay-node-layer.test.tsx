import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { OverlayNodeLayer, recordIntrinsicRatio } from "@/components/overlay-node-layer";
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

describe("OverlayNodeLayer — corner-drag resize with aspect lock", () => {
  function dragResizeHandle(getByLabelText: (label: string) => HTMLElement, dx: number, dy: number) {
    const handle = getByLabelText("Resize handle");
    handle.setPointerCapture = vi.fn();
    handle.releasePointerCapture = vi.fn();
    fireEvent.pointerDown(handle, { clientX: 0, clientY: 0 });
    fireEvent.pointerMove(handle, { clientX: dx, clientY: dy, buttons: 1 });
  }

  it("locked: derives height from width via the image's intrinsic ratio, ignoring drag dy", () => {
    const node: OverlayNode = { ...baseImageNode, id: "overlay-locked" as NodeId, aspectRatioLocked: true };
    recordIntrinsicRatio(node.id, 300, 100); // intrinsic 3:1 — differs from the 150x100 box ratio
    const onResize = vi.fn();
    const { getByLabelText } = render(
      <OverlayNodeLayer node={node} onMove={noop} onResize={onResize} onSelect={noop} isSelected={true} />
    );
    dragResizeHandle(getByLabelText, 30, 999); // dw=+30 -> width 180; dy is ignored
    expect(onResize).toHaveBeenCalledWith(180, 60); // height = 180 / 3
  });

  it("unlocked: free resize keeps independent width/height from drag deltas", () => {
    const node: OverlayNode = { ...baseImageNode, id: "overlay-unlocked" as NodeId, aspectRatioLocked: false };
    recordIntrinsicRatio(node.id, 300, 100);
    const onResize = vi.fn();
    const { getByLabelText } = render(
      <OverlayNodeLayer node={node} onMove={noop} onResize={onResize} onSelect={noop} isSelected={true} />
    );
    dragResizeHandle(getByLabelText, 30, 10); // dw=+30 -> 180, dh=+10 -> 110
    expect(onResize).toHaveBeenCalledWith(180, 110);
  });

  it("locked: preserves exact intrinsic ratio at small widths instead of flooring derived height to 20", () => {
    const node: OverlayNode = { ...baseImageNode, id: "overlay-extreme-ratio" as NodeId, aspectRatioLocked: true };
    recordIntrinsicRatio(node.id, 1000, 100); // intrinsic 10:1
    const onResize = vi.fn();
    const { getByLabelText } = render(
      <OverlayNodeLayer node={node} onMove={noop} onResize={onResize} onSelect={noop} isSelected={true} />
    );
    dragResizeHandle(getByLabelText, -50, 0); // dw=-50 -> width 100 -> height = 100 / 10 = 10
    expect(onResize).toHaveBeenCalledWith(100, 10);
  });

  it("locked but intrinsic ratio not captured yet: falls back to free resize", () => {
    const node: OverlayNode = { ...baseImageNode, id: "overlay-no-ratio" as NodeId, aspectRatioLocked: true };
    const onResize = vi.fn();
    const { getByLabelText } = render(
      <OverlayNodeLayer node={node} onMove={noop} onResize={onResize} onSelect={noop} isSelected={true} />
    );
    dragResizeHandle(getByLabelText, 30, 10);
    expect(onResize).toHaveBeenCalledWith(180, 110);
  });
});

describe("OverlayNodeLayer — corner-drag resize divides by zoomScale", () => {
  function dragResizeHandle(getByLabelText: (label: string) => HTMLElement, dx: number, dy: number) {
    const handle = getByLabelText("Resize handle");
    handle.setPointerCapture = vi.fn();
    handle.releasePointerCapture = vi.fn();
    fireEvent.pointerDown(handle, { clientX: 0, clientY: 0 });
    fireEvent.pointerMove(handle, { clientX: dx, clientY: dy, buttons: 1 });
  }

  it("unlocked: screen-pixel drag deltas are divided by zoomScale=2 before resizing", () => {
    const node: OverlayNode = { ...baseImageNode, id: "overlay-zoom-2x" as NodeId, aspectRatioLocked: false };
    const onResize = vi.fn();
    const { getByLabelText } = render(
      <OverlayNodeLayer node={node} onMove={noop} onResize={onResize} onSelect={noop} isSelected={true} zoomScale={2} />
    );
    // Screen-pixel dx=30 -> canvas-space 15 -> width 165; dy=10 -> canvas-space 5 -> height 105
    dragResizeHandle(getByLabelText, 30, 10);
    expect(onResize).toHaveBeenCalledWith(165, 105);
  });

  it("locked: intrinsic-ratio-derived height still uses the zoom-divided width", () => {
    const node: OverlayNode = { ...baseImageNode, id: "overlay-zoom-locked" as NodeId, aspectRatioLocked: true };
    recordIntrinsicRatio(node.id, 300, 100); // intrinsic 3:1
    const onResize = vi.fn();
    const { getByLabelText } = render(
      <OverlayNodeLayer node={node} onMove={noop} onResize={onResize} onSelect={noop} isSelected={true} zoomScale={2} />
    );
    // Screen-pixel dx=60 -> canvas-space 30 -> width 180 -> height = 180 / 3 = 60
    dragResizeHandle(getByLabelText, 60, 999);
    expect(onResize).toHaveBeenCalledWith(180, 60);
  });

  it("defaults to zoomScale=1 (no division) when the prop is omitted", () => {
    const node: OverlayNode = { ...baseImageNode, id: "overlay-zoom-default" as NodeId, aspectRatioLocked: false };
    const onResize = vi.fn();
    const { getByLabelText } = render(
      <OverlayNodeLayer node={node} onMove={noop} onResize={onResize} onSelect={noop} isSelected={true} />
    );
    dragResizeHandle(getByLabelText, 30, 10);
    expect(onResize).toHaveBeenCalledWith(180, 110);
  });
});
