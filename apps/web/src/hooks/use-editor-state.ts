"use client";

import { useState } from "react";
import {
  createEditorState,
  createTextNode,
  updateTextNode,
  removeNode,
  reorderNode,
} from "@maga/editor";
import type { EditorState, NodeId, TextNode } from "@maga/editor";

export function useEditorState(initial?: EditorState) {
  const [state, setState] = useState<EditorState>(
    initial ?? createEditorState(),
  );

  function addTextNode(partial?: Partial<Omit<TextNode, "id">>) {
    const node = createTextNode({ zIndex: state.nodes.length, ...partial });
    setState((s) => ({ ...s, nodes: [...s.nodes, node] }));
  }

  function patchTextNode(id: NodeId, patch: Partial<Omit<TextNode, "id">>) {
    setState((s) => updateTextNode(s, id, patch));
  }

  function deleteNode(id: NodeId) {
    setState((s) => removeNode(s, id));
  }

  function reorder(id: NodeId, direction: "up" | "down") {
    setState((s) => reorderNode(s, id, direction));
  }

  return {
    state,
    addTextNode,
    updateTextNode: patchTextNode,
    removeNode: deleteNode,
    reorderNode: reorder,
  };
}
