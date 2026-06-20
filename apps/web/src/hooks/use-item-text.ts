"use client";

import { useCallback } from "react";
import { newTextLayerLockDefault } from "@maga/projects";

interface UseItemTextArgs {
  itemTextValues: Record<string, Record<string, string>>;
  textLayerLocks: Record<string, boolean>;
  setItemTextValue: (overlayAssetId: string, textNodeId: string, value: string) => void;
  setTextLayerLock: (textNodeId: string, locked: boolean) => void;
}

/**
 * Thin per-item-text accessor over the `use-batch-project` mutation API. Reads
 * an overlay item's text override and a layer's lock state; a missing override
 * returns `""` and a missing lock returns {@link newTextLayerLockDefault}
 * (`false`, per-image) so new layers diverge per item by default.
 */
export function useItemText({
  itemTextValues,
  textLayerLocks,
  setItemTextValue,
  setTextLayerLock,
}: UseItemTextArgs) {
  const getTextValue = useCallback(
    (overlayAssetId: string, textNodeId: string): string =>
      itemTextValues[overlayAssetId]?.[textNodeId] ?? "",
    [itemTextValues],
  );

  const isLocked = useCallback(
    (textNodeId: string): boolean => textLayerLocks[textNodeId] ?? newTextLayerLockDefault,
    [textLayerLocks],
  );

  const toggleLock = useCallback(
    (textNodeId: string) => setTextLayerLock(textNodeId, !isLocked(textNodeId)),
    [isLocked, setTextLayerLock],
  );

  return { getTextValue, setTextValue: setItemTextValue, isLocked, toggleLock };
}
