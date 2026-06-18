export type { NodeId, TextNode, OverlayNode, EditorNode, EditorState } from "./types";
export { DEFAULT_TEXT_NODE, DEFAULT_OVERLAY_NODE } from "./defaults";
export {
  createEditorState,
  createTextNode,
  updateTextNode,
  removeNode,
  reorderNode,
} from "./editor-state";
