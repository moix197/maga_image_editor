import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useEditorState } from "../use-editor-state";

describe("useEditorState – addTextNode zIndex", () => {
  it("assigns zIndex above the current max after a delete (no collision)", () => {
    const { result } = renderHook(() => useEditorState());

    // Add 3 nodes: expected zIndex 0, 1, 2
    act(() => result.current.addTextNode());
    act(() => result.current.addTextNode());
    act(() => result.current.addTextNode());

    const [a, , c] = result.current.state.nodes;
    expect(result.current.state.nodes).toHaveLength(3);

    // Delete the middle node — leaves zIndex 0 and 2; array length drops to 2
    act(() => result.current.removeNode(result.current.state.nodes[1]!.id));
    expect(result.current.state.nodes).toHaveLength(2);

    // Add a new node: length is 2, so the old bug would assign zIndex 2 (collision)
    act(() => result.current.addTextNode());
    expect(result.current.state.nodes).toHaveLength(3);

    const newNode = result.current.state.nodes[2]!;
    const existingZIndices = result.current.state.nodes
      .slice(0, 2)
      .map((n) => n.zIndex);

    // New node's zIndex must be strictly greater than every existing zIndex
    expect(existingZIndices.every((z) => newNode.zIndex > z)).toBe(true);
    // And there must be no duplicate zIndex values in the full nodes array
    const allZIndices = result.current.state.nodes.map((n) => n.zIndex);
    expect(new Set(allZIndices).size).toBe(allZIndices.length);
  });
});
