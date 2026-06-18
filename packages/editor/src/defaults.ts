import type { TextNode, OverlayNode } from "./types";

export const DEFAULT_TEXT_NODE: Omit<TextNode, "id"> = {
  content: "Hello",
  x: 50,
  y: 50,
  rotation: 0,
  zIndex: 0,
  fontSize: 24,
  color: "#ffffff",
  opacity: 1,
  fontFamily: "Inter",
  fontWeight: "normal",
  fontStyle: "normal",
  shadow: null,
  textBackground: null,
};

export const DEFAULT_OVERLAY_NODE: Omit<OverlayNode, "id"> = {
  src: "",
  x: 50,
  y: 50,
  width: 100,
  height: 100,
  opacity: 1,
  zIndex: 0,
};
