import { describe, it, expect, vi, beforeAll } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TextNodeLayer } from "@/components/text-node-layer";
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
    expect(onResize).toHaveBeenCalledWith(150, expect.any(Number));
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
    expect(onResize).toHaveBeenCalledWith(20, expect.any(Number));
  });

  it("compensates x to anchor the left edge when dragging right handle", () => {
    const onResize = vi.fn();
    // startX=50 (%), width starts at 200px
    const node = makeNode({ x: 50, width: 200 });
    const { container } = render(
      <TextNodeLayer
        node={node}
        onMove={vi.fn()}
        onSelect={vi.fn()}
        isSelected={true}
        onResize={onResize}
      />,
    );

    // Mock parentElement.getBoundingClientRect to return a 1000px-wide canvas
    const rootEl = container.firstElementChild as HTMLElement;
    const parentEl = rootEl.parentElement as HTMLElement;
    vi.spyOn(parentEl, "getBoundingClientRect").mockReturnValue({
      width: 1000,
      height: 500,
      left: 0,
      top: 0,
      right: 1000,
      bottom: 500,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });

    const handle = screen.getByLabelText(/resize handle/i);

    // Drag right by 100px: startWidth=200, newWidth=300, appliedDw=100
    // newX = 50 + (100/2/1000)*100 = 50 + 5 = 55
    fireEvent.pointerDown(handle, { clientX: 0, buttons: 1, pointerId: 1 });
    fireEvent.pointerMove(handle, { clientX: 100, buttons: 1 });
    expect(onResize).toHaveBeenCalledWith(300, 55);
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
