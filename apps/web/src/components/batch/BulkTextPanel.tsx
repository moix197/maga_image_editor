'use client';

import { useState } from "react";
import { Lock, Unlock } from "lucide-react";
import { Collapsible } from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TextStylePanel } from "@/components/text-style-panel";
import type { TextNode } from "@maga/editor";
import type { ProjectAsset, TextStyle } from "@maga/projects";

interface BulkTextPanelProps {
  overlays: ProjectAsset[];
  textNodes: TextNode[];
  itemTextValues: Record<string, Record<string, string>>;
  itemTextStyles: Record<string, Record<string, Partial<TextStyle>>>;
  textLayerLocks: Record<string, boolean>;
  setItemTextValue: (overlayAssetId: string, textNodeId: string, value: string) => void;
  setItemTextStyle: (overlayAssetId: string, textNodeId: string, style: Partial<TextStyle>) => void;
  setTextLayerLock: (textNodeId: string, locked: boolean) => void;
}

// Returns a new Set with id added if missing, or removed if present.
function toggleId(set: Set<string>, id: string): Set<string> {
  const next = new Set(set);
  if (next.has(id)) {
    next.delete(id);
  } else {
    next.add(id);
  }
  return next;
}

// Collects the per-item value for nodeId across all selectedIds.
// If all values are identical → { value: thatValue, isMultiple: false }
// If values differ → { value: "", isMultiple: true }
function getBulkValue(
  selectedIds: Set<string>,
  nodeId: string,
  itemTextValues: Record<string, Record<string, string>>,
): { value: string; isMultiple: boolean } {
  const values = Array.from(selectedIds).map((id) => itemTextValues[id]?.[nodeId] ?? "");
  const first = values[0] ?? "";
  const allSame = values.every((v) => v === first);
  if (allSame) {
    return { value: first, isMultiple: false };
  }
  return { value: "", isMultiple: true };
}

/**
 * Merges per-item TextStyle overrides for a text node across selected overlay ids.
 *
 * For each field of TextStyle: if all selected items share the same value (or all
 * lack an override) → use that value. If values diverge → omit the field so the
 * style panel shows an empty / placeholder state for that control.
 *
 * Returns a Partial<TextStyle> — fields present = agreed value; fields absent = mixed.
 */
function getMergedStyle(
  selectedIds: Set<string>,
  nodeId: string,
  itemTextStyles: Record<string, Record<string, Partial<TextStyle>>>,
  baseNode: TextNode,
): Partial<TextStyle> {
  if (selectedIds.size === 0) return {};

  const ids = Array.from(selectedIds);
  const styleFields: (keyof TextStyle)[] = [
    "fontSize", "color", "opacity", "fontFamily", "fontWeight",
    "fontStyle", "rotation", "shadow", "textBackground",
  ];

  const merged: Partial<TextStyle> = {};
  for (const field of styleFields) {
    // Each item's effective value: override if present, else base node value.
    const values = ids.map((id) => {
      const override = itemTextStyles[id]?.[nodeId];
      return override !== undefined && field in override
        ? override[field]
        : baseNode[field];
    });
    const first = values[0];
    const allSame = values.every((v) => JSON.stringify(v) === JSON.stringify(first));
    if (allSame) {
      // Safe: field is a key of TextStyle which is a subset of TextNode fields
      (merged as Record<string, unknown>)[field] = first;
    }
    // Mixed: omit — style panel will show empty/uncontrolled state for that field
  }
  return merged;
}

/**
 * Builds a synthetic TextNode for the style panel display by merging the base
 * node with the merged per-item style override. Fields absent from the merged
 * style fall back to the base node's value.
 */
function buildDisplayNode(baseNode: TextNode, mergedStyle: Partial<TextStyle>): TextNode {
  return { ...baseNode, ...mergedStyle };
}

/**
 * Bulk text editor: one card per overlay item, one row per text layer.
 * Locked rows show the shared template value (input disabled).
 * Unlocked rows show per-item overrides (falling back to template value as placeholder).
 *
 * When overlays are selected via checkboxes, a Bulk Edit section appears above
 * the stacked cards to apply the same value to all selected items at once.
 * A per-node TextStylePanel appears in bulk edit mode to apply style overrides
 * to all selected unlocked items.
 */
