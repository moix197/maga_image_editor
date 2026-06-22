"use client";

import { useMemo } from "react";
import { isTextNode } from "@maga/editor";
import type { EditorState, NodeId } from "@maga/editor";
import { newTextLayerLockDefault } from "@maga/projects";
import type { TextStyle } from "@maga/projects";

type ItemTextValues = Record<string, Record<string, string>>;
type ItemTextStyles = Record<string, Record<string, Partial<TextStyle>>>;
type TextLayerLocks = Record<string, boolean>;

/**
 * Returns a memoized derived EditorState with per-item text and style overrides
 * applied to unlocked text layers for the active overlay variant.
 *
 * - Locked layers retain the template (base) value unchanged.
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
  textLayerLocks: TextLayerLocks,
  variableSlotNodeId?: NodeId | null,
  activeOverlayBlobKey?: string | null,
): EditorState {
  return useMemo(() => {
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

    // Nothing to do at all.
    if (activeOverlayId === null && !needsSlotSwap) return base;

    const perItemValues = activeOverlayId ? itemTextValues[activeOverlayId] : undefined;
    const perItemStyles = activeOverlayId ? itemTextStyles[activeOverlayId] : undefined;

    // If neither text map has entries AND no slot swap is needed, skip the map pass.
    if (!perItemValues && !perItemStyles && !needsSlotSwap) return base;

    const derivedNodes = base.nodes.map((node) => {
      // Variable-slot overlay node: swap src to the active variant's image.
      if (needsSlotSwap && node.id === variableSlotNodeId) {
        return { ...node, src: activeOverlayBlobKey };
      }

      if (!isTextNode(node)) return node;
      // Same lock resolution as use-item-text: a missing lock defaults to unlocked.
      if (textLayerLocks[node.id] ?? newTextLayerLockDefault) return node;

      const contentOverride = perItemValues?.[node.id];
      const styleOverride = perItemStyles?.[node.id];

      if (contentOverride === undefined && !styleOverride) return node;

      // Fallback to the live node.content (not layer.templateValue) is deliberate:
      // for unlocked layers the base node IS the template, so the two are equivalent.

      return {
        ...node,
        ...(contentOverride !== undefined ? { content: contentOverride } : {}),
        ...(styleOverride ?? {}),
      };
    });

    return { ...base, nodes: derivedNodes };
  }, [base, activeOverlayId, itemTextValues, itemTextStyles, textLayerLocks, variableSlotNodeId, activeOverlayBlobKey]);
}
