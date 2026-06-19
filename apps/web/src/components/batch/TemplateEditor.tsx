"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useEditorState } from "@/hooks/use-editor-state";
import { TextOverlayCanvas } from "@/components/text-overlay-canvas";
import { OverlayControlsPanel } from "@/components/overlay-controls-panel";
import { Button } from "@/components/ui/button";
import { isOverlayNode } from "@maga/editor";
import type { EditorState, NodeId, OverlayNode } from "@maga/editor";
import type { VariableSlot } from "@maga/projects";

interface TemplateEditorProps {
  backgroundSrc: string;
  onSave: (editorState: EditorState, slot: VariableSlot) => void;
}

/**
 * Template editor: user places the variable image slot on the background then
 * saves. "Add Variable Slot" is disabled once a slot exists (one slot per template).
 * The slot is visually distinguished with a dashed amber border + "VARIABLE SLOT" label.
 */
export function TemplateEditor({ backgroundSrc, onSave }: TemplateEditorProps) {
  const { state, addOverlayNode, updateOverlayNode, removeNode, reorderNode } = useEditorState();
  const [selectedNodeId, setSelectedNodeId] = useState<NodeId | null>(null);
  // Tracks which overlay node is the variable slot (first overlay added in this editor).
  const [variableSlotId, setVariableSlotId] = useState<NodeId | null>(null);
  const prevNodeCount = useRef(state.nodes.length);
  const canvasElRef = useRef<HTMLDivElement | null>(null);
  const canvasCallbackRef = useCallback((el: HTMLDivElement | null) => { canvasElRef.current = el; }, []);

  // After addOverlayNode causes a state update, find the newly added node by highest zIndex.
  useEffect(() => {
    if (variableSlotId !== null) return;
    const overlays = state.nodes.filter(isOverlayNode) as OverlayNode[];
    if (overlays.length === 0) return;
    if (state.nodes.length <= prevNodeCount.current) return;
    prevNodeCount.current = state.nodes.length;
    const newest = overlays.reduce((a, b) => (b.zIndex > a.zIndex ? b : a));
    setVariableSlotId(newest.id);
  }, [state.nodes, variableSlotId]);

  function handleAddVariableSlot() {
    prevNodeCount.current = state.nodes.length;
    addOverlayNode({ src: "", x: 10, y: 10, width: 200, height: 200 });
  }

  function handleNodeMove(id: string, x: number, y: number) {
    updateOverlayNode(id as NodeId, { x, y });
  }

  function handleNodeResize(id: string, width: number, height: number) {
    updateOverlayNode(id as NodeId, { width, height });
  }

  function handleSave() {
    const slotNode = getSlotNode();
    if (!slotNode) return;
    onSave(state, {
      overlayNodeId: slotNode.id,
      width: slotNode.width,
      height: slotNode.height,
    });
  }

  function getSlotNode(): OverlayNode | null {
    if (!variableSlotId) return null;
    const node = state.nodes.find((n) => n.id === variableSlotId);
    return node && isOverlayNode(node) ? (node as OverlayNode) : null;
  }

  const selectedNode = selectedNodeId
    ? (state.nodes.find((n) => n.id === selectedNodeId) ?? null)
    : null;
  const isSelectedOverlay = selectedNode !== null && isOverlayNode(selectedNode);
  const slotNode = getSlotNode();

  return (
    <div className="flex gap-4">
      <div className="flex flex-col gap-3">
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={variableSlotId !== null}
            onClick={handleAddVariableSlot}
          >
            Add Variable Slot
          </Button>
          <Button
            variant="default"
            size="sm"
            disabled={slotNode === null}
            onClick={handleSave}
          >
            Save Template
          </Button>
        </div>

        <div style={{ position: "relative" }} onPointerDown={() => setSelectedNodeId(null)}>
          <TextOverlayCanvas
            state={state}
            onNodeMove={handleNodeMove}
            onNodeResize={handleNodeResize}
            onNodeSelect={(id) => setSelectedNodeId(id as NodeId)}
            selectedNodeId={selectedNodeId}
            canvasCallbackRef={canvasCallbackRef}
            imageSrc={backgroundSrc}
          />
          {slotNode && <VariableSlotMarker node={slotNode} />}
        </div>
      </div>

      {isSelectedOverlay && (
        <OverlayControlsPanel
          node={selectedNode as OverlayNode}
          onChange={(patch) => updateOverlayNode(selectedNodeId!, patch)}
          onDelete={() => {
            if (selectedNodeId === variableSlotId) setVariableSlotId(null);
            removeNode(selectedNodeId!);
            setSelectedNodeId(null);
          }}
          onReorder={(dir) => reorderNode(selectedNodeId!, dir)}
        />
      )}
    </div>
  );
}

/** Dashed amber outline + label that marks the variable image slot on the canvas. */
function VariableSlotMarker({ node }: { node: OverlayNode }) {
  return (
    <div
      aria-label="Variable image slot"
      style={{
        position: "absolute",
        left: `${node.x}%`,
        top: `${node.y}%`,
        width: node.width,
        height: node.height,
        border: "2px dashed #f59e0b",
        borderRadius: node.cornerRadius ?? 0,
        boxSizing: "border-box",
        pointerEvents: "none",
        zIndex: node.zIndex + 20,
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "flex-start",
        padding: 4,
      }}
    >
      <span
        style={{
          fontSize: 10,
          fontWeight: 600,
          color: "#f59e0b",
          background: "rgba(0,0,0,0.55)",
          borderRadius: 3,
          padding: "1px 4px",
          letterSpacing: "0.04em",
        }}
      >
        VARIABLE SLOT
      </span>
    </div>
  );
}
