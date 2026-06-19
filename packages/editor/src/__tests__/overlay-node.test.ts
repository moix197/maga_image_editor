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