export function BulkTextPanel({
  overlays,
  textNodes,
  itemTextValues,
  itemTextStyles,
  textLayerLocks,
  setItemTextValue,
  setItemTextStyle,
  setTextLayerLock,
}: BulkTextPanelProps) {
  const [selectedOverlayIds, setSelectedOverlayIds] = useState<Set<string>>(new Set());

  if (overlays.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No overlay items yet. Upload overlays in the Assets section.
      </p>
    );
  }

  if (textNodes.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No text layers in the template. Add text layers in the Template section.
      </p>
    );
  }

  const allSelected = overlays.length > 0 && selectedOverlayIds.size === overlays.length;
  const someSelected = selectedOverlayIds.size > 0 && !allSelected;

  function handleSelectAll() {
    if (allSelected) {
      setSelectedOverlayIds(new Set());
    } else {
      setSelectedOverlayIds(new Set(overlays.map((o) => o.id)));
    }
  }

  function handleToggleOverlay(id: string) {
    setSelectedOverlayIds((prev) => toggleId(prev, id));
  }

  function handleBulkChange(nodeId: string, value: string) {
    if (textLayerLocks[nodeId] ?? false) return;
    for (const id of selectedOverlayIds) {
      setItemTextValue(id, nodeId, value);
    }
  }

  function handleBulkStyleChange(nodeId: string, patch: Partial<TextNode>) {
    if (textLayerLocks[nodeId] ?? false) return;
    // TextStyle is a strict subset of TextNode — the patch only ever carries TextStyle fields.
    for (const id of selectedOverlayIds) {
      setItemTextStyle(id, nodeId, patch as Partial<TextStyle>);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Panel header: select-all + selection count */}
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          aria-label="Select all"
          checked={allSelected}
          ref={(el) => {
            if (el) el.indeterminate = someSelected;
          }}
          onChange={handleSelectAll}
          className="h-4 w-4 cursor-pointer rounded border-border accent-primary"
        />
        <span className="text-sm font-medium">Select all</span>
        {selectedOverlayIds.size > 0 && (
          <span className="text-xs text-muted-foreground ml-auto">
            {selectedOverlayIds.size} of {overlays.length} selected
          </span>
        )}
      </div>

      {/* Bulk edit section — only when something is selected */}
      {selectedOverlayIds.size > 0 && (
        <div
          className="flex flex-col gap-3 rounded-lg border border-border bg-muted/40 p-4"
          aria-label="Bulk edit section"
        >
          <h3 className="text-sm font-semibold tracking-tight">Bulk Edit</h3>
          {textNodes.map((node, i) => {
            const locked = textLayerLocks[node.id] ?? false;
            const { value, isMultiple } = getBulkValue(selectedOverlayIds, node.id, itemTextValues);
            const bulkInputId = `bulk-edit-${node.id}`;
            const mergedStyle = getMergedStyle(selectedOverlayIds, node.id, itemTextStyles, node);
            const displayNode = buildDisplayNode(node, mergedStyle);
            return (
              <div key={node.id} className="flex flex-col gap-2">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={bulkInputId} className="text-xs text-muted-foreground shrink-0">
                    Text layer {i + 1}
                  </Label>
                  <div className="flex items-center gap-2">
                    <Input
                      id={bulkInputId}
                      value={value}
                      disabled={locked}
                      placeholder={isMultiple ? "(multiple values)" : node.content}
                      className="flex-1 transition-colors duration-150"
                      onChange={(e) => handleBulkChange(node.id, e.target.value)}
                      aria-label={
                        locked
                          ? `Bulk edit text layer ${i + 1} (locked)`
                          : `Bulk edit text layer ${i + 1}`
                      }
                    />
                    {locked && <Lock className="size-4 text-muted-foreground shrink-0" />}
                  </div>
                </div>
                <TextStylePanel
                  node={displayNode}
                  onChange={(patch) => handleBulkStyleChange(node.id, patch)}
                  onDelete={() => undefined}
                  onReorder={() => undefined}
                  hideControls
                  disabled={locked}
                  className={`flex flex-col gap-4 rounded-lg border border-border bg-card p-4${
                    locked ? " pointer-events-none opacity-50" : ""
                  }`}
                />
              </div>
            );
          })}
        </div>
      )}

      {/* Stacked cards — always visible */}
      {overlays.map((overlay) => (
        <OverlayTextCard
          key={overlay.id}
          overlay={overlay}
          textNodes={textNodes}
          itemTextValues={itemTextValues}
          textLayerLocks={textLayerLocks}
          selected={selectedOverlayIds.has(overlay.id)}
          onToggleSelect={() => handleToggleOverlay(overlay.id)}
          setItemTextValue={setItemTextValue}
          setTextLayerLock={setTextLayerLock}
        />
      ))}
    </div>
  );
}

