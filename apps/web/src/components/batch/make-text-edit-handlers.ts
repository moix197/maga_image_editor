import { newTextLayerLockDefault } from "@maga/projects";
import type { TextStyle } from "@maga/projects";
import type { NodeId } from "@maga/editor";

// --- type declarations ---

export interface MakeTextEditHandlersArgs {
  textLayerLocks: Record<string, boolean>;
  setItemTextValue: (overlayAssetId: string, textNodeId: string, value: string) => void;
  setItemTextStyle: (overlayAssetId: string, textNodeId: string, style: Partial<TextStyle>) => void;
  /** Accepts both content patches and style patches — both are valid subsets of TextNode. */
  updateTextNode: (id: NodeId, patch: { content: string } | Partial<TextStyle>) => void;
}

export interface TextEditHandlers {
  /** Same signature as setItemTextValue — drop-in replacement that routes by lock state. */
  routedSetItemTextValue: (overlayAssetId: string, nodeId: string, value: string) => void;
  /** Same signature as setItemTextStyle — drop-in replacement that routes by lock state. */
  routedSetItemTextStyle: (overlayAssetId: string, nodeId: string, patch: Partial<TextStyle>) => void;
}

// --- factory logic ---

/**
 * Pure factory — no React, no side effects beyond calling the passed callbacks.
 *
 * Produces drop-in replacements for setItemTextValue / setItemTextStyle that
 * route each edit through the lock state of the target node:
 *
 * - Locked layer  → updateTextNode (shared template; all variants see the change;
 *                   overlayAssetId is ignored)
 * - Unlocked layer → setItemTextValue / setItemTextStyle (per-item override for
 *                   the given overlayAssetId)
 */
export function makeTextEditHandlers({
  textLayerLocks,
  setItemTextValue,
  setItemTextStyle,
  updateTextNode,
}: MakeTextEditHandlersArgs): TextEditHandlers {
  function isLocked(nodeId: string): boolean {
    return textLayerLocks[nodeId] ?? newTextLayerLockDefault;
  }

  function routedSetItemTextValue(overlayAssetId: string, nodeId: string, value: string): void {
    if (isLocked(nodeId)) {
      updateTextNode(nodeId as NodeId, { content: value });
    } else {
      setItemTextValue(overlayAssetId, nodeId, value);
    }
  }

  function routedSetItemTextStyle(
    overlayAssetId: string,
    nodeId: string,
    patch: Partial<TextStyle>,
  ): void {
    if (isLocked(nodeId)) {
      updateTextNode(nodeId as NodeId, patch);
    } else {
      setItemTextStyle(overlayAssetId, nodeId, patch);
    }
  }

  return { routedSetItemTextValue, routedSetItemTextStyle };
}
