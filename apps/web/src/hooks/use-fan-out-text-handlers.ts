"use client";

import { useCallback } from "react";
import type { NodeOverride, TextStyle } from "@maga/projects";

interface UseFanOutTextHandlersArgs {
  selectedVariantIds: Set<string>;
  setNodeOverride: (overlayAssetId: string, nodeId: string, patch: NodeOverride) => void;
  setNodeHidden: (overlayAssetId: string, nodeId: string, hidden: boolean) => void;
}

/**
 * Wraps the unified per-item setters so a single edit fans out across every
 * variant in `selectedVariantIds` (any node-override patch, plus visibility).
 * The `overlayAssetId` each returned handler receives is intentionally ignored —
 * the selection set, not the active overlay, decides which variants the edit is
 * written to.
 *
 * `handleSetNodeOverride` is the generic fan-out primitive: it writes an
 * arbitrary {@link NodeOverride} patch (content, style, geometry, …) across the
 * selection. The text-value/style wrappers are thin callers of it that preserve
 * their existing signatures.
 */
export function useFanOutTextHandlers({
  selectedVariantIds,
  setNodeOverride,
  setNodeHidden,
}: UseFanOutTextHandlersArgs) {
  const handleSetNodeOverride = useCallback(
    (_overlayAssetId: string, nodeId: string, patch: NodeOverride) => {
      for (const id of selectedVariantIds) {
        setNodeOverride(id, nodeId, patch);
      }
    },
    [selectedVariantIds, setNodeOverride],
  );

  const handleSetItemTextValue = useCallback(
    (overlayAssetId: string, textNodeId: string, value: string) => {
      handleSetNodeOverride(overlayAssetId, textNodeId, { content: value });
    },
    [handleSetNodeOverride],
  );

  const handleSetItemTextStyle = useCallback(
    (overlayAssetId: string, textNodeId: string, style: Partial<TextStyle>) => {
      handleSetNodeOverride(overlayAssetId, textNodeId, style);
    },
    [handleSetNodeOverride],
  );

  const handleSetNodeHidden = useCallback(
    (_overlayAssetId: string, nodeId: string, hidden: boolean) => {
      for (const id of selectedVariantIds) {
        setNodeHidden(id, nodeId, hidden);
      }
    },
    [selectedVariantIds, setNodeHidden],
  );

  return { handleSetNodeOverride, handleSetItemTextValue, handleSetItemTextStyle, handleSetNodeHidden };
}
