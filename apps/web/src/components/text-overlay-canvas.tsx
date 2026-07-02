"use client";

import type { CSSProperties, RefCallback } from "react";
import { isTextNode, isOverlayNode } from "@maga/editor";
import type { EditorState, NodeId, SnapBox, SnapGuide } from "@maga/editor";
import { TextNodeLayer } from "@/components/text-node-layer";
import { OverlayNodeLayer } from "@/components/overlay-node-layer";

/** Resolves a dragged node's snapped position + active guide lines; injected by BatchWorkspace. */
type ComputeSnap = (
  box: SnapBox,
  canvasSize: { width: number; height: number },
) => { x: number; y: number; guides: SnapGuide[] };

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
  /** Snap resolver threaded into the node layers; absent = no snapping. */
  computeSnap?: ComputeSnap;
  /** Reports active guide lines during a drag (empty on release). */
  onGuidesChange?: (guides: SnapGuide[]) => void;
  /** Guide lines to render inside the stage; empty = none (never present at export). */
  activeGuides?: SnapGuide[];
}

/**
 * Style for one guide line. "spacing" (equal-spacing/distribution, Phase 4)
 * renders as a dashed line distinct from the solid edge/center lines
 * (Phase 2/3) — purely additive, the edge/center branch is unchanged.
 */
function guideLineStyle(guide: SnapGuide): CSSProperties {
  const isSpacing = guide.kind === "spacing";
  const base: CSSProperties = {
    position: "absolute",
    pointerEvents: "none",
    zIndex: 9999,
  };
  if (guide.axis === "vertical") {
    return {
      ...base,
      left: guide.position,
      top: 0,
      height: "100%",
      // `border` (not `background`) is used for spacing guides because CSS
      // dashed patterns only render on borders, not on solid backgrounds.
      width: isSpacing ? 0 : 1,
      borderLeft: isSpacing ? "2px dashed #A855F7" : undefined,
      background: isSpacing ? undefined : "#F43F5E",
    };
  }
  return {
    ...base,
    top: guide.position,
    left: 0,
    width: "100%",
    height: isSpacing ? 0 : 1,
    borderTop: isSpacing ? "2px dashed #A855F7" : undefined,
    background: isSpacing ? undefined : "#F43F5E",
  };
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
  computeSnap,
  onGuidesChange,
  activeGuides,
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
              computeSnap={computeSnap}
              onGuidesChange={onGuidesChange}
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
              computeSnap={computeSnap}
              onGuidesChange={onGuidesChange}
            />
          );
        }
        return null;
      })}
      {/*
        Smart-guide lines. Rendered INSIDE the canvasCallbackRef div so they share
        the node coordinate space; positions are canvas-space px (the scale
        transform lives on an ancestor). Gated strictly on activeGuides being
        non-empty and carry data-guide-line so the export guard + isolation test
        can find/strip them (see plan "export non-contamination (b)").
      */}
      {activeGuides?.map((guide, i) => (
        <div
          key={`${guide.axis}-${guide.position}-${i}`}
          data-guide-line
          data-guide-kind={guide.kind}
          aria-hidden
          style={guideLineStyle(guide)}
        />
      ))}
    </div>
  );
}
