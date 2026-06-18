"use client";

import type { TextNode, TextBackground } from "@maga/editor";
import { useRef, type PointerEvent as ReactPointerEvent } from "react";

interface TextNodeLayerProps {
  node: TextNode;
  onMove: (x: number, y: number) => void;
  onSelect: () => void;
  isSelected: boolean;
}

/** Maps FONT_FAMILIES names to their CSS variable so next/font loads them. */
const FONT_FAMILY_VAR: Record<string, string> = {
  Inter: "var(--font-inter)",
  Roboto: "var(--font-roboto)",
  "Playfair Display": "var(--font-playfair-display)",
  Oswald: "var(--font-oswald)",
  Merriweather: "var(--font-merriweather)",
  "Dancing Script": "var(--font-dancing-script)",
};

function resolveFontFamily(name: string): string {
  return FONT_FAMILY_VAR[name] ?? name;
}

function buildTextShadow(node: TextNode): string {
  if (!node.shadow) return "none";
  const { color, blur, offsetX, offsetY } = node.shadow;
  return `${offsetX}px ${offsetY}px ${blur}px ${color}`;
}

function buildBackgroundSpanStyle(bg: TextBackground): React.CSSProperties {
  return {
    backgroundColor: bg.color,
    opacity: bg.opacity,
    padding: `${bg.paddingY}px ${bg.paddingX}px`,
    borderRadius: "2px",
  };
}

export function TextNodeLayer({ node, onMove, onSelect, isSelected }: TextNodeLayerProps) {
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

  const bg = node.textBackground;

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
        fontFamily: resolveFontFamily(node.fontFamily),
        fontWeight: node.fontWeight,
        fontStyle: node.fontStyle,
        textShadow: buildTextShadow(node),
        letterSpacing: "0.02em",
        // Selection outline is applied only for interactive display, not during export.
        // Export clears selectedNodeId before capture (see page.tsx handleExport).
        outline: isSelected ? "2px solid #2563EB" : "none",
        outlineOffset: "4px",
        backdropFilter: bg && bg.blur > 0 ? `blur(${bg.blur}px)` : undefined,
      }}
    >
      {bg ? (
        <span style={buildBackgroundSpanStyle(bg)}>{node.content}</span>
      ) : (
        node.content
      )}
    </div>
  );
}