interface OverlayTextCardProps {
  overlay: ProjectAsset;
  textNodes: TextNode[];
  itemTextValues: Record<string, Record<string, string>>;
  textLayerLocks: Record<string, boolean>;
  selected: boolean;
  onToggleSelect: () => void;
  setItemTextValue: (overlayAssetId: string, textNodeId: string, value: string) => void;
  setTextLayerLock: (textNodeId: string, locked: boolean) => void;
}

function OverlayTextCard({
  overlay,
  textNodes,
  itemTextValues,
  textLayerLocks,
  selected,
  onToggleSelect,
  setItemTextValue,
  setTextLayerLock,
}: OverlayTextCardProps) {
  const header = (
    <div className="flex items-center gap-2 min-w-0">
      {/* Stop propagation so clicking the checkbox doesn't toggle the collapsible */}
      <span onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
        <input
          type="checkbox"
          aria-label={`Select ${overlay.filename}`}
          checked={selected}
          onChange={onToggleSelect}
          className="h-4 w-4 cursor-pointer rounded border-border accent-primary"
        />
      </span>
      <span className="text-sm font-semibold tracking-tight truncate" title={overlay.filename}>
        {overlay.filename}
      </span>
    </div>
  );

  return (
    <div
      className="flex flex-col rounded-lg border border-border bg-card shadow-sm"
      aria-label={`Text layers for ${overlay.filename}`}
    >
      <Collapsible title={header} defaultOpen className="px-4 pt-3 pb-3">
        <div className="flex flex-col gap-3 pt-2">
          {textNodes.map((node, i) => (
            <TextLayerRow
              key={node.id}
              overlayAssetId={overlay.id}
              overlayFilename={overlay.filename}
              node={node}
              index={i}
              locked={textLayerLocks[node.id] ?? false}
              perItemValue={itemTextValues[overlay.id]?.[node.id] ?? ""}
              setItemTextValue={setItemTextValue}
              setTextLayerLock={setTextLayerLock}
            />
          ))}
        </div>
      </Collapsible>
    </div>
  );
}

interface TextLayerRowProps {
  overlayAssetId: string;
  overlayFilename: string;
  node: TextNode;
  index: number;
  locked: boolean;
  perItemValue: string;
  setItemTextValue: (overlayAssetId: string, textNodeId: string, value: string) => void;
  setTextLayerLock: (textNodeId: string, locked: boolean) => void;
}

function TextLayerRow({
  overlayAssetId,
  overlayFilename,
  node,
  index,
  locked,
  perItemValue,
  setItemTextValue,
  setTextLayerLock,
}: TextLayerRowProps) {
  const inputId = `bulk-text-${overlayAssetId}-${node.id}`;

  // Locked: show shared template value; input disabled.
  // Unlocked: show per-item override; fall back to template value as placeholder.
  const value = locked ? node.content : perItemValue;
  const placeholder = locked ? undefined : node.content;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={inputId} className="text-xs text-muted-foreground shrink-0">
          Text layer {index + 1}
        </Label>
        {/* Style preview: font, size, color — read-only display context, not an editable field */}
        <span
          className="text-xs text-muted-foreground truncate"
          style={{ fontFamily: node.fontFamily, color: node.color }}
          aria-hidden="true"
        >
          {node.fontFamily} · {node.fontSize}px
        </span>
      </div>

      <div className="flex items-center gap-2">
        <Input
          id={inputId}
          value={value}
          disabled={locked}
          placeholder={placeholder}
          className="flex-1 transition-colors duration-150"
          onChange={(e) => setItemTextValue(overlayAssetId, node.id, e.target.value)}
          aria-label={`Text layer ${index + 1} for ${overlayFilename}`}
        />
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="shrink-0 cursor-pointer transition-colors duration-150"
          aria-label={
            locked
              ? `Unlock layer ${index + 1} (edit per item)`
              : `Lock layer ${index + 1} (share across items)`
          }
          aria-pressed={locked}
          onClick={() => setTextLayerLock(node.id, !locked)}
        >
          {locked ? <Lock className="size-4" /> : <Unlock className="size-4" />}
        </Button>
      </div>
    </div>
  );
}
