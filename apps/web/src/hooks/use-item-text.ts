"use client";

import { useCallback } from "react";
import { getTextValue, getTextStyle, isNodeHidden } from "@maga/projects";
import type { ItemNodeOverrides, NodeOverride, TextStyle } from "@maga/projects";

interface UseItemTextArgs {
  itemNodeOverrides: ItemNodeOverrides;
  setNodeOverride: (overlayAssetId: string, nodeId: string, patch: NodeOverride) => void;
  setNodeHidden: (overlayAssetId: string, nodeId: string, hidden: boolean) => void;
}

/**
 * Thin per-item-text accessor over the unified `itemNodeOverrides` store. Reads
 * a text node's content/style override out of the unified `NodeOverride`; a
 * missing content override returns `""` and a missing style override returns
 * `{}`. Every text layer is per-item (the lock model was retired in schema v4),
 * so the accessors always read the per-item store directly.
 *
 * Public method names (`getTextValue`/`setTextValue`/`getTextStyle`/
 * `setTextStyle`/`isNodeHidden`/`setNodeHidden`) are preserved so consumers
 * (`BatchRightPanel`) need no change; the writes route through the unified
 * `setNodeOverride`/`setNodeHidden` setters.
 */
export function useItemText({
  itemNodeOverrides,
  setNodeOverride,
  setNodeHidden,
}: UseItemTextArgs) {
  const getValue = useCallback(
    (overlayAssetId: string, textNodeId: string): string =>
      getTextValue(itemNodeOverrides, overlayAssetId, textNodeId),
    [itemNodeOverrides],
  );

  const getStyle = useCallback(
    (overlayAssetId: string, textNodeId: string): Partial<TextStyle> =>
      getTextStyle(itemNodeOverrides, overlayAssetId, textNodeId),
    [itemNodeOverrides],
  );

  const setTextValue = useCallback(
    (overlayAssetId: string, textNodeId: string, value: string) =>
      setNodeOverride(overlayAssetId, textNodeId, { content: value }),
    [setNodeOverride],
  );

  const setTextStyle = useCallback(
    (overlayAssetId: string, textNodeId: string, style: Partial<TextStyle>) =>
      setNodeOverride(overlayAssetId, textNodeId, style),
    [setNodeOverride],
  );

  const isHidden = useCallback(
    (overlayAssetId: string, nodeId: string): boolean =>
      isNodeHidden(itemNodeOverrides, overlayAssetId, nodeId),
    [itemNodeOverrides],
  );

  return {
    getTextValue: getValue,
    setTextValue,
    getTextStyle: getStyle,
    setTextStyle,
    isNodeHidden: isHidden,
    setNodeHidden,
    setNodeOverride,
  };
}
