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
 * variant in `selectedVariantIds` (text value, style, and visibility). The
 * `overlayAssetId` each returned handler receives is intentionally ignored —
 * the selection set, not the active overlay, decides which variants the edit is
 * written to.
 *
 * The value/style wrappers route through `setNodeOverride` (full generalization
 * to an arbitrary `NodeOverride` patch lands in Phase 2); callers keep their
 * existing signatures.
 */
export function useFanOutTextHandlers({
  selectedVariantIds,
  setNodeOverride,
  setNodeHidden,
}: UseFanOutTextHandlersArgs) {
  const handleSetItemTextValue = useCallback(
    (_overlayAssetId: string, textNodeId: string, value: string) => {
      for (const id of selectedVariantIds) {
        setNodeOverride(id, textNodeId, { content: value });
      }
    },
    [selectedVariantIds, setNodeOverride],
  );

  const handleSetItemTextStyle = useCallback(
    (_overlayAssetId: string, textNodeId: string, style: Partial<TextStyle>) => {
      for (const id of selectedVariantIds) {
        setNodeOverride(id, textNodeId, style);
      }
    },
    [selectedVariantIds, setNodeOverride],
  );

  const handleSetNodeHidden = useCallback(
    (_overlayAssetId: string, nodeId: string, hidden: boolean) => {
      for (const id of selectedVariantIds) {
        setNodeHidden(id, nodeId, hidden);
      }
    },
    [selectedVariantIds, setNodeHidden],
  );

  return { handleSetItemTextValue, handleSetItemTextStyle, handleSetNodeHidden };
}
