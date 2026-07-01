"use client";

import { useState } from "react";
import {
  createEditorState,
  createTextNode,
  updateTextNode,
  createOverlayNode,
  createBorderNode,
  updateOverlayNode,
  removeNode,
  reorderNode,
} from "@maga/editor";
import type { EditorState, NodeId, TextNode, OverlayNode, BorderOverlay } from "@maga/editor";

function nextZIndex(nodes: EditorState["nodes"]): number {
  return nodes.length ? Math.max(...nodes.map((n) => n.zIndex)) + 1 : 0;
}

export function useEditorState(initial?: EditorState) {
  const [state, setState] = useState<EditorState>(initial ?? createEditorState());

  function addTextNode(partial?: Partial<Omit<TextNode, "id">>) {
    setState((s) => {
      const node = createTextNode({ zIndex: nextZIndex(s.nodes), ...partial });
      return { ...s, nodes: [...s.nodes, node] };
    });
  }

  function addOverlayNode(partial?: Partial<Omit<OverlayNode, "id">>): NodeId {
    let newId!: NodeId;
    setState((s) => {
      const node = createOverlayNode({ zIndex: nextZIndex(s.nodes), ...partial });
      newId = node.id;
      return { ...s, nodes: [...s.nodes, node] };
    });
    return newId;
  }

  function addBorderNode(partial?: Partial<Omit<BorderOverlay, "id">>) {
    setState((s) => {
      const node = createBorderNode({ zIndex: nextZIndex(s.nodes), ...partial });
      return { ...s, nodes: [...s.nodes, node] };
    });
  }

  function patchTextNode(id: NodeId, patch: Partial<Omit<TextNode, "id">>) {
    setState((s) => updateTextNode(s, id, patch));
  }

  function patchOverlayNode(id: NodeId, patch: Partial<Omit<OverlayNode, "id">>) {
    setState((s) => updateOverlayNode(s, id, patch));
  }

  function deleteNode(id: NodeId) {
    setState((s) => removeNode(s, id));
  }

  function reorder(id: NodeId, direction: "up" | "down") {
    setState((s) => reorderNode(s, id, direction));
  }

  /**
   * Replaces the entire editor state. `useState`'s `initial` is read only on the
   * first render, so a template that arrives after mount (e.g. an IDB/ZIP
   * restore) must be seeded through here to actually render.
   */
  function replace(next: EditorState) {
    setState(next);
  }

  return {
    state,
    addTextNode,
    addOverlayNode,
    addBorderNode,
    updateTextNode: patchTextNode,
    updateOverlayNode: patchOverlayNode,
    removeNode: deleteNode,
    reorderNode: reorder,
    replace,
  };
}
