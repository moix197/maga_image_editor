import type { EditorState, TextNode, NodeId } from "./types";
import { DEFAULT_TEXT_NODE } from "./defaults";

let _counter = 0;

function makeNodeId(): NodeId {
  const unique =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now()}-${(_counter += 1)}`;
  return unique as NodeId;
}

export function createEditorState(): EditorState {
  return { nodes: [] };
}

export function createTextNode(partial: Partial<Omit<TextNode, "id">>): TextNode {
  return { ...DEFAULT_TEXT_NODE, ...partial, id: makeNodeId() };
}

export function updateTextNode(
  state: EditorState,
  id: NodeId,
  patch: Partial<Omit<TextNode, "id">>,
): EditorState {
  return {
    ...state,
    nodes: state.nodes.map((n) =>
      n.id === id ? { ...n, ...patch } : n,
    ),
  };
}

export function removeNode(state: EditorState, id: NodeId): EditorState {
  return { ...state, nodes: state.nodes.filter((n) => n.id !== id) };
}

export function reorderNode(
  state: EditorState,
  id: NodeId,
  direction: "up" | "down",
): EditorState {
  const sorted = [...state.nodes].sort((a, b) => a.zIndex - b.zIndex);
  const idx = sorted.findIndex((n) => n.id === id);
  if (idx === -1) return state;
  const swapIdx = direction === "up" ? idx + 1 : idx - 1;
  if (swapIdx < 0 || swapIdx >= sorted.length) return state;
  const aZ = sorted[idx]!.zIndex;
  const bZ = sorted[swapIdx]!.zIndex;
  return {
    ...state,
    nodes: state.nodes.map((n) => {
      if (n.id === sorted[idx]!.id) return { ...n, zIndex: bZ };
      if (n.id === sorted[swapIdx]!.id) return { ...n, zIndex: aZ };
      return n;
    }),
  };
}
