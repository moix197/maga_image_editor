import { describe, it, expect } from "vitest";
import {
  createEditorState,
  createTextNode,
  updateTextNode,
  removeNode,
  reorderNode,
} from "../src/editor-state";
import type { NodeId } from "../src/types";

describe("createEditorState", () => {
  it("returns an empty nodes array", () => {
    const state = createEditorState();
    expect(state.nodes).toEqual([]);
  });
});

describe("createTextNode", () => {
  it("merges provided partial with defaults", () => {
    const node = createTextNode({ content: "Test", fontSize: 32 });
    expect(node.content).toBe("Test");
    expect(node.fontSize).toBe(32);
    expect(node.color).toBe("#ffffff");
    expect(node.opacity).toBe(1);
    expect(node.x).toBe(50);
  });

  it("assigns a unique id each call", () => {
    const a = createTextNode({});
    const b = createTextNode({});
    expect(a.id).toBeTruthy();
    expect(b.id).toBeTruthy();
    expect(a.id).not.toBe(b.id);
  });

  it("sets fontFamily, fontWeight, fontStyle, and shadow defaults", () => {
    const node = createTextNode({});
    expect(node.fontFamily).toBe("Inter");
    expect(node.fontWeight).toBe("normal");
    expect(node.fontStyle).toBe("normal");
    expect(node.shadow).toBeNull();
  });
});

describe("updateTextNode", () => {
  it("returns new state with patch applied", () => {
    const state = createEditorState();
    const node = createTextNode({ content: "Hello" });
    const s1 = { ...state, nodes: [node] };
    const s2 = updateTextNode(s1, node.id, { content: "World", fontSize: 36 });
    const updated = s2.nodes.find((n) => n.id === node.id);
    expect(updated).toBeDefined();
    expect((updated as typeof node).content).toBe("World");
    expect((updated as typeof node).fontSize).toBe(36);
  });

  it("does not mutate original state", () => {
    const state = createEditorState();
    const node = createTextNode({ content: "Original" });
    const s1 = { ...state, nodes: [node] };
    updateTextNode(s1, node.id, { content: "Changed" });
    expect((s1.nodes[0] as typeof node).content).toBe("Original");
  });
});

describe("removeNode", () => {
  it("removes the correct node", () => {
    const state = createEditorState();
    const a = createTextNode({ content: "A" });
    const b = createTextNode({ content: "B" });
    const s1 = { ...state, nodes: [a, b] };
    const s2 = removeNode(s1, a.id);
    expect(s2.nodes).toHaveLength(1);
    expect(s2.nodes[0]!.id).toBe(b.id);
  });

  it("leaves state unchanged when id not found", () => {
    const state = createEditorState();
    const a = createTextNode({});
    const s1 = { ...state, nodes: [a] };
    const s2 = removeNode(s1, "nonexistent" as NodeId);
    expect(s2.nodes).toHaveLength(1);
  });
});

describe("reorderNode", () => {
  it("swaps zIndex when moving up", () => {
    const state = createEditorState();
    const a = createTextNode({ zIndex: 0 });
    const b = createTextNode({ zIndex: 1 });
    const s1 = { ...state, nodes: [a, b] };
    const s2 = reorderNode(s1, a.id, "up");
    const updatedA = s2.nodes.find((n) => n.id === a.id)!;
    const updatedB = s2.nodes.find((n) => n.id === b.id)!;
    expect(updatedA.zIndex).toBe(1);
    expect(updatedB.zIndex).toBe(0);
  });

  it("swaps zIndex when moving down", () => {
    const state = createEditorState();
    const a = createTextNode({ zIndex: 0 });
    const b = createTextNode({ zIndex: 1 });
    const s1 = { ...state, nodes: [a, b] };
    const s2 = reorderNode(s1, b.id, "down");
    const updatedA = s2.nodes.find((n) => n.id === a.id)!;
    const updatedB = s2.nodes.find((n) => n.id === b.id)!;
    expect(updatedA.zIndex).toBe(1);
    expect(updatedB.zIndex).toBe(0);
  });

  it("is a no-op when moving the top node up", () => {
    const state = createEditorState();
    const a = createTextNode({ zIndex: 0 });
    const b = createTextNode({ zIndex: 1 });
    const s1 = { ...state, nodes: [a, b] };
    const s2 = reorderNode(s1, b.id, "up");
    expect(s2.nodes.find((n) => n.id === b.id)!.zIndex).toBe(1);
  });
});
