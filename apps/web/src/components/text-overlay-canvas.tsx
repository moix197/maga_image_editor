"use client";

import type { RefCallback } from "react";
import type { EditorState, TextNode } from "@maga/editor";
import { TextNodeLayer } from "@/components/text-node-layer";

interface TextOverlayCanvasProps {
  state: EditorState;
  onNodeMove: (id: string, x: number, y: number) => void;
  /** Callback ref forwarded from the page so the page can pass the element to exportCanvasElement */
  canvasCallbackRef: RefCallback<HTMLDivElement>;
  imageSrc: string;
}

function isTextNode(node: EditorState["nodes"][number]): node is TextNode {
  return "content" in node;
}

export function TextOverlayCanvas({
  state,
  onNodeMove,
  canvasCallbackRef,
  imageSrc,
}: TextOverlayCanvasProps) {
  const textNodes = state.nodes.filter(isTextNode);

  return (
    <div
      ref={canvasCallbackRef}
      style={{ position: "relative", display: "inline-block", lineHeight: 0 }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={imageSrc}
        alt="Editor canvas"
        style={{ display: "block", maxWidth: "100%", height: "auto" }}
      />
      {textNodes.map((node) => (
        <TextNodeLayer
          key={node.id}
          node={node}
          onMove={(x, y) => onNodeMove(node.id, x, y)}
          onSelect={() => {}}
        />
      ))}
    </div>
  );
}
