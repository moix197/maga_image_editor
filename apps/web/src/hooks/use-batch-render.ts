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
import type { GeneratedOutput, ProjectAsset, TextStyle, VariableSlot } from "@maga/projects";

/**
 * A text node's id paired with its template (original) content AND the full set
 * of styleable fields. The style snapshot is the restore target: after applying
 * a per-item style partial the loop writes ALL of these fields back so a partial
 * override can never leak into the shared template.
 */
interface TextLayer {
  id: NodeId;
  templateValue: string;
  templateStyle: TextStyle;
}

/** Snapshots the styleable fields of a template text node (the restore target). */
function templateStyleOf(node: TextNode): TextStyle {
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
  };
}

/** Collects the template's text layers that are UNLOCKED (per-item). */
function unlockedTextLayers(
  template: EditorState,
  textLayerLocks: Record<string, boolean>,
): TextLayer[] {
  return template.nodes
    .filter((n): n is TextNode => isTextNode(n))
    .filter((n) => (textLayerLocks[n.id] ?? newTextLayerLockDefault) === false)
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
  itemTextValues: Record<string, Record<string, string>> = {},
  textLayerLocks: Record<string, boolean> = {},
  updateTextNode?: (id: NodeId, patch: Partial<Omit<TextNode, "id">>) => void,
  itemTextStyles: Record<string, Record<string, Partial<TextStyle>>> = {},
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
          // (1) Write this item's content + style override into the LIVE editor
          // state in a SINGLE merged call so the canvas DOM re-renders with the
          // per-item text and styling (no detached clone). A missing override
          // falls back to the template value/style.
          for (const layer of perItemLayers) {
            const value = itemTextValues[overlay.id]?.[layer.id] ?? layer.templateValue;
            const stylePatch = itemTextStyles[overlay.id]?.[layer.id];
            updateTextNode!(layer.id, { content: value, ...stylePatch });
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
  }, [overlays, template, slot, itemTextValues, textLayerLocks, updateTextNode, itemTextStyles]);

  const cancel = useCallback(() => {
    cancelRef.current = true;
  }, []);

  return { isRunning, progress, error, run, cancel };
}
