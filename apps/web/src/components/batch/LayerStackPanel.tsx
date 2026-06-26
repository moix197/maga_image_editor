"use client";

import { useState } from "react";
import { GripVertical } from "lucide-react";
import type { EditorNode, NodeId } from "@maga/editor";
import { isTextNode } from "@maga/editor";

interface LayerStackPanelProps {
  nodes: EditorNode[];
  onReorderNode: (id: NodeId, direction: "up" | "down") => void;
  selectedNodeId: NodeId | null;
  onSelectNode: (id: NodeId) => void;
}

function nodeLabel(node: EditorNode): string {
  if (isTextNode(node)) {
    const truncated = node.content.length > 20 ? node.content.slice(0, 20) + "…" : node.content;
    return `Text: ${truncated}`;
  }
  return node.overlayType === "border" ? "Border" : "Image Overlay";
}

export function LayerStackPanel({ nodes, onReorderNode, selectedNodeId, onSelectNode }: LayerStackPanelProps) {
  const [dragSrcIdx, setDragSrcIdx] = useState<number | null>(null);
  const [dropTargetIdx, setDropTargetIdx] = useState<number | null>(null);

  if (nodes.length === 0) return null;

  // Sorted descending: highest zIndex first (visually on top)
  const sorted = [...nodes].sort((a, b) => b.zIndex - a.zIndex);

  function handleDragStart(idx: number) {
    setDragSrcIdx(idx);
  }

  function handleDragOver(e: React.DragEvent, idx: number) {
    e.preventDefault();
    setDropTargetIdx(idx);
  }

  function handleDragLeave() {
    setDropTargetIdx(null);
  }

  function handleDrop(e: React.DragEvent, targetIdx: number) {
    e.preventDefault();
    setDropTargetIdx(null);
    const src = dragSrcIdx;
    setDragSrcIdx(null);
    if (src === null || src === targetIdx) return;

    const nodeId = sorted[src]!.id;
    // In the descending-sorted list:
    // moving from a lower index to a higher index = moving "down" in zIndex
    // moving from a higher index to a lower index = moving "up" in zIndex
    const steps = Math.abs(targetIdx - src);
    const direction: "up" | "down" = targetIdx > src ? "down" : "up";
    for (let i = 0; i < steps; i++) {
      onReorderNode(nodeId, direction);
    }
  }

  function handleDragEnd() {
    setDragSrcIdx(null);
    setDropTargetIdx(null);
  }

  return (
    <section className="flex flex-col gap-2">
      <div>
        <h2 className="text-sm font-semibold tracking-tight">Layer Stack</h2>
        <p className="text-xs text-muted-foreground">Drag to reorder layers (top = front).</p>
      </div>
      <div className="flex flex-col gap-1 rounded-lg border border-border bg-card p-2">
        {sorted.map((node, idx) => (
          <div
            key={node.id}
            draggable
            role="button"
            tabIndex={0}
            aria-pressed={node.id === selectedNodeId}
            aria-label={`${nodeLabel(node)}, click to select, drag to reorder layer`}
            onClick={() => onSelectNode(node.id)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onSelectNode(node.id);
              }
            }}
            onDragStart={() => handleDragStart(idx)}
            onDragOver={(e) => handleDragOver(e, idx)}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, idx)}
            onDragEnd={handleDragEnd}
            className={[
              "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors",
              "cursor-grab active:cursor-grabbing select-none",
              dropTargetIdx === idx && dragSrcIdx !== idx
                ? "bg-primary/10 ring-2 ring-primary"
                : node.id === selectedNodeId
                  ? "bg-primary/10 ring-1 ring-primary"
                  : "hover:bg-muted",
            ].join(" ")}
          >
            <GripVertical className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            <span className="truncate flex-1">{nodeLabel(node)}</span>
            <span className="text-xs text-muted-foreground tabular-nums">z:{node.zIndex}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
