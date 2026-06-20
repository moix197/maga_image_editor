import { isOverlayNode } from "@maga/editor";
import type { EditorState, NodeId, OverlayNode } from "@maga/editor";

/**
 * Extracts image overlay nodes from the template, replacing the variable node's
 * src with croppedSrc. Returns nodes ready to pass to compositeFromElement.
 */
export function patchOverlays(
  state: EditorState,
  overlayNodeId: NodeId,
  croppedSrc: string,
): OverlayNode[] {
  return state.nodes
    .filter((n): n is OverlayNode => isOverlayNode(n) && n.overlayType === "image")
    .map((n) => (n.id === overlayNodeId ? { ...n, src: croppedSrc } : n));
}
