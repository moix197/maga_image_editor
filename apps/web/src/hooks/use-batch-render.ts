"use client";

// NOTE: outputs are held in React state as data URLs. For large batches (20+
// overlays), if memory becomes a constraint, write each output to IndexedDB
// immediately per-item and store a reference (key) instead of the data URL.
// This is a known trade-off deferred to a future phase.

import { useRef, useState, useCallback } from "react";
import { coverCropDataUrl } from "@/lib/cover-crop";
import { compositeFromElement } from "@/lib/export-helpers";
import { patchOverlays } from "@/lib/overlay-patch";
import { waitTwoFrames } from "@/lib/capture-helpers";
import { isTextNode } from "@maga/editor";
import type { EditorState, NodeId, TextNode } from "@maga/editor";
import type { GeneratedOutput, ItemNodeOverrides, ProjectAsset, TextStyle, VariableSlot } from "@maga/projects";

/**
 * A text node's id paired with its template (original) content AND the full set
 * of overridable fields (style + geometry). The snapshot is the restore target:
 * after applying a per-item partial the loop writes ALL of these fields back so
 * a partial override can never leak into the shared template.
 */
interface TextLayer {
  id: NodeId;
  templateValue: string;
  templateStyle: TextStyle & { x: number; y: number };
}

/**
 * Snapshots the overridable fields of a template text node (the restore target).
 * Covers style AND geometry (x/y), so a per-variant move/restyle is fully
 * reverted in the `finally`.
 */
function templateStyleOf(node: TextNode): TextStyle & { x: number; y: number } {
  return {
    fontSize: node.fontSize,
    color: node.color,
    opacity: node.opacity,
    fontFamily: node.fontFamily,
    fontWeight: node.fontWeight,
    fontStyle: node.fontStyle,
    rotation: node.rotation,
    shadow: node.shadow,
    textBackground: node.textBackground,
    x: node.x,
    y: node.y,
  };
}

/**
 * Collects every text layer in the template. All text layers are per-item
 * (the lock model was retired in schema v4), so each captures its template
 * value + style as the restore target.
 */
function perItemTextLayers(template: EditorState): TextLayer[] {
  return template.nodes
    .filter((n): n is TextNode => isTextNode(n))
    .map((n) => ({ id: n.id, templateValue: n.content, templateStyle: templateStyleOf(n) }));
}

interface Progress {
  current: number;
  total: number;
}

interface UseBatchRenderResult {
  isRunning: boolean;
  progress: Progress;
  error: string | null;
  run: (
    addOutput: (output: GeneratedOutput) => void,
    clearOutputs: () => void,
    canvasEl: HTMLElement | null,
    onDeselectForCapture: () => NodeId | null,
    onRestoreSelection: (prevId: NodeId | null) => void,
  ) => Promise<void>;
  cancel: () => void;
}

export function useBatchRender(
  overlays: ProjectAsset[],
  template: EditorState,
  slot: VariableSlot,
  itemNodeOverrides: ItemNodeOverrides = {},
  updateTextNode?: (id: NodeId, patch: Partial<Omit<TextNode, "id">>) => void,
): UseBatchRenderResult {
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState<Progress>({ current: 0, total: 0 });
  const [error, setError] = useState<string | null>(null);
  const cancelRef = useRef(false);

  const run = useCallback(async (
    addOutput: (output: GeneratedOutput) => void,
    clearOutputs: () => void,
    canvasEl: HTMLElement | null,
    onDeselectForCapture: () => NodeId | null,
    onRestoreSelection: (prevId: NodeId | null) => void,
  ) => {
    if (!canvasEl) {
      console.warn("[useBatchRender] canvasEl is null — batch render skipped");
      return;
    }
    if (overlays.length === 0) return;

    setIsRunning(true);
    setError(null);
    cancelRef.current = false;
    clearOutputs();
    setProgress({ current: 0, total: overlays.length });

    // Every text layer is per-item. Each one's template (original) value is
    // captured up front so it can be restored after each capture — the shared
    // template is never permanently mutated.
    const perItemLayers = updateTextNode ? perItemTextLayers(template) : [];

    const prevId = onDeselectForCapture();
    try {
      let index = 0;
      for (const overlay of overlays) {
        if (cancelRef.current) break;

        // Mutate live state, await the repaint, then capture — restoring each
        // patched layer in a finally so a throw mid-capture can never leave
        // the shared template permanently mutated.
        // Layers hidden for this overlay are excluded from the render: we set
        // their opacity to 0 before capture so they are invisible in the output.
        // They are restored (along with all other layers) in the finally block.
        const overlayOverrides = itemNodeOverrides[overlay.id];

        let outputBlobKey: string;
        try {
          // (1) Write this item's content + style override into the LIVE editor
          // state in a SINGLE merged call so the canvas DOM re-renders with the
          // per-item text and styling (no detached clone). A missing override
          // falls back to the template value/style. Hidden layers get opacity 0.
          for (const layer of perItemLayers) {
            const override = overlayOverrides?.[layer.id as string];
            if (override?.hidden) {
              updateTextNode!(layer.id, { opacity: 0 });
            } else {
              const { content, hidden: _hidden, ...stylePatch } = override ?? {};
              const value = content ?? layer.templateValue;
              updateTextNode!(layer.id, { ...stylePatch, content: value });
            }
          }

          // (2) Let React re-paint the canvas before capture.
          await waitTwoFrames();

          const croppedSrc = await coverCropDataUrl(overlay.blobKey, slot.width, slot.height);
          const patchedOverlays = patchOverlays(template, slot.overlayNodeId, croppedSrc);
          // (3) Capture the live canvas (text comes from the live DOM).
          outputBlobKey = await compositeFromElement(canvasEl, patchedOverlays);
        } finally {
          // Restore each layer's original template content AND every styleable
          // field — the shared template must never be permanently mutated, even
          // if capture threw. Restoring the full style snapshot (not just the
          // overridden keys) prevents a partial override from leaking.
          for (const layer of perItemLayers) {
            updateTextNode!(layer.id, { content: layer.templateValue, ...layer.templateStyle });
          }
        }

        addOutput({ overlayAssetId: overlay.id, outputBlobKey, timestamp: Date.now() });
        setProgress({ current: index + 1, total: overlays.length });

        index++;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Batch render failed");
    } finally {
      setIsRunning(false);
      onRestoreSelection(prevId);
    }
  }, [overlays, template, slot, itemNodeOverrides, updateTextNode]);

  const cancel = useCallback(() => {
    cancelRef.current = true;
  }, []);

  return { isRunning, progress, error, run, cancel };
}
