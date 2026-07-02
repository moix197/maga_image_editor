"use client";

import type { OverlayNode, BorderOverlay, SnapBox, SnapGuide } from "@maga/editor";
import { useRef, type PointerEvent as ReactPointerEvent } from "react";
import { buildFeatherMaskCss, withAlpha } from "@/lib/css-helpers";

/** Resolves a dragged node's snapped position + active guide lines; injected by BatchWorkspace. */
type ComputeSnap = (
  box: SnapBox,
  canvasSize: { width: number; height: number },
) => { x: number; y: number; guides: SnapGuide[] };

interface OverlayNodeLayerProps {
  node: OverlayNode;
  onMove: (x: number, y: number) => void;
  onResize: (width: number, height: number) => void;
  onSelect: () => void;
  isSelected: boolean;
  /** Current viewport zoom scale (1 = 100%); raw pixel-delta resize math divides by this. */
  zoomScale?: number;
  /** Snap resolver (image/canvas edges + centers); absent = no snapping. */
  computeSnap?: ComputeSnap;
  /** Reports the guide lines to render during this drag (empty on release). */
  onGuidesChange?: (guides: SnapGuide[]) => void;
}

/**
 * Each image overlay's intrinsic (natural) W:H ratio, captured once per node id when
 * its <img> loads (see `recordIntrinsicRatio` below). Module-scoped rather than
 * component or React state so both resize paths — this component's corner-drag handle
 * and the Size-input lock in overlay-controls-panel.tsx (plus BatchWorkspace's
 * handleNodeResize) — can read a node's ratio without threading it through every
 * intermediate component. Not persisted: cheap to re-derive each session from the
 * already-loaded image. See .ai/decisions/aspect-ratio-intrinsic-lock.md.
 */
const intrinsicRatios = new Map<string, number>();

export function getIntrinsicRatio(nodeId: string): number | undefined {
  return intrinsicRatios.get(nodeId);
}

export function recordIntrinsicRatio(nodeId: string, naturalWidth: number, naturalHeight: number): void {
  if (naturalWidth > 0 && naturalHeight > 0) {
    intrinsicRatios.set(nodeId, naturalWidth / naturalHeight);
  }
}

/**
 * Width-drives-height: when `ratio` is known, derives height from width; otherwise
 * (lock off, or ratio not captured yet) returns the dimensions unconstrained. Floors
 * the driving dimension (width) at 20px; the derived height is left unfloored so the
 * exact intrinsic ratio is preserved even for extreme ratios at small widths. When
 * unlocked, both dimensions are floored at 20px independently. Shared by this
 * component's drag handler and BatchWorkspace's handleNodeResize fan-out write.
 */
export function constrainResizeToRatio(
  width: number,
  height: number,
  ratio: number | undefined,
): { width: number; height: number } {
  const w = Math.max(20, width);
  if (ratio === undefined) return { width: w, height: Math.max(20, height) };
  return { width: w, height: w / ratio };
}

function buildDropShadowFilter(node: OverlayNode): string | undefined {
  const s = node.dropShadow;
  if (!s) return undefined;
  return `drop-shadow(${s.x}px ${s.y}px ${s.blur}px ${withAlpha(s.color, s.opacity)})`;
}

/** CSS feather-mask props (all four edges fade inward) when featherRadius > 0. */
function buildFeatherMaskStyle(node: OverlayNode): React.CSSProperties {
  const mask = buildFeatherMaskCss(node.featherRadius ?? 0, node.width, node.height);
  if (!mask) return {};
  return {
    maskImage: mask,
    WebkitMaskImage: mask,
    maskComposite: "intersect",
    WebkitMaskComposite: "source-in",
  };
}

function buildOverlayStyle(node: OverlayNode): React.CSSProperties {
  const isBorder = node.overlayType === "border";
  const b = isBorder ? (node as BorderOverlay) : null;
  return {
    position: "absolute",
    left: `${node.x}%`,
    top: `${node.y}%`,
    width: `${node.width}px`,
    height: `${node.height}px`,
    opacity: node.opacity,
    zIndex: node.zIndex + 10,
    cursor: "move",
    userSelect: "none",
    boxSizing: "border-box",
    ...(isBorder && b
      ? {
          border: `${b.borderWidth}px ${b.borderStyle} ${b.borderColor}`,
          borderRadius: `${b.borderRadius}px`,
          background: "transparent",
        }
      : {
          // Corner-radius clip + feather mask live on the <img>, NOT here, so the
          // resize handle (positioned outside the box) is never clipped away.
          transform: `rotate(${node.rotation ?? 0}deg)`,
          filter: buildDropShadowFilter(node),
        }),
  };
}

/** Style for the overlay <img>: fills the box, with corner-radius clip + feather mask. */
function buildOverlayImageStyle(node: OverlayNode): React.CSSProperties {
  return {
    width: "100%",
    height: "100%",
    objectFit: "contain",
    display: "block",
    pointerEvents: "none",
    borderRadius: `${node.cornerRadius ?? 0}px`,
    overflow: "hidden",
    ...buildFeatherMaskStyle(node),
  };
}

