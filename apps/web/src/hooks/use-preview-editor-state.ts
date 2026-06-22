"use client";

import { useMemo } from "react";
import { isTextNode } from "@maga/editor";
import type { EditorState } from "@maga/editor";
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
 * - When activeOverlayId is null, base is returned as-is (no copy).
 */
export function usePreviewEditorState(
  base: EditorState,
  activeOverlayId: string | null,
  itemTextValues: ItemTextValues,
  itemTextStyles: ItemTextStyles,
  textLayerLocks: TextLayerLocks,
): EditorState {
  return useMemo(() => {
    if (activeOverlayId === null) return base;

    const perItemValues = itemTextValues[activeOverlayId];
    const perItemStyles = itemTextStyles[activeOverlayId];

    // If neither map has any entries for this overlay, skip the map pass.
    if (!perItemValues && !perItemStyles) return base;

    const derivedNodes = base.nodes.map((node) => {
      if (!isTextNode(node)) return node;
      if (textLayerLocks[node.id]) return node;

      const contentOverride = perItemValues?.[node.id];
      const styleOverride = perItemStyles?.[node.id];

      if (contentOverride === undefined && !styleOverride) return node;

      return {
        ...node,
        ...(contentOverride !== undefined ? { content: contentOverride } : {}),
        ...(styleOverride ?? {}),
      };
    });

    return { ...base, nodes: derivedNodes };
  }, [base, activeOverlayId, itemTextValues, itemTextStyles, textLayerLocks]);
}
