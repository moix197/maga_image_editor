export type NodeId = string & { readonly __brand: "NodeId" };

export interface TextShadow {
  color: string;
  blur: number;
  offsetX: number;
  offsetY: number;
}

export interface TextBackground {
  color: string;
  opacity: number;
  blur: number;
  paddingX: number;
  paddingY: number;
}

/** Drop shadow for image overlays; baked into export by the canvas post-pass. */
export interface DropShadow {
  x: number;
  y: number;
  blur: number;
  color: string;
  opacity: number;
}

export interface TextNode {
  id: NodeId;
  content: string;
  x: number;
  y: number;
  /** Clockwise rotation in degrees applied via CSS transform. */
  rotation: number;
  zIndex: number;
  /** Explicit box width in px. When absent, the box auto-sizes to content. */
  width?: number;
  fontSize: number;
  color: string;
  opacity: number;
  fontFamily: string;
  fontWeight: string;
  fontStyle: string;
  shadow: TextShadow | null;
  textBackground: TextBackground | null;
}

/** Base overlay node shared by image and border variants. */
export interface OverlayNode {
  id: NodeId;
  /** Data URL for image overlays; empty string for border overlays. */
  src: string;
  x: number;
  y: number;
  width: number;
  height: number;
  opacity: number;
  zIndex: number;
  /** Discriminates image vs border overlays. */
  overlayType: "image" | "border";
  /** When true, editing width or height preserves the current W:H ratio. */
  aspectRatioLocked?: boolean;
  /** Clockwise rotation in degrees (default 0). */
  rotation?: number;
  /** Corner radius in px (default 0). */
  cornerRadius?: number;
  /** Drop shadow; undefined = no shadow. */
  dropShadow?: DropShadow;
  /** Edge feather radius in px; 0 or undefined = no feather. */
  featherRadius?: number;
}

/** Border overlay — a CSS-border div with configurable style. */
export interface BorderOverlay extends OverlayNode {
  overlayType: "border";
  borderStyle: string;
  borderColor: string;
  borderWidth: number;
  borderRadius: number;
}

export type EditorNode = TextNode | OverlayNode;

export interface EditorState {
  nodes: EditorNode[];
}
