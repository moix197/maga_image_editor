import { describe, it, expect } from "vitest";
import {
  createEditorState,
  createOverlayNode,
  createBorderNode,
  updateOverlayNode,
  removeNode,
} from "../src/editor-state";
import { createTextNode } from "../src/editor-state";

describe("createOverlayNode", () => {
  it("sets overlayType to 'image'", () => {
    const node = createOverlayNode({});
    expect(node.overlayType).toBe("image");
  });

  it("assigns default dimensions", () => {
    const node = createOverlayNode({});
    expect(node.width).toBe(100);
    expect(node.height).toBe(100);
  });

  it("merges provided partial fields", () => {
    const node = createOverlayNode({ src: "data:image/png;base64,abc", width: 200 });
    expect(node.src).toBe("data:image/png;base64,abc");
    expect(node.width).toBe(200);
  });

  it("assigns a unique id each call", () => {
    const a = createOverlayNode({});
    const b = createOverlayNode({});
    expect(a.id).not.toBe(b.id);
  });
});

describe("createBorderNode", () => {
  it("sets overlayType to 'border'", () => {
    const node = createBorderNode({});
    expect(node.overlayType).toBe("border");
  });

  it("has border defaults", () => {
    const node = createBorderNode({});
    expect(node.borderStyle).toBe("solid");
    expect(node.borderColor).toBe("#ffffff");
    expect(node.borderWidth).toBe(4);
    expect(node.borderRadius).toBe(0);
  });

  it("merges provided partial fields", () => {
    const node = createBorderNode({ borderColor: "#ff0000", borderWidth: 8 });
    expect(node.borderColor).toBe("#ff0000");
    expect(node.borderWidth).toBe(8);
  });
});

describe("updateOverlayNode", () => {
  it("patches overlay fields and returns new state", () => {
    const state = createEditorState();
    const node = createOverlayNode({ opacity: 1 });
    const s1 = { ...state, nodes: [node] };
    const s2 = updateOverlayNode(s1, node.id, { opacity: 0.5, x: 20 });
    const updated = s2.nodes.find((n) => n.id === node.id)!;
    expect((updated as typeof node).opacity).toBe(0.5);
    expect((updated as typeof node).x).toBe(20);
  });

  it("does not mutate original state", () => {
    const state = createEditorState();
    const node = createOverlayNode({ opacity: 1 });
    const s1 = { ...state, nodes: [node] };
    updateOverlayNode(s1, node.id, { opacity: 0.5 });
    expect((s1.nodes[0] as typeof node).opacity).toBe(1);
  });
});

describe("removeNode with mixed node list", () => {
  it("removes an overlay from a mixed list", () => {
    const state = createEditorState();
    const text = createTextNode({ content: "Hello" });
    const overlay = createOverlayNode({ src: "data:image/png;base64,abc" });
    const s1 = { ...state, nodes: [text, overlay] };
    const s2 = removeNode(s1, overlay.id);
    expect(s2.nodes).toHaveLength(1);
    expect(s2.nodes[0]!.id).toBe(text.id);
  });
});
