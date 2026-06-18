"use client";

import type { TextNode } from "@maga/editor";
import { useRef, type PointerEvent as ReactPointerEvent } from "react";

interface TextNodeLayerProps {
  node: TextNode;
  onMove: (x: number, y: number) => void;
  onSelect: () => void;
}

export function TextNodeLayer({ node, onMove, onSelect }: TextNodeLayerProps) {
  // Offset (px) from the cursor to the node center at grab time, so dragging
  // doesn't teleport the node center onto the cursor.
  const grabOffset = useRef({ dx: 0, dy: 0 });

  function handlePointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    const rect = (e.currentTarget.parentElement as HTMLElement).getBoundingClientRect();
    const centerX = rect.left + (node.x / 100) * rect.width;
    const centerY = rect.top + (node.y / 100) * rect.height;
    grabOffset.current = { dx: e.clientX - centerX, dy: e.clientY - centerY };
    onSelect();
  }

  function handlePointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    if (e.buttons === 0) return;
    const rect = (e.currentTarget.parentElement as HTMLElement).getBoundingClientRect();
    const x = ((e.clientX - grabOffset.current.dx - rect.left) / rect.width) * 100;
    const y = ((e.clientY - grabOffset.current.dy - rect.top) / rect.height) * 100;
    onMove(Math.max(0, Math.min(100, x)), Math.max(0, Math.min(100, y)));
  }

  function handlePointerUp(e: ReactPointerEvent<HTMLDivElement>) {
    e.currentTarget.releasePointerCapture(e.pointerId);
  }

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`Text node: ${node.content}`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      style={{
        position: "absolute",
        left: `${node.x}%`,
        top: `${node.y}%`,
        transform: `translate(-50%, -50%) rotate(${node.rotation}deg)`,
        fontSize: `${node.fontSize}px`,
        color: node.color,
        opacity: node.opacity,
        zIndex: node.zIndex + 10,
        cursor: "move",
        userSelect: "none",
        whiteSpace: "nowrap",
        textShadow: "0 1px 3px rgba(0,0,0,0.6)",
        fontWeight: 600,
        letterSpacing: "0.02em",
      }}
    >
      {node.content}
    </div>
  );
}