export function OverlayNodeLayer({
  node,
  onMove,
  onResize,
  onSelect,
  isSelected,
  zoomScale = 1,
  computeSnap,
  onGuidesChange,
}: OverlayNodeLayerProps) {
  const grabOffset = useRef({ dx: 0, dy: 0 });
  const resizing = useRef(false);
  const resizeStart = useRef({ clientX: 0, clientY: 0, width: 0, height: 0 });

  function handlePointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (resizing.current) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    e.stopPropagation();
    const rect = (e.currentTarget.parentElement as HTMLElement).getBoundingClientRect();
    const anchorX = rect.left + (node.x / 100) * rect.width;
    const anchorY = rect.top + (node.y / 100) * rect.height;
    grabOffset.current = { dx: e.clientX - anchorX, dy: e.clientY - anchorY };
    onSelect();
  }

  function handlePointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    if (e.buttons === 0 || resizing.current) return;
    const rect = (e.currentTarget.parentElement as HTMLElement).getBoundingClientRect();
    const rawX = Math.max(0, Math.min(100, ((e.clientX - grabOffset.current.dx - rect.left) / rect.width) * 100));
    const rawY = Math.max(0, Math.min(100, ((e.clientY - grabOffset.current.dy - rect.top) / rect.height) * 100));
    if (!computeSnap) {
      onMove(rawX, rawY);
      return;
    }
    // OverlayNode width/height are always defined (canvas-space px), so build the
    // SnapBox directly from them — no DOM measurement needed (unlike TextNode).
    const canvasWidth = rect.width / zoomScale;
    const canvasHeight = rect.height / zoomScale;
    const box: SnapBox = {
      x: (rawX / 100) * canvasWidth,
      y: (rawY / 100) * canvasHeight,
      width: node.width,
      height: node.height,
    };
    const snapped = computeSnap(box, { width: canvasWidth, height: canvasHeight });
    onGuidesChange?.(snapped.guides);
    // resolveSnap returns canvas-space px (same frame as `box`) — convert back
    // to percent before calling onMove, which everywhere else takes percent
    // (see the `onMove(rawX, rawY)` fallback above and `node.x`/`node.y`).
    onMove((snapped.x / canvasWidth) * 100, (snapped.y / canvasHeight) * 100);
  }

  function handlePointerUp(e: ReactPointerEvent<HTMLDivElement>) {
    e.currentTarget.releasePointerCapture(e.pointerId);
    onGuidesChange?.([]);
  }

  function handleResizePointerDown(e: ReactPointerEvent<HTMLSpanElement>) {
    e.stopPropagation();
    resizing.current = true;
    resizeStart.current = { clientX: e.clientX, clientY: e.clientY, width: node.width, height: node.height };
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function handleResizePointerMove(e: ReactPointerEvent<HTMLSpanElement>) {
    if (!resizing.current || e.buttons === 0) return;
    // Raw client-pixel deltas must be converted to canvas-space by dividing by
    // the current zoom scale — see text-node-layer.tsx's handleResizePointerMove.
    const dw = (e.clientX - resizeStart.current.clientX) / zoomScale;
    const dh = (e.clientY - resizeStart.current.clientY) / zoomScale;
    const ratio = node.aspectRatioLocked ? getIntrinsicRatio(node.id) : undefined;
    const { width, height } = constrainResizeToRatio(
      resizeStart.current.width + dw,
      resizeStart.current.height + dh,
      ratio,
    );
    onResize(width, height);
  }

  function handleResizePointerUp(e: ReactPointerEvent<HTMLSpanElement>) {
    resizing.current = false;
    e.currentTarget.releasePointerCapture(e.pointerId);
  }

  const isImage = node.overlayType === "image";

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={isImage ? "Image overlay" : "Border overlay"}
      {...(isImage ? { "data-post-pass": "true", "data-overlay": JSON.stringify(node) } : {})}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      style={{
        ...buildOverlayStyle(node),
        outline: isSelected ? "2px solid #2563EB" : "none",
        outlineOffset: "2px",
      }}
    >
      {isImage && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={node.src}
          alt="Image overlay"
          style={buildOverlayImageStyle(node)}
          onLoad={(e) =>
            recordIntrinsicRatio(node.id, e.currentTarget.naturalWidth, e.currentTarget.naturalHeight)
          }
        />
      )}
      {isSelected && (
        <span
          aria-label="Resize handle"
          onPointerDown={handleResizePointerDown}
          onPointerMove={handleResizePointerMove}
          onPointerUp={handleResizePointerUp}
          style={{
            position: "absolute",
            right: -6,
            bottom: -6,
            width: 12,
            height: 12,
            background: "#2563EB",
            borderRadius: 2,
            cursor: "se-resize",
            zIndex: 1,
          }}
        />
      )}
    </div>
  );
}
