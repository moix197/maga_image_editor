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
  onNodeTextHeightResize: (id: string, height: number) => void;
  onNodeContentChange: (id: string, content: string) => void;
  onNodeSelect: (id: string) => void;
  selectedNodeId: NodeId | null;
  canvasCallbackRef: RefCallback<HTMLDivElement>;
  imageSrc: string;
  /** Current viewport zoom scale (1 = 100%); threaded to node layers for scale-aware resize math. */
  zoomScale?: number;
  /** Exposes the base image's naturalWidth/naturalHeight for fit-to-viewport. */
  imageCallbackRef?: RefCallback<HTMLImageElement>;
}

export function TextOverlayCanvas({
  state,
  onNodeMove,
  onNodeResize,
  onNodeTextResize,
  onNodeTextHeightResize,
  onNodeContentChange,
  onNodeSelect,
  selectedNodeId,
  canvasCallbackRef,
  imageSrc,
  zoomScale = 1,
  imageCallbackRef,
}: TextOverlayCanvasProps) {
  const sortedNodes = [...state.nodes].sort((a, b) => a.zIndex - b.zIndex);

  return (
    <div
      ref={canvasCallbackRef}
      style={{ position: "relative", display: "inline-block", lineHeight: 0 }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={imageCallbackRef}
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
              onHeightResize={(height) => onNodeTextHeightResize(node.id, height)}
              onContentChange={(content) => onNodeContentChange(node.id, content)}
              onSelect={() => onNodeSelect(node.id)}
              isSelected={node.id === selectedNodeId}
              zoomScale={zoomScale}
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
              zoomScale={zoomScale}
            />
          );
        }
        return null;
      })}
    </div>
  );
}
