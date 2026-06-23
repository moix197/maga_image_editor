"use client";

import { useCallback } from "react";
import type { TextStyle } from "@maga/projects";

interface UseItemTextArgs {
  itemTextValues: Record<string, Record<string, string>>;
  itemTextStyles: Record<string, Record<string, Partial<TextStyle>>>;
  setItemTextValue: (overlayAssetId: string, textNodeId: string, value: string) => void;
  setItemTextStyle: (overlayAssetId: string, textNodeId: string, style: Partial<TextStyle>) => void;
}

/**
 * Thin per-item-text accessor over the `use-batch-project` mutation API. Reads
 * an overlay item's text override and its style override; a missing text
 * override returns `""` and a missing style override returns `{}`. Every text
 * layer is per-item (the lock model was retired in schema v4), so the accessors
 * always read the per-item map directly.
 */
export function useItemText({
  itemTextValues,
  itemTextStyles,
  setItemTextValue,
  setItemTextStyle,
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

  return {
    getTextValue,
    setTextValue: setItemTextValue,
    getTextStyle,
    setTextStyle: setItemTextStyle,
  };
}
