import type { EditorNode, TextNode, OverlayNode, BorderOverlay } from "./types";

/** Narrows an editor node to a text node via the `content` discriminator. */
export function isTextNode(node: EditorNode): node is TextNode {
  return "content" in node;
}

/** Narrows an editor node to an overlay node via the `overlayType` discriminator. */
export function isOverlayNode(node: EditorNode): node is OverlayNode {
  return "overlayType" in node;
}

/** Narrows an editor node to a border overlay via `overlayType === "border"`. */
export function isBorderOverlay(node: EditorNode): node is BorderOverlay {
  return isOverlayNode(node) && node.overlayType === "border";
}
