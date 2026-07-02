export type { NodeId, TextNode, OverlayNode, BorderOverlay, EditorNode, EditorState, TextShadow, TextBackground, DropShadow } from "./types";
export { DEFAULT_TEXT_NODE, DEFAULT_OVERLAY_NODE, DEFAULT_BORDER_NODE } from "./defaults";
export { FONT_FAMILIES } from "./constants";
export {
  createEditorState,
  createTextNode,
  updateTextNode,
  createOverlayNode,
  createBorderNode,
  updateOverlayNode,
  removeNode,
  reorderNode,
} from "./editor-state";
export { isTextNode, isOverlayNode, isBorderOverlay } from "./guards";
export type { Size, SnapBox, SnapAxis, SnapKind, SnapReference, SnapGuide, SnapResult } from "./snap-guides";
export { computeContainerSnapTargets, computeSiblingSnapTargets, resolveSnap } from "./snap-guides";
