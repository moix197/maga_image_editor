"use client";

import type { TextNode, TextBackground } from "@maga/editor";
import { useRef, useState, useEffect, type PointerEvent as ReactPointerEvent } from "react";

interface TextNodeLayerProps {
  node: TextNode;
  onMove: (x: number, y: number) => void;
  onSelect: () => void;
  isSelected: boolean;
  onResize?: (width: number) => void;
  onContentChange?: (content: string) => void;
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

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function buildBackgroundSpanStyle(bg: TextBackground): React.CSSProperties {
  return {
    display: "block",
    width: "100%",
    backgroundColor: hexToRgba(bg.color, bg.opacity),
    padding: `${bg.paddingY}px ${bg.paddingX}px`,
    borderRadius: "2px",
    boxSizing: "border-box",
  };
}

export function TextNodeLayer({
  node,
  onMove,
  onSelect,
  isSelected,
  onResize,
  onContentChange,
}: TextNodeLayerProps) {
  const grabOffset = useRef({ dx: 0, dy: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  const resizeStart = useRef<{ clientX: number; width: number; parentW: number } | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const editableRef = useRef<HTMLDivElement>(null);

  // Step 6: Focus the contentEditable element and set initial text when edit mode activates.
  useEffect(() => {
    if (isEditing && editableRef.current) {
      const el = editableRef.current;
      // Uncontrolled: set initial text once — never updated by React again while editing.
      el.textContent = node.content;
      el.focus();
      // Place caret at end.
      const range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(false);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEditing]);

  // Step 12: Exit edit mode when the node is deselected.
  useEffect(() => {
    if (!isSelected && isEditing) {
      handleEditCommit();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSelected]);

  // Step 8: Commit on blur — read textContent back and notify parent.
  function handleEditCommit() {
    if (!editableRef.current) return;
    const newContent = editableRef.current.textContent ?? "";
    setIsEditing(false);
    onContentChange?.(newContent);
  }

  // Step 9: Esc commits; Enter allows newlines via default.
  function handleEditKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      handleEditCommit();
    }
  }

  // Step 3: Suppress move drag when editing.
  function handlePointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (isEditing) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    e.stopPropagation();
    const rect = (e.currentTarget.parentElement as HTMLElement).getBoundingClientRect();
    const originX = rect.left + (node.x / 100) * rect.width;
    const originY = rect.top + (node.y / 100) * rect.height;
    grabOffset.current = { dx: e.clientX - originX, dy: e.clientY - originY };
    onSelect();
  }

  function handlePointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    // Ignore moves while a resize drag is active — captured pointermove events
    // bubble up from the resize handle to this root handler.
    if (isEditing || resizeStart.current || e.buttons === 0) return;
    const rect = (e.currentTarget.parentElement as HTMLElement).getBoundingClientRect();
    const x = ((e.clientX - grabOffset.current.dx - rect.left) / rect.width) * 100;
    const y = ((e.clientY - grabOffset.current.dy - rect.top) / rect.height) * 100;
    onMove(Math.max(0, Math.min(100, x)), Math.max(0, Math.min(100, y)));
  }

  function handlePointerUp(e: ReactPointerEvent<HTMLDivElement>) {
    e.currentTarget.releasePointerCapture(e.pointerId);
  }

  // Step 5: Double-click enters edit mode.
  function handleDoubleClick(e: React.MouseEvent) {
    e.stopPropagation();
    // Guard: only enter edit if selected and node is visible.
    if (!isSelected) return;
    if (node.opacity === 0) return;
    setIsEditing(true);
  }

  function handleResizePointerDown(e: ReactPointerEvent<HTMLSpanElement>) {
    e.stopPropagation();
    const parentW = containerRef.current?.parentElement?.getBoundingClientRect().width ?? 1;
    resizeStart.current = {
      clientX: e.clientX,
      width: node.width ?? containerRef.current?.offsetWidth ?? 100,
      parentW,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function handleResizePointerMove(e: ReactPointerEvent<HTMLSpanElement>) {
    if (!resizeStart.current || e.buttons === 0) return;
    e.stopPropagation(); // keep the move handler from also firing during resize
    const dw = e.clientX - resizeStart.current.clientX;
    const newWidth = Math.max(20, resizeStart.current.width + dw);
    onResize?.(newWidth);
  }

  function handleResizePointerUp(e: ReactPointerEvent<HTMLSpanElement>) {
    e.stopPropagation();
    resizeStart.current = null;
    e.currentTarget.releasePointerCapture(e.pointerId);
  }

  const bg = node.textBackground;

  return (
    <div
      ref={containerRef}
      role="button"
      tabIndex={0}
      aria-label={`Text node: ${node.content}`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onDoubleClick={handleDoubleClick}
      style={{
        position: "absolute",
        left: `${node.x}%`,
        top: `${node.y}%`,
        transform: `rotate(${node.rotation}deg)`,
        transformOrigin: "50% 50%",
        fontSize: `${node.fontSize}px`,
        color: node.color,
        opacity: node.opacity,
        zIndex: node.zIndex + 10,
        // Step 4: Switch cursor and userSelect while editing.
        cursor: isEditing ? "text" : "move",
        userSelect: isEditing ? "text" : "none",
        whiteSpace: "pre-wrap",
        lineHeight: 1.2,
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
        ...(node.width !== undefined && { width: `${node.width}px` }),
      }}
    >
      {/* Step 7: Render contentEditable when editing, static content otherwise. */}
      {isEditing ? (
        <div
          ref={editableRef}
          contentEditable
          suppressContentEditableWarning
          onBlur={handleEditCommit}
          onKeyDown={handleEditKeyDown}
          style={{ outline: "none", minWidth: 20, whiteSpace: "pre-wrap" }}
          // Uncontrolled: initial text set via useEffect; React never touches textContent again.
        />
      ) : (
        bg ? (
          <span style={buildBackgroundSpanStyle(bg)}>{node.content}</span>
        ) : (
          node.content
        )
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
            top: "50%",
            transform: "translateY(-50%)",
            width: 12,
            height: 12,
            background: "#3b82f6",
            borderRadius: 2,
            cursor: "ew-resize",
            zIndex: 10,
          }}
        />
      )}
    </div>
  );
}
