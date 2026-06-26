"use client";

import type { RefCallback } from "react";
import { isTextNode, isOverlayNode } from "@maga/editor";
import type { EditorState, NodeId } from "@maga/editor";
import { TextNodeLayer } from "@/components/text-node-layer";
import { OverlayNodeLayer } from "@/components/overlay-node-layer";

interface TextOverlayCanvasProps {
  state: EditorState;
  onNodeMove: (id: string, x: number, y: number) => void;
  onNodeResize: (id: string, width: number, height: number) => void;
  onNodeTextResize: (id: string, width: number) => void;
  onNodeSelect: (id: string) => void;
  selectedNodeId: NodeId | null;
  canvasCallbackRef: RefCallback<HTMLDivElement>;
  imageSrc: string;
}

export function TextOverlayCanvas({
  state,
  onNodeMove,
  onNodeResize,
  onNodeTextResize,
  onNodeSelect,
  selectedNodeId,
  canvasCallbackRef,
  imageSrc,
}: TextOverlayCanvasProps) {
  const sortedNodes = [...state.nodes].sort((a, b) => a.zIndex - b.zIndex);

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
      {sortedNodes.map((node) => {
        if (isTextNode(node)) {
          return (
            <TextNodeLayer
              key={node.id}
              node={node}
              onMove={(x, y) => onNodeMove(node.id, x, y)}
              onResize={(width) => onNodeTextResize(node.id, width)}
              onSelect={() => onNodeSelect(node.id)}
              isSelected={node.id === selectedNodeId}
            />
          );
        }
        if (isOverlayNode(node)) {
          return (
            <OverlayNodeLayer
              key={node.id}
              node={node}
              onMove={(x, y) => onNodeMove(node.id, x, y)}
              onResize={(w, h) => onNodeResize(node.id, w, h)}
              onSelect={() => onNodeSelect(node.id)}
              isSelected={node.id === selectedNodeId}
            />
          );
        }
        return null;
      })}
    </div>
  );
}
