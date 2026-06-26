import type { TextNode, OverlayNode, BorderOverlay } from "./types";

// x/y are top-left corner percentages (top-left anchor, not center).
// 25,25 keeps a new node clearly visible near the upper-left quadrant of the canvas.
export const DEFAULT_TEXT_NODE: Omit<TextNode, "id"> = {
  content: "Hello",
  x: 25,
  y: 25,
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
  x: 10,
  y: 10,
  width: 100,
  height: 100,
  opacity: 1,
  zIndex: 0,
  overlayType: "image",
  aspectRatioLocked: true,
  rotation: 0,
  cornerRadius: 0,
};

export const DEFAULT_BORDER_NODE: Omit<BorderOverlay, "id"> = {
  src: "",
  x: 5,
  y: 5,
  width: 90,
  height: 90,
  opacity: 1,
  zIndex: 0,
  overlayType: "border",
  borderStyle: "solid",
  borderColor: "#ffffff",
  borderWidth: 4,
  borderRadius: 0,
};
