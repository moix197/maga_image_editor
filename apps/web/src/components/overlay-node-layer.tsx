"use client";

import type { OverlayNode, BorderOverlay } from "@maga/editor";
import { useRef, type PointerEvent as ReactPointerEvent } from "react";

interface OverlayNodeLayerProps {
  node: OverlayNode;
  onMove: (x: number, y: number) => void;
  onResize: (width: number, height: number) => void;
  onSelect: () => void;
  isSelected: boolean;
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
      : {}),
  };
}

export function OverlayNodeLayer({
  node,
  onMove,
  onResize,
  onSelect,
  isSelected,
}: OverlayNodeLayerProps) {
  const grabOffset = useRef({ dx: 0, dy: 0 });
  const resizing = useRef(false);
  const resizeStart = useRef({ clientX: 0, clientY: 0, width: 0, height: 0 });

  function handlePointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (resizing.current) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    e.stopPropagation();
    const rect = (e.currentTarget.parentElement as HTMLElement).getBoundingClientRect();
    const centerX = rect.left + (node.x / 100) * rect.width;
    const centerY = rect.top + (node.y / 100) * rect.height;
    grabOffset.current = { dx: e.clientX - centerX, dy: e.clientY - centerY };
    onSelect();
  }

  function handlePointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    if (e.buttons === 0 || resizing.current) return;
    const rect = (e.currentTarget.parentElement as HTMLElement).getBoundingClientRect();
    const x = ((e.clientX - grabOffset.current.dx - rect.left) / rect.width) * 100;
    const y = ((e.clientY - grabOffset.current.dy - rect.top) / rect.height) * 100;
    onMove(Math.max(0, Math.min(100, x)), Math.max(0, Math.min(100, y)));
  }

  function handlePointerUp(e: ReactPointerEvent<HTMLDivElement>) {
    e.currentTarget.releasePointerCapture(e.pointerId);
  }

  function handleResizePointerDown(e: ReactPointerEvent<HTMLSpanElement>) {
    e.stopPropagation();
    resizing.current = true;
    resizeStart.current = { clientX: e.clientX, clientY: e.clientY, width: node.width, height: node.height };
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function handleResizePointerMove(e: ReactPointerEvent<HTMLSpanElement>) {
    if (!resizing.current || e.buttons === 0) return;
    const dw = e.clientX - resizeStart.current.clientX;
    const dh = e.clientY - resizeStart.current.clientY;
    onResize(Math.max(20, resizeStart.current.width + dw), Math.max(20, resizeStart.current.height + dh));
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
          style={{ width: "100%", height: "100%", objectFit: "contain", display: "block", pointerEvents: "none" }}
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
