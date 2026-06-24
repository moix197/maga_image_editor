"use client";

import { useMemo } from "react";
import { isTextNode } from "@maga/editor";
import type { EditorState, NodeId } from "@maga/editor";
import type { ItemNodeOverrides, NodeOverride } from "@maga/projects";

/** Drops the non-Node `hidden` flag, leaving only spreadable Node fields. */
function stripHidden(override: NodeOverride): Partial<Omit<NodeOverride, "hidden">> {
  const { hidden: _hidden, ...patch } = override;
  return patch;
}

/**
 * Returns a memoized derived EditorState with per-item overrides applied to
 * every text AND image-overlay node for the active overlay variant.
 *
 * - Overrides are read from the unified `itemNodeOverrides` store (schema v5):
 *   the full (non-`hidden`) override is spread onto the node, so every
 *   overridable field flows through — text `content`/style AND geometry
 *   (x/y/width/height) for both text and overlay nodes. A generic spread means
 *   future overridable fields apply automatically.
 * - Every text layer is per-item (the lock model was retired in schema v4); a
 *   layer with no override for the active variant retains the template value.
 * - Nodes (text OR overlay) whose override carries `hidden: true` for the active
 *   overlay are excluded from the derived node list entirely.
 * - The base EditorState is never mutated.
 * - When activeOverlayId is null AND there is no slot swap pending, base is
 *   returned as-is (no copy).
 * - When variableSlotNodeId + activeOverlayBlobKey are provided, the variable-slot
 *   overlay node's src is synchronously swapped to reflect the active variant image.
 */
export function usePreviewEditorState(
  base: EditorState,
  activeOverlayId: string | null,
  itemNodeOverrides: ItemNodeOverrides,
  variableSlotNodeId?: NodeId | null,
  activeOverlayBlobKey?: string | null,
): EditorState {
  return useMemo(() => {
    const overlayOverrides = activeOverlayId ? itemNodeOverrides[activeOverlayId] : undefined;

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

    const hasOverrides = overlayOverrides !== undefined && Object.keys(overlayOverrides).length > 0;

    // Nothing to do at all.
    if (!hasOverrides && !needsSlotSwap) return base;

    const derivedNodes = base.nodes
      .filter((node) => {
        // Nodes hidden for the active variant are excluded from the preview —
        // applies to both text nodes and image-overlay nodes.
        if (overlayOverrides?.[node.id as string]?.hidden) return false;
        return true;
      })
      .map((node) => {
        const override = overlayOverrides?.[node.id as string];

        // Strip the non-Node `hidden` flag, then spread every remaining override
        // field onto the node — text content/style AND geometry (x/y/width/height)
        // for both text and overlay nodes all fall through. The base node IS the
        // template, so un-overridden fields keep their template values.
        const patch = override ? stripHidden(override) : undefined;
        const hasPatch = patch !== undefined && Object.keys(patch).length > 0;

        const isSlot = needsSlotSwap && node.id === variableSlotNodeId;
        if (!isSlot && !hasPatch) return node;

        // The variable-slot overlay node also swaps its src to the active
        // variant's image (layered on top of any geometry override).
        return {
          ...node,
          ...(hasPatch ? patch : {}),
          ...(isSlot ? { src: activeOverlayBlobKey } : {}),
        };
      });

    return { ...base, nodes: derivedNodes };
  }, [base, activeOverlayId, itemNodeOverrides, variableSlotNodeId, activeOverlayBlobKey]);
}
