"use client";

import { useCallback } from "react";
import type { TextStyle } from "@maga/projects";

interface UseItemTextArgs {
  itemTextValues: Record<string, Record<string, string>>;
  itemTextStyles: Record<string, Record<string, Partial<TextStyle>>>;
  itemHiddenNodeIds: Record<string, string[]>;
  setItemTextValue: (overlayAssetId: string, textNodeId: string, value: string) => void;
  setItemTextStyle: (overlayAssetId: string, textNodeId: string, style: Partial<TextStyle>) => void;
  setItemNodeHidden: (overlayAssetId: string, nodeId: string, hidden: boolean) => void;
}

/**
 * Thin per-item-text accessor over the `use-batch-project` mutation API. Reads
 * an overlay item's text override and its style override; a missing text
 * override returns `""` and a missing style override returns `{}`. Every text
 * layer is per-item (the lock model was retired in schema v4), so the accessors
 * always read the per-item map directly.
 *
 * Also exposes `isNodeHidden` / `setNodeHidden` for per-variant text-node
 * visibility (Phase 4). A node absent from `itemHiddenNodeIds[overlayId]` is
 * visible (default).
 */
export function useItemText({
  itemTextValues,
  itemTextStyles,
  itemHiddenNodeIds,
  setItemTextValue,
  setItemTextStyle,
  setItemNodeHidden,
}: UseItemTextArgs) {
  const getTextValue = useCallback(
    (overlayAssetId: string, textNodeId: string): string =>
      itemTextValues[overlayAssetId]?.[textNodeId] ?? "",
    [itemTextValues],
  );

  const getTextStyle = useCallback(
    (overlayAssetId: string, textNodeId: string): Partial<TextStyle> =>
      itemTextStyles[overlayAssetId]?.[textNodeId] ?? {},
    [itemTextStyles],
  );

  const isNodeHidden = useCallback(
    (overlayAssetId: string, nodeId: string): boolean =>
      (itemHiddenNodeIds[overlayAssetId] ?? []).includes(nodeId),
    [itemHiddenNodeIds],
  );

  return {
    getTextValue,
    setTextValue: setItemTextValue,
    getTextStyle,
    setTextStyle: setItemTextStyle,
    isNodeHidden,
    setNodeHidden: setItemNodeHidden,
  };
}
