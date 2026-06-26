import { describe, it, expect, vi, beforeAll } from "vitest";
import { render, fireEvent, act } from "@testing-library/react";
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

describe("TextNodeLayer inline editing", () => {
  it("single-click does NOT enter edit mode (no contentEditable)", () => {
    const node = makeNode();
    const { container } = render(
      <TextNodeLayer
        node={node}
        onMove={vi.fn()}
        onSelect={vi.fn()}
        isSelected={true}
        onContentChange={vi.fn()}
      />,
    );
    const root = container.firstElementChild as HTMLElement;
    fireEvent.click(root);
    // contentEditable div should NOT be present after a single click
    expect(container.querySelector("[contenteditable]")).toBeNull();
  });

  it("double-click enters edit mode when isSelected=true", () => {
    const node = makeNode();
    const { container } = render(
      <TextNodeLayer
        node={node}
        onMove={vi.fn()}
        onSelect={vi.fn()}
        isSelected={true}
        onContentChange={vi.fn()}
      />,
    );
    const root = container.firstElementChild as HTMLElement;
    fireEvent.doubleClick(root);
    // contentEditable div should now be present
    expect(container.querySelector("[contenteditable]")).not.toBeNull();
  });

  it("double-click does NOT enter edit mode when isSelected=false", () => {
    const node = makeNode();
    const { container } = render(
      <TextNodeLayer
        node={node}
        onMove={vi.fn()}
        onSelect={vi.fn()}
        isSelected={false}
        onContentChange={vi.fn()}
      />,
    );
    const root = container.firstElementChild as HTMLElement;
    fireEvent.doubleClick(root);
    expect(container.querySelector("[contenteditable]")).toBeNull();
  });

  it("double-click does NOT enter edit mode when node opacity is 0", () => {
    const node = makeNode({ opacity: 0 });
    const { container } = render(
      <TextNodeLayer
        node={node}
        onMove={vi.fn()}
        onSelect={vi.fn()}
        isSelected={true}
        onContentChange={vi.fn()}
      />,
    );
    const root = container.firstElementChild as HTMLElement;
    fireEvent.doubleClick(root);
    expect(container.querySelector("[contenteditable]")).toBeNull();
  });

  it("Esc commits and exits edit mode, calling onContentChange with current text", () => {
    const onContentChange = vi.fn();
    const node = makeNode({ content: "Original" });
    const { container } = render(
      <TextNodeLayer
        node={node}
        onMove={vi.fn()}
        onSelect={vi.fn()}
        isSelected={true}
        onContentChange={onContentChange}
      />,
    );
    const root = container.firstElementChild as HTMLElement;
    fireEvent.doubleClick(root);

    const editable = container.querySelector("[contenteditable]") as HTMLElement;
    expect(editable).not.toBeNull();
    // Simulate text content (jsdom does not dispatch input events for textContent changes)
    editable.textContent = "Updated text";

    fireEvent.keyDown(editable, { key: "Escape" });

    // contentEditable should be gone after Esc
    expect(container.querySelector("[contenteditable]")).toBeNull();
    expect(onContentChange).toHaveBeenCalledWith("Updated text");
  });

  it("blur commits and exits edit mode, calling onContentChange", () => {
    const onContentChange = vi.fn();
    const node = makeNode({ content: "Start" });
    const { container } = render(
      <TextNodeLayer
        node={node}
        onMove={vi.fn()}
        onSelect={vi.fn()}
        isSelected={true}
        onContentChange={onContentChange}
      />,
    );
    const root = container.firstElementChild as HTMLElement;
    fireEvent.doubleClick(root);

    const editable = container.querySelector("[contenteditable]") as HTMLElement;
    editable.textContent = "Changed";
    fireEvent.blur(editable);

    expect(container.querySelector("[contenteditable]")).toBeNull();
    expect(onContentChange).toHaveBeenCalledWith("Changed");
  });

  it("empty content commit: onContentChange called with empty string, node not removed", () => {
    const onContentChange = vi.fn();
    const node = makeNode({ content: "Delete me" });
    const { container } = render(
      <TextNodeLayer
        node={node}
        onMove={vi.fn()}
        onSelect={vi.fn()}
        isSelected={true}
        onContentChange={onContentChange}
      />,
    );
    const root = container.firstElementChild as HTMLElement;
    fireEvent.doubleClick(root);

    const editable = container.querySelector("[contenteditable]") as HTMLElement;
    editable.textContent = "";
    fireEvent.keyDown(editable, { key: "Escape" });

    // onContentChange called with empty string
    expect(onContentChange).toHaveBeenCalledWith("");
    // Root div (the node) is still in the DOM
    expect(container.firstElementChild).not.toBeNull();
  });

  it("drag is suppressed while editing (onMove not called on pointerDown)", () => {
    const onMove = vi.fn();
    const node = makeNode();
    const { container } = render(
      <TextNodeLayer
        node={node}
        onMove={onMove}
        onSelect={vi.fn()}
        isSelected={true}
        onContentChange={vi.fn()}
      />,
    );
    const root = container.firstElementChild as HTMLElement;

    // Enter edit mode via double-click
    fireEvent.doubleClick(root);
    expect(container.querySelector("[contenteditable]")).not.toBeNull();

    // Simulate a pointerDown + pointerMove — move must NOT fire
    fireEvent.pointerDown(root, { clientX: 100, clientY: 100, buttons: 1, pointerId: 1 });
    fireEvent.pointerMove(root, { clientX: 150, clientY: 150, buttons: 1 });
    expect(onMove).not.toHaveBeenCalled();
  });

  it("exits edit mode when isSelected changes from true to false", () => {
    const onContentChange = vi.fn();
    const node = makeNode({ content: "Hello" });

    const { container, rerender } = render(
      <TextNodeLayer
        node={node}
        onMove={vi.fn()}
        onSelect={vi.fn()}
        isSelected={true}
        onContentChange={onContentChange}
      />,
    );

    const root = container.firstElementChild as HTMLElement;
    fireEvent.doubleClick(root);
    expect(container.querySelector("[contenteditable]")).not.toBeNull();

    // Deselect — should commit and exit editing
    act(() => {
      rerender(
        <TextNodeLayer
          node={node}
          onMove={vi.fn()}
          onSelect={vi.fn()}
          isSelected={false}
          onContentChange={onContentChange}
        />,
      );
    });

    expect(container.querySelector("[contenteditable]")).toBeNull();
    expect(onContentChange).toHaveBeenCalled();
  });
});
