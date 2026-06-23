"use client";

import { useMemo } from "react";
import { isTextNode } from "@maga/editor";
import type { EditorState, NodeId } from "@maga/editor";
import type { TextStyle } from "@maga/projects";

type ItemTextValues = Record<string, Record<string, string>>;
type ItemTextStyles = Record<string, Record<string, Partial<TextStyle>>>;
type ItemHiddenNodeIds = Record<string, string[]>;

/**
 * Returns a memoized derived EditorState with per-item text and style overrides
 * applied to every text layer for the active overlay variant.
 *
 * - Every text layer is per-item (the lock model was retired in schema v4); a
 *   layer with no override for the active variant retains the template value.
 * - Text nodes hidden for the active overlay via `itemHiddenNodeIds` are
 *   excluded from the derived node list entirely (Phase 4).
 * - The base EditorState is never mutated.
 * - When activeOverlayId is null AND there is no slot swap pending, base is
 *   returned as-is (no copy).
 * - When variableSlotNodeId + activeOverlayBlobKey are provided, the variable-slot
 *   overlay node's src is synchronously swapped to reflect the active variant image.
 */
export function usePreviewEditorState(
  base: EditorState,
  activeOverlayId: string | null,
  itemTextValues: ItemTextValues,
  itemTextStyles: ItemTextStyles,
  itemHiddenNodeIds: ItemHiddenNodeIds,
  variableSlotNodeId?: NodeId | null,
  activeOverlayBlobKey?: string | null,
): EditorState {
  return useMemo(() => {
    const hiddenIds = activeOverlayId ? (itemHiddenNodeIds[activeOverlayId] ?? []) : [];

    // Determine whether a slot-src swap is needed.
    const slotNode = variableSlotNodeId
      ? base.nodes.find((n) => n.id === variableSlotNodeId)
      : undefined;
    const needsSlotSwap =
      slotNode !== undefined &&
      activeOverlayBlobKey != null &&
      activeOverlayBlobKey !== "" &&
      !isTextNode(slotNode) &&
      (slotNode as { src?: string }).src !== activeOverlayBlobKey;

    const hasHidden = hiddenIds.length > 0;

    // Nothing to do at all.
    if (activeOverlayId === null && !needsSlotSwap && !hasHidden) return base;

    const perItemValues = activeOverlayId ? itemTextValues[activeOverlayId] : undefined;
    const perItemStyles = activeOverlayId ? itemTextStyles[activeOverlayId] : undefined;

    // If neither text map has entries AND no slot swap AND no hidden nodes, skip.
    if (!perItemValues && !perItemStyles && !needsSlotSwap && !hasHidden) return base;

    const derivedNodes = base.nodes
      .filter((node) => {
        // Hidden text nodes are excluded from the preview for the active variant.
        if (isTextNode(node) && hiddenIds.includes(node.id as string)) return false;
        return true;
      })
      .map((node) => {
        // Variable-slot overlay node: swap src to the active variant's image.
        if (needsSlotSwap && node.id === variableSlotNodeId) {
          return { ...node, src: activeOverlayBlobKey };
        }

        if (!isTextNode(node)) return node;

        const contentOverride = perItemValues?.[node.id];
        const styleOverride = perItemStyles?.[node.id];

        if (contentOverride === undefined && !styleOverride) return node;

        // Fallback to the live node.content (not a template snapshot) is deliberate:
        // the base node IS the template, so the two are equivalent.

        return {
          ...node,
          ...(contentOverride !== undefined ? { content: contentOverride } : {}),
          ...(styleOverride ?? {}),
        };
      });

    return { ...base, nodes: derivedNodes };
  }, [base, activeOverlayId, itemTextValues, itemTextStyles, itemHiddenNodeIds, variableSlotNodeId, activeOverlayBlobKey]);
}
