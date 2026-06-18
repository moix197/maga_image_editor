export type NodeId = string & { readonly __brand: "NodeId" };

export interface TextShadow {
  color: string;
  blur: number;
  offsetX: number;
  offsetY: number;
}

export interface TextNode {
  id: NodeId;
  content: string;
  x: number;
  y: number;
  rotation: number;
  zIndex: number;
  fontSize: number;
  color: string;
  opacity: number;
  fontFamily: string;
  fontWeight: string;
  fontStyle: string;
  shadow: TextShadow | null;
}

export interface OverlayNode {
  id: NodeId;
  src: string;
  x: number;
  y: number;
  width: number;
  height: number;
  opacity: number;
  zIndex: number;
}

export type EditorNode = TextNode | OverlayNode;

export interface EditorState {
  nodes: EditorNode[];
}
