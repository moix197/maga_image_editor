import { describe, it, expect } from "vitest";
import { isTextNode, isOverlayNode, isBorderOverlay } from "../src/guards";
import { createTextNode, createOverlayNode, createBorderNode } from "../src/editor-state";

describe("node type guards", () => {
  const text = createTextNode({ content: "Hi" });
  const image = createOverlayNode({});
  const border = createBorderNode({});

  it("isTextNode matches only text nodes", () => {
    expect(isTextNode(text)).toBe(true);
    expect(isTextNode(image)).toBe(false);
    expect(isTextNode(border)).toBe(false);
  });

  it("isOverlayNode matches both overlay variants", () => {
    expect(isOverlayNode(image)).toBe(true);
    expect(isOverlayNode(border)).toBe(true);
    expect(isOverlayNode(text)).toBe(false);
  });

  it("isBorderOverlay matches only border overlays", () => {
    expect(isBorderOverlay(border)).toBe(true);
    expect(isBorderOverlay(image)).toBe(false);
    expect(isBorderOverlay(text)).toBe(false);
  });
});
