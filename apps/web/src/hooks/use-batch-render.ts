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
import { newTextLayerLockDefault } from "@maga/projects";
import { isTextNode } from "@maga/editor";
import type { EditorState, NodeId, TextNode } from "@maga/editor";
import type { GeneratedOutput, ProjectAsset, VariableSlot } from "@maga/projects";

/** A text node's id paired with its template (original) text value. */
interface TextLayer {
  id: NodeId;
  templateValue: string;
}

/** Collects the template's text layers that are UNLOCKED (per-item). */
function unlockedTextLayers(
  template: EditorState,
  textLayerLocks: Record<string, boolean>,
): TextLayer[] {
  return template.nodes
    .filter((n): n is TextNode => isTextNode(n))
    .filter((n) => (textLayerLocks[n.id] ?? newTextLayerLockDefault) === false)
    .map((n) => ({ id: n.id, templateValue: n.content }));
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
  itemTextValues: Record<string, Record<string, string>> = {},
  textLayerLocks: Record<string, boolean> = {},
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

    // Text layers whose value diverges per item. Their template (original)
    // value is captured up front so it can be restored after each capture —
    // the shared template is never permanently mutated.
    const perItemLayers = updateTextNode ? unlockedTextLayers(template, textLayerLocks) : [];

    const prevId = onDeselectForCapture();
    try {
      let index = 0;
      for (const overlay of overlays) {
        if (cancelRef.current) break;

        // Mutate live state, await the repaint, then capture — restoring each
        // patched layer in a finally so a throw mid-capture can never leave
        // the shared template permanently mutated.
        let outputBlobKey: string;
        try {
          // (1) Write this item's override into the LIVE editor state so the
          // canvas DOM re-renders with the per-item text (no detached clone).
          for (const layer of perItemLayers) {
            const value = itemTextValues[overlay.id]?.[layer.id] ?? layer.templateValue;
            updateTextNode!(layer.id, { content: value });
          }

          // (2) Let React re-paint the canvas before capture.
          await waitTwoFrames();

          const croppedSrc = await coverCropDataUrl(overlay.blobKey, slot.width, slot.height);
          const patchedOverlays = patchOverlays(template, slot.overlayNodeId, croppedSrc);
          // (3) Capture the live canvas (text comes from the live DOM).
          outputBlobKey = await compositeFromElement(canvasEl, patchedOverlays);
        } finally {
          // Restore each layer's original template value — the shared template
          // must never be permanently mutated, even if capture threw.
          for (const layer of perItemLayers) {
            updateTextNode!(layer.id, { content: layer.templateValue });
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
  }, [overlays, template, slot, itemTextValues, textLayerLocks, updateTextNode]);

  const cancel = useCallback(() => {
    cancelRef.current = true;
  }, []);

  return { isRunning, progress, error, run, cancel };
}
