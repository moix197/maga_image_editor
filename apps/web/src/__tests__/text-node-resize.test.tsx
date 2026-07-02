import { describe, it, expect, vi, beforeAll } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TextNodeLayer } from "@/components/text-node-layer";
import { TextStylePanel } from "@/components/text-style-panel";
import type { TextNode, NodeId } from "@maga/editor";

// jsdom does not implement pointer capture — stub it on all elements.
beforeAll(() => {
  if (!Element.prototype.setPointerCapture) {
    Element.prototype.setPointerCapture = vi.fn();
  }
  if (!Element.prototype.releasePointerCapture) {
    Element.prototype.releasePointerCapture = vi.fn();
  }
});

function makeNode(overrides: Partial<TextNode> = {}): TextNode {
  return {
    id: "node-1" as NodeId,
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

describe("TextNodeLayer resize handle", () => {
  it("renders the resize handle when isSelected=true", () => {
    const node = makeNode();
    render(
      <TextNodeLayer
        node={node}
        onMove={vi.fn()}
        onSelect={vi.fn()}
        isSelected={true}
        onResize={vi.fn()}
      />,
    );
    expect(screen.getByLabelText(/resize handle/i)).toBeDefined();
  });

  it("does NOT render the resize handle when isSelected=false", () => {
    const node = makeNode();
    render(
      <TextNodeLayer
        node={node}
        onMove={vi.fn()}
        onSelect={vi.fn()}
        isSelected={false}
        onResize={vi.fn()}
      />,
    );
    expect(screen.queryByLabelText(/resize handle/i)).toBeNull();
  });

  it("applies node.width as inline style when set", () => {
    const node = makeNode({ width: 200 });
    const { container } = render(
      <TextNodeLayer
        node={node}
        onMove={vi.fn()}
        onSelect={vi.fn()}
        isSelected={false}
        onResize={vi.fn()}
      />,
    );
    const root = container.firstElementChild as HTMLElement;
    expect(root.style.width).toBe("200px");
  });

  it("does not set width style when node.width is undefined", () => {
    const node = makeNode({ width: undefined });
    const { container } = render(
      <TextNodeLayer
        node={node}
        onMove={vi.fn()}
        onSelect={vi.fn()}
        isSelected={false}
        onResize={vi.fn()}
      />,
    );
    const root = container.firstElementChild as HTMLElement;
    expect(root.style.width).toBe("");
  });

  it("calls onResize with clamped width (min 20) on pointer drag", () => {
    const onResize = vi.fn();
    const node = makeNode({ width: 100 });
    render(
      <TextNodeLayer
        node={node}
        onMove={vi.fn()}
        onSelect={vi.fn()}
        isSelected={true}
        onResize={onResize}
      />,
    );

    const handle = screen.getByLabelText(/resize handle/i);

    // Simulate pointer down at clientX=200
    fireEvent.pointerDown(handle, { clientX: 200, buttons: 1, pointerId: 1 });
    // Simulate pointer move to clientX=250 → dw=50 → newWidth=100+50=150
    fireEvent.pointerMove(handle, { clientX: 250, buttons: 1 });
    expect(onResize).toHaveBeenCalledWith(150);
  });

  it("clamps onResize width to minimum 20px", () => {
    const onResize = vi.fn();
    const node = makeNode({ width: 30 });
    render(
      <TextNodeLayer
        node={node}
        onMove={vi.fn()}
        onSelect={vi.fn()}
        isSelected={true}
        onResize={onResize}
      />,
    );

    const handle = screen.getByLabelText(/resize handle/i);

    // Drag far left: dw = -100, width = 30 - 100 = -70 → clamped to 20
    fireEvent.pointerDown(handle, { clientX: 200, buttons: 1, pointerId: 1 });
    fireEvent.pointerMove(handle, { clientX: 100, buttons: 1 });
    expect(onResize).toHaveBeenCalledWith(20);
  });

  it("calls onResize with only width (top-left anchor — no x compensation)", () => {
    const onResize = vi.fn();
    const node = makeNode({ x: 50, width: 200 });
    render(
      <TextNodeLayer
        node={node}
        onMove={vi.fn()}
        onSelect={vi.fn()}
        isSelected={true}
        onResize={onResize}
      />,
    );

    const handle = screen.getByLabelText(/resize handle/i);

    // Drag right by 100px: startWidth=200, newWidth=300
    fireEvent.pointerDown(handle, { clientX: 0, buttons: 1, pointerId: 1 });
    fireEvent.pointerMove(handle, { clientX: 100, buttons: 1 });
    expect(onResize).toHaveBeenCalledWith(300);
  });

  it("does NOT call onMove while dragging the resize handle (no position drift)", () => {
    const onMove = vi.fn();
    const onResize = vi.fn();
    const node = makeNode({ x: 50, width: 100 });
    render(
      <TextNodeLayer
        node={node}
        onMove={onMove}
        onSelect={vi.fn()}
        isSelected={true}
        onResize={onResize}
      />,
    );

    const handle = screen.getByLabelText(/resize handle/i);

    // A resize drag must not bubble into the root move handler.
    fireEvent.pointerDown(handle, { clientX: 200, buttons: 1, pointerId: 1 });
    fireEvent.pointerMove(handle, { clientX: 300, buttons: 1 });
    expect(onResize).toHaveBeenCalledWith(200);
    expect(onMove).not.toHaveBeenCalled();
  });

  it("does not call onResize when buttons=0 (no drag)", () => {
    const onResize = vi.fn();
    const node = makeNode({ width: 100 });
    render(
      <TextNodeLayer
        node={node}
        onMove={vi.fn()}
        onSelect={vi.fn()}
        isSelected={true}
        onResize={onResize}
      />,
    );

    const handle = screen.getByLabelText(/resize handle/i);

    // pointer move without pointerDown first and buttons=0
    fireEvent.pointerMove(handle, { clientX: 250, buttons: 0 });
    expect(onResize).not.toHaveBeenCalled();
  });

  it("divides the raw pixel-delta width resize by zoomScale=2 (drag delta halved)", () => {
    const onResize = vi.fn();
    const node = makeNode({ width: 100 });
    render(
      <TextNodeLayer
        node={node}
        onMove={vi.fn()}
        onSelect={vi.fn()}
        isSelected={true}
        onResize={onResize}
        zoomScale={2}
      />,
    );

    const handle = screen.getByLabelText(/resize handle/i);

    // Screen-pixel dw=50 at zoomScale=2 -> canvas-space dw=25 -> newWidth=125
    fireEvent.pointerDown(handle, { clientX: 200, buttons: 1, pointerId: 1 });
    fireEvent.pointerMove(handle, { clientX: 250, buttons: 1 });
    expect(onResize).toHaveBeenCalledWith(125);
  });

  it("defaults to zoomScale=1 (no division) when the prop is omitted", () => {
    const onResize = vi.fn();
    const node = makeNode({ width: 100 });
    render(
      <TextNodeLayer
        node={node}
        onMove={vi.fn()}
        onSelect={vi.fn()}
        isSelected={true}
        onResize={onResize}
      />,
    );

    const handle = screen.getByLabelText(/resize handle/i);

    fireEvent.pointerDown(handle, { clientX: 200, buttons: 1, pointerId: 1 });
    fireEvent.pointerMove(handle, { clientX: 250, buttons: 1 });
    expect(onResize).toHaveBeenCalledWith(150);
  });

  it("does not set height style when node.height is undefined", () => {
    const node = makeNode({ height: undefined });
    const { container } = render(
      <TextNodeLayer
        node={node}
        onMove={vi.fn()}
        onSelect={vi.fn()}
        isSelected={false}
        onHeightResize={vi.fn()}
      />,
    );
    const root = container.firstElementChild as HTMLElement;
    expect(root.style.height).toBe("");
  });

  it("textBackground renders as display:block span when set", () => {
    const node = makeNode({
      textBackground: { color: "#ff0000", opacity: 0.5, blur: 0, paddingX: 8, paddingY: 4 },
    });
    const { container } = render(
      <TextNodeLayer
        node={node}
        onMove={vi.fn()}
        onSelect={vi.fn()}
        isSelected={false}
      />,
    );
    const span = container.querySelector("span:first-child") as HTMLElement;
    expect(span).toBeDefined();
    expect(span.style.display).toBe("block");
    expect(span.style.width).toBe("100%");
  });
});

describe("TextNodeLayer corner resize handle (height + combined)", () => {
  it("applies node.height as inline style when set", () => {
    const node = makeNode({ height: 150 });
    const { container } = render(
      <TextNodeLayer
        node={node}
        onMove={vi.fn()}
        onSelect={vi.fn()}
        isSelected={false}
        onHeightResize={vi.fn()}
      />,
    );
    const root = container.firstElementChild as HTMLElement;
    expect(root.style.height).toBe("150px");
  });

  it("calls onHeightResize with computed height on vertical drag of the corner handle", () => {
    const onHeightResize = vi.fn();
    const node = makeNode({ height: 100 });
    render(
      <TextNodeLayer
        node={node}
        onMove={vi.fn()}
        onSelect={vi.fn()}
        isSelected={true}
        onHeightResize={onHeightResize}
      />,
    );

    const handle = screen.getByLabelText(/resize handle/i);

    // Pointer down at clientY=200, move to clientY=250 → dh=50 → newHeight=100+50=150
    fireEvent.pointerDown(handle, { clientY: 200, buttons: 1, pointerId: 1 });
    fireEvent.pointerMove(handle, { clientY: 250, buttons: 1 });
    expect(onHeightResize).toHaveBeenCalledWith(150);
  });

  it("drives both width and height from a single diagonal corner drag", () => {
    const onResize = vi.fn();
    const onHeightResize = vi.fn();
    const node = makeNode({ width: 100, height: 100 });
    render(
      <TextNodeLayer
        node={node}
        onMove={vi.fn()}
        onSelect={vi.fn()}
        isSelected={true}
        onResize={onResize}
        onHeightResize={onHeightResize}
      />,
    );

    const handle = screen.getByLabelText(/resize handle/i);

    // Diagonal drag: dx=50 → width 150, dy=60 → height 160
    fireEvent.pointerDown(handle, { clientX: 200, clientY: 200, buttons: 1, pointerId: 1 });
    fireEvent.pointerMove(handle, { clientX: 250, clientY: 260, buttons: 1 });
    expect(onResize).toHaveBeenCalledWith(150);
    expect(onHeightResize).toHaveBeenCalledWith(160);
  });

  it("clamps onHeightResize to minimum 0 (no negative height)", () => {
    const onHeightResize = vi.fn();
    const node = makeNode({ height: 30 });
    render(
      <TextNodeLayer
        node={node}
        onMove={vi.fn()}
        onSelect={vi.fn()}
        isSelected={true}
        onHeightResize={onHeightResize}
      />,
    );

    const handle = screen.getByLabelText(/resize handle/i);

    // Drag far up: dh = -100, height = 30 - 100 = -70 → clamped to 0
    fireEvent.pointerDown(handle, { clientY: 200, buttons: 1, pointerId: 1 });
    fireEvent.pointerMove(handle, { clientY: 100, buttons: 1 });
    expect(onHeightResize).toHaveBeenCalledWith(0);
  });

  it("does NOT call onMove while dragging the corner handle", () => {
    const onMove = vi.fn();
    const onHeightResize = vi.fn();
    const node = makeNode({ y: 50, height: 100 });
    render(
      <TextNodeLayer
        node={node}
        onMove={onMove}
        onSelect={vi.fn()}
        isSelected={true}
        onHeightResize={onHeightResize}
      />,
    );

    const handle = screen.getByLabelText(/resize handle/i);

    fireEvent.pointerDown(handle, { clientY: 200, buttons: 1, pointerId: 1 });
    fireEvent.pointerMove(handle, { clientY: 300, buttons: 1 });
    expect(onHeightResize).toHaveBeenCalledWith(200);
    expect(onMove).not.toHaveBeenCalled();
  });

  it("does not call onHeightResize when buttons=0 (no drag)", () => {
    const onHeightResize = vi.fn();
    const node = makeNode({ height: 100 });
    render(
      <TextNodeLayer
        node={node}
        onMove={vi.fn()}
        onSelect={vi.fn()}
        isSelected={true}
        onHeightResize={onHeightResize}
      />,
    );

    const handle = screen.getByLabelText(/resize handle/i);

    fireEvent.pointerMove(handle, { clientY: 250, buttons: 0 });
    expect(onHeightResize).not.toHaveBeenCalled();
  });

  it("divides diagonal drag width+height deltas by zoomScale=4", () => {
    const onResize = vi.fn();
    const onHeightResize = vi.fn();
    const node = makeNode({ width: 100, height: 100 });
    render(
      <TextNodeLayer
        node={node}
        onMove={vi.fn()}
        onSelect={vi.fn()}
        isSelected={true}
        onResize={onResize}
        onHeightResize={onHeightResize}
        zoomScale={4}
      />,
    );

    const handle = screen.getByLabelText(/resize handle/i);

    // dx=40 -> canvas-space 10 -> width 110; dy=80 -> canvas-space 20 -> height 120
    fireEvent.pointerDown(handle, { clientX: 200, clientY: 200, buttons: 1, pointerId: 1 });
    fireEvent.pointerMove(handle, { clientX: 240, clientY: 280, buttons: 1 });
    expect(onResize).toHaveBeenCalledWith(110);
    expect(onHeightResize).toHaveBeenCalledWith(120);
  });

  it("clearing the Height panel input fires onChange with undefined (not 0 or NaN)", () => {
    const onChange = vi.fn();
    const node = makeNode({ height: 120 });
    render(
      <TextStylePanel node={node} onChange={onChange} onDelete={vi.fn()} onReorder={vi.fn()} />,
    );

    const heightInput = screen.getByLabelText("Text height") as HTMLInputElement;
    fireEvent.change(heightInput, { target: { value: "" } });
    expect(onChange).toHaveBeenCalledWith({ height: undefined });
  });
});
