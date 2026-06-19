import { describe, it, expect } from "vitest";
import { createOverlayNode, updateOverlayNode, createEditorState } from "../editor-state";

describe("overlay node aspect-ratio lock", () => {
  it("createOverlayNode defaults aspectRatioLocked: true", () => {
    const node = createOverlayNode({ src: "data:," });
    expect(node.aspectRatioLocked).toBe(true);
  });

  it("updateOverlayNode persists aspectRatioLocked: false patch", () => {
    const node = createOverlayNode({ src: "data:," });
    const state = { ...createEditorState(), nodes: [node] };
    const next = updateOverlayNode(state, node.id, { aspectRatioLocked: false });
    const updated = next.nodes.find((n) => n.id === node.id);
    expect(updated).toBeDefined();
    expect((updated as typeof node).aspectRatioLocked).toBe(false);
  });
});

describe("overlay node effects (rotation, cornerRadius, dropShadow)", () => {
  it("createOverlayNode defaults rotation: 0 and cornerRadius: 0", () => {
    const node = createOverlayNode({ src: "data:," });
    expect(node.rotation).toBe(0);
    expect(node.cornerRadius).toBe(0);
    expect(node.dropShadow).toBeUndefined();
  });

  it("updateOverlayNode persists rotation, cornerRadius, and dropShadow patches", () => {
    const node = createOverlayNode({ src: "data:," });
    const state = { ...createEditorState(), nodes: [node] };
    const dropShadow = { x: 5, y: 5, blur: 10, color: "#000000", opacity: 0.7 };
    const next = updateOverlayNode(state, node.id, { rotation: 45, cornerRadius: 20, dropShadow });
    const updated = next.nodes.find((n) => n.id === node.id) as typeof node;
    expect(updated.rotation).toBe(45);
    expect(updated.cornerRadius).toBe(20);
    expect(updated.dropShadow).toEqual(dropShadow);
  });

  it("updateOverlayNode persists featherRadius patch", () => {
    const node = createOverlayNode({ src: "data:," });
    const state = { ...createEditorState(), nodes: [node] };
    const next = updateOverlayNode(state, node.id, { featherRadius: 30 });
    const updated = next.nodes.find((n) => n.id === node.id) as typeof node;
    expect(updated.featherRadius).toBe(30);
  });
});
