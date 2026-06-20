"use client";

import { useState, useCallback } from "react";
import { coverCropDataUrl } from "@/lib/cover-crop";
import { compositeFromElement } from "@/lib/export-helpers";
import { patchOverlays } from "@/lib/overlay-patch";
import { waitTwoFrames } from "@/lib/capture-helpers";
import type { EditorState, NodeId } from "@maga/editor";
import type { VariableSlot } from "@maga/projects";

interface UseSingleCompositeResult {
  compositeDataUrl: string | null;
  isRendering: boolean;
  error: string | null;
  generate: (
    canvasEl: HTMLElement | null,
    template: EditorState,
    slot: VariableSlot,
    overlaySrc: string,
    onDeselectForCapture: () => NodeId | null,
    onRestoreSelection: (prevId: NodeId | null) => void,
  ) => Promise<void>;
}

/**
 * Generates a single composited preview image from the live canvas element.
 *
 * Capture contract: caller must pass onDeselectForCapture (clears selection
 * ring from DOM) and onRestoreSelection (restores it after capture). The hook
 * waits two animation frames between deselect and capture so React can flush
 * the DOM update — matching the /editor handleExport pattern exactly.
 */
export function useSingleComposite(): UseSingleCompositeResult {
  const [compositeDataUrl, setCompositeDataUrl] = useState<string | null>(null);
  const [isRendering, setIsRendering] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generate = useCallback(async (
    canvasEl: HTMLElement | null,
    template: EditorState,
    slot: VariableSlot,
    overlaySrc: string,
    onDeselectForCapture: () => NodeId | null,
    onRestoreSelection: (prevId: NodeId | null) => void,
  ) => {
    if (!canvasEl) {
      console.warn("[useSingleComposite] canvasEl is null — capture skipped");
      return;
    }
    setIsRendering(true);
    setError(null);
    const prevId = onDeselectForCapture();
    try {
      await waitTwoFrames();
      const croppedSrc = await coverCropDataUrl(overlaySrc, slot.width, slot.height);
      const patchedOverlays = patchOverlays(template, slot.overlayNodeId, croppedSrc);
      const dataUrl = await compositeFromElement(canvasEl, patchedOverlays);
      setCompositeDataUrl(dataUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Composite generation failed");
    } finally {
      setIsRendering(false);
      onRestoreSelection(prevId);
    }
  }, []);

  return { compositeDataUrl, isRendering, error, generate };
}
