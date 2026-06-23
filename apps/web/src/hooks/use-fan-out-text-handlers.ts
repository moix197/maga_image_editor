"use client";

import { useCallback } from "react";
import type { TextStyle } from "@maga/projects";

interface UseFanOutTextHandlersArgs {
  selectedVariantIds: Set<string>;
  setItemTextValue: (overlayAssetId: string, textNodeId: string, value: string) => void;
  setItemTextStyle: (overlayAssetId: string, textNodeId: string, style: Partial<TextStyle>) => void;
  setItemNodeHidden: (overlayAssetId: string, nodeId: string, hidden: boolean) => void;
}

/**
 * Wraps the per-item text setters so a single edit fans out across every
 * variant in `selectedVariantIds` (text value, style, and visibility). The
 * `overlayAssetId` each returned handler receives is intentionally ignored —
 * the selection set, not the active overlay, decides which variants the edit
 * is written to.
 */
export function useFanOutTextHandlers({
  selectedVariantIds,
  setItemTextValue,
  setItemTextStyle,
  setItemNodeHidden,
}: UseFanOutTextHandlersArgs) {
  const handleSetItemTextValue = useCallback(
    (_overlayAssetId: string, textNodeId: string, value: string) => {
      for (const id of selectedVariantIds) {
        setItemTextValue(id, textNodeId, value);
      }
    },
    [selectedVariantIds, setItemTextValue],
  );

  const handleSetItemTextStyle = useCallback(
    (_overlayAssetId: string, textNodeId: string, style: Partial<TextStyle>) => {
      for (const id of selectedVariantIds) {
        setItemTextStyle(id, textNodeId, style);
      }
    },
    [selectedVariantIds, setItemTextStyle],
  );

  const handleSetNodeHidden = useCallback(
    (_overlayAssetId: string, nodeId: string, hidden: boolean) => {
      for (const id of selectedVariantIds) {
        setItemNodeHidden(id, nodeId, hidden);
      }
    },
    [selectedVariantIds, setItemNodeHidden],
  );

  return { handleSetItemTextValue, handleSetItemTextStyle, handleSetNodeHidden };
}
