import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { TextNodeLayer } from "@/components/text-node-layer";
import type { TextNode, NodeId } from "@maga/editor";

const baseNode: TextNode = {
  id: "node-1" as NodeId,
  content: "Hello",
  x: 50,
  y: 50,
  rotation: 0,
  zIndex: 0,
  fontSize: 24,
  color: "#ffffff",
  opacity: 1,
  fontFamily: "Inter",
  fontWeight: "normal",
  fontStyle: "normal",
  shadow: null,
  textBackground: null,
};

const noop = vi.fn();

describe("TextNodeLayer", () => {
  it("renders content as plain text when textBackground is null", () => {
    const { container } = render(
      <TextNodeLayer node={baseNode} onMove={noop} onSelect={noop} isSelected={false} />
    );
    const div = container.firstElementChild as HTMLElement;
    // No child span — content rendered directly
    expect(div.querySelector("span")).toBeNull();
    expect(div.textContent).toBe("Hello");
  });

  it("renders a background span with correct inline styles when textBackground is set", () => {
    const node: TextNode = {
      ...baseNode,
      textBackground: { color: "#ff0000", opacity: 0.7, blur: 0, paddingX: 8, paddingY: 4 },
    };
    const { container } = render(
      <TextNodeLayer node={node} onMove={noop} onSelect={noop} isSelected={false} />
    );
    const span = container.querySelector("span") as HTMLElement;
    expect(span).not.toBeNull();
    expect(span.style.backgroundColor).toBe("rgba(255, 0, 0, 0.7)");
    expect(span.style.opacity).toBe("");
    expect(span.style.padding).toBe("4px 8px");
    expect(span.textContent).toBe("Hello");
  });

  it("applies backdropFilter on outer div when blur > 0", () => {
    const node: TextNode = {
      ...baseNode,
      textBackground: { color: "#000000", opacity: 0.5, blur: 10, paddingX: 4, paddingY: 2 },
    };
    const { container } = render(
      <TextNodeLayer node={node} onMove={noop} onSelect={noop} isSelected={false} />
    );
    const div = container.firstElementChild as HTMLElement;
    expect(div.style.backdropFilter).toBe("blur(10px)");
  });

  it("does not apply backdropFilter when blur is 0", () => {
    const node: TextNode = {
      ...baseNode,
      textBackground: { color: "#000000", opacity: 0.5, blur: 0, paddingX: 4, paddingY: 2 },
    };
    const { container } = render(
      <TextNodeLayer node={node} onMove={noop} onSelect={noop} isSelected={false} />
    );
    const div = container.firstElementChild as HTMLElement;
    expect(div.style.backdropFilter).toBeFalsy();
  });

  it("applies selection outline when isSelected is true", () => {
    const { container } = render(
      <TextNodeLayer node={baseNode} onMove={noop} onSelect={noop} isSelected={true} />
    );
    const div = container.firstElementChild as HTMLElement;
    expect(div.style.outline).toContain("2px solid");
  });

  it("does not apply outline when isSelected is false", () => {
    const { container } = render(
      <TextNodeLayer node={baseNode} onMove={noop} onSelect={noop} isSelected={false} />
    );
    const div = container.firstElementChild as HTMLElement;
    expect(div.style.outline).toBe("none");
  });

  it("includes rotation in transform style", () => {
    const { container } = render(
      <TextNodeLayer node={{ ...baseNode, rotation: 45 }} onMove={noop} onSelect={noop} isSelected={false} />
    );
    const div = container.firstElementChild as HTMLElement;
    expect(div.style.transform).toContain("rotate(45deg)");
  });
});
