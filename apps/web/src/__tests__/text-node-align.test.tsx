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

describe("TextNodeLayer horizontal align", () => {
  it.each(["left", "center", "right"] as const)(
    "applies textAlign:%s as inline style on the root div",
    (align) => {
      const node = makeNode({ textAlign: align });
      const { container } = render(
        <TextNodeLayer node={node} onMove={vi.fn()} onSelect={vi.fn()} isSelected={false} />,
      );
      const root = container.firstElementChild as HTMLElement;
      expect(root.style.textAlign).toBe(align);
    },
  );

  it("does not set textAlign style when node.textAlign is undefined", () => {
    const node = makeNode({ textAlign: undefined });
    const { container } = render(
      <TextNodeLayer node={node} onMove={vi.fn()} onSelect={vi.fn()} isSelected={false} />,
    );
    const root = container.firstElementChild as HTMLElement;
    expect(root.style.textAlign).toBe("");
  });
});

describe("TextNodeLayer vertical align", () => {
  it.each([
    ["top", "flex-start"],
    ["middle", "center"],
    ["bottom", "flex-end"],
  ] as const)(
    "applies justifyContent:%s→%s flex column when height is set",
    (verticalAlign, expected) => {
      const node = makeNode({ height: 200, verticalAlign });
      const { container } = render(
        <TextNodeLayer node={node} onMove={vi.fn()} onSelect={vi.fn()} isSelected={false} />,
      );
      const root = container.firstElementChild as HTMLElement;
      expect(root.style.display).toBe("flex");
      expect(root.style.flexDirection).toBe("column");
      expect(root.style.justifyContent).toBe(expected);
    },
  );

  it("defaults to flex-start justifyContent when height is set but verticalAlign is undefined", () => {
    const node = makeNode({ height: 200, verticalAlign: undefined });
    const { container } = render(
      <TextNodeLayer node={node} onMove={vi.fn()} onSelect={vi.fn()} isSelected={false} />,
    );
    const root = container.firstElementChild as HTMLElement;
    expect(root.style.display).toBe("flex");
    expect(root.style.justifyContent).toBe("flex-start");
  });

  it("applies no flex styles on the root div when height is undefined (even if verticalAlign is set)", () => {
    const node = makeNode({ height: undefined, verticalAlign: "middle" });
    const { container } = render(
      <TextNodeLayer node={node} onMove={vi.fn()} onSelect={vi.fn()} isSelected={false} />,
    );
    const root = container.firstElementChild as HTMLElement;
    expect(root.style.display).toBe("");
    expect(root.style.flexDirection).toBe("");
    expect(root.style.justifyContent).toBe("");
  });

  it("renders the textBackground span as a valid flex child (display:block; width:100%) inside the flex column", () => {
    const node = makeNode({
      height: 200,
      verticalAlign: "middle",
      textBackground: { color: "#000000", opacity: 0.5, blur: 0, paddingX: 8, paddingY: 4 },
    });
    const { container } = render(
      <TextNodeLayer node={node} onMove={vi.fn()} onSelect={vi.fn()} isSelected={false} />,
    );
    const span = container.querySelector("span") as HTMLElement;
    expect(span.style.display).toBe("block");
    expect(span.style.width).toBe("100%");
  });
});

describe("TextStylePanel vertical align toggle", () => {
  it("renders Top/Middle/Bottom toggle buttons", () => {
    const node = makeNode({ height: 200 });
    render(
      <TextStylePanel node={node} onChange={vi.fn()} onDelete={vi.fn()} onReorder={vi.fn()} />,
    );
    expect(screen.getByLabelText("Vertical align top")).toBeDefined();
    expect(screen.getByLabelText("Vertical align middle")).toBeDefined();
    expect(screen.getByLabelText("Vertical align bottom")).toBeDefined();
  });

  it("disables the buttons when node.height is undefined", () => {
    const node = makeNode({ height: undefined });
    render(
      <TextStylePanel node={node} onChange={vi.fn()} onDelete={vi.fn()} onReorder={vi.fn()} />,
    );
    for (const label of ["Vertical align top", "Vertical align middle", "Vertical align bottom"]) {
      expect((screen.getByLabelText(label) as HTMLButtonElement).disabled).toBe(true);
    }
  });

  it("enables the buttons when node.height is set", () => {
    const node = makeNode({ height: 200 });
    render(
      <TextStylePanel node={node} onChange={vi.fn()} onDelete={vi.fn()} onReorder={vi.fn()} />,
    );
    for (const label of ["Vertical align top", "Vertical align middle", "Vertical align bottom"]) {
      expect((screen.getByLabelText(label) as HTMLButtonElement).disabled).toBe(false);
    }
  });

  it("clicking an inactive button fires onChange with that vertical alignment", () => {
    const onChange = vi.fn();
    const node = makeNode({ height: 200, verticalAlign: undefined });
    render(
      <TextStylePanel node={node} onChange={onChange} onDelete={vi.fn()} onReorder={vi.fn()} />,
    );
    fireEvent.click(screen.getByLabelText("Vertical align middle"));
    expect(onChange).toHaveBeenCalledWith({ verticalAlign: "middle" });
  });

  it("clicking the active button toggles off to undefined", () => {
    const onChange = vi.fn();
    const node = makeNode({ height: 200, verticalAlign: "bottom" });
    render(
      <TextStylePanel node={node} onChange={onChange} onDelete={vi.fn()} onReorder={vi.fn()} />,
    );
    fireEvent.click(screen.getByLabelText("Vertical align bottom"));
    expect(onChange).toHaveBeenCalledWith({ verticalAlign: undefined });
  });
});

describe("TextStylePanel text align toggle", () => {
  it("renders Left/Center/Right toggle buttons", () => {
    const node = makeNode();
    render(
      <TextStylePanel node={node} onChange={vi.fn()} onDelete={vi.fn()} onReorder={vi.fn()} />,
    );
    expect(screen.getByLabelText("Align left")).toBeDefined();
    expect(screen.getByLabelText("Align center")).toBeDefined();
    expect(screen.getByLabelText("Align right")).toBeDefined();
  });

  it("no button is pressed when textAlign is undefined", () => {
    const node = makeNode({ textAlign: undefined });
    render(
      <TextStylePanel node={node} onChange={vi.fn()} onDelete={vi.fn()} onReorder={vi.fn()} />,
    );
    for (const label of ["Align left", "Align center", "Align right"]) {
      expect(screen.getByLabelText(label).getAttribute("aria-pressed")).toBe("false");
    }
  });

  it("clicking an inactive button fires onChange with that alignment", () => {
    const onChange = vi.fn();
    const node = makeNode({ textAlign: undefined });
    render(
      <TextStylePanel node={node} onChange={onChange} onDelete={vi.fn()} onReorder={vi.fn()} />,
    );
    fireEvent.click(screen.getByLabelText("Align center"));
    expect(onChange).toHaveBeenCalledWith({ textAlign: "center" });
  });

  it("clicking the active button toggles off to undefined", () => {
    const onChange = vi.fn();
    const node = makeNode({ textAlign: "right" });
    render(
      <TextStylePanel node={node} onChange={onChange} onDelete={vi.fn()} onReorder={vi.fn()} />,
    );
    fireEvent.click(screen.getByLabelText("Align right"));
    expect(onChange).toHaveBeenCalledWith({ textAlign: undefined });
  });
});
