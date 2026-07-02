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

/** Resolves a resized node's snapped width/height + active guide lines; injected by BatchWorkspace. */
type ComputeResizeSnap = (
  dragSize: { width: number; height: number },
  canvasSize: { width: number; height: number },
) => { width: number; height: number; guides: SnapGuide[] };

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
  /** Resize snap resolver (sibling size-match) threaded into the node layers; absent = no resize snapping. */
  computeResizeSnap?: ComputeResizeSnap;
  /** Reports active guide lines during a drag (empty on release). Shared by move and resize — a node is never both at once. */
  onGuidesChange?: (guides: SnapGuide[]) => void;
  /** Guide lines to render inside the stage; empty = none (never present at export). */
  activeGuides?: SnapGuide[];
  /**
   * Registers/unregisters a node's root DOM element so BatchWorkspace can
   * live-measure it as a SNAP SIBLING (see siblingSnapBox). Only threaded
   * into TextNodeLayer — OverlayNode's width/height are always defined, so
   * it never needs DOM measurement.
   */
  registerNodeElement?: (id: NodeId, el: HTMLElement | null) => void;
}

/** Dashed-line color per non-solid guide kind: "spacing" (Phase 4) vs. "size" (Phase 4.5). */
const DASHED_GUIDE_COLOR: Record<"spacing" | "size", string> = {
  spacing: "#A855F7",
  size: "#0EA5E9",
};

/**
 * Style for one guide line. "spacing" (equal-spacing/distribution, Phase 4)
 * and "size" (resize sibling size-match, Phase 4.5) render as dashed lines,
 * each in a distinct color, vs. the solid edge/center lines (Phase 2/3) —
 * purely additive, the edge/center branch is unchanged.
 */
function guideLineStyle(guide: SnapGuide): CSSProperties {
  const dashedColor = guide.kind === "spacing" || guide.kind === "size" ? DASHED_GUIDE_COLOR[guide.kind] : undefined;
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
      // `border` (not `background`) is used for dashed guides because CSS
      // dashed patterns only render on borders, not on solid backgrounds.
      width: dashedColor ? 0 : 1,
      borderLeft: dashedColor ? `2px dashed ${dashedColor}` : undefined,
      background: dashedColor ? undefined : "#F43F5E",
    };
  }
  return {
    ...base,
    top: guide.position,
    left: 0,
    width: "100%",
    height: dashedColor ? 0 : 1,
    borderTop: dashedColor ? `2px dashed ${dashedColor}` : undefined,
    background: dashedColor ? undefined : "#F43F5E",
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
  computeResizeSnap,
  onGuidesChange,
  activeGuides,
  registerNodeElement,
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
              computeResizeSnap={computeResizeSnap}
              onGuidesChange={onGuidesChange}
              registerNodeElement={registerNodeElement}
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
              computeResizeSnap={computeResizeSnap}
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
