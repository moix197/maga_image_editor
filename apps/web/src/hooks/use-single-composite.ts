"use client";

import { useState, useCallback } from "react";
import { coverCropDataUrl } from "@/lib/cover-crop";
import { compositeFromElement } from "@/lib/export-helpers";
import { patchOverlays } from "@/lib/overlay-patch";
import type { EditorState } from "@maga/editor";
import type { VariableSlot } from "@maga/projects";

interface UseSingleCompositeResult {
  compositeDataUrl: string | null;
  isRendering: boolean;
  error: string | null;
  generate: (
    canvasEl: HTMLElement,
    template: EditorState,
    slot: VariableSlot,
    overlaySrc: string,
  ) => Promise<void>;
}

/**
 * Generates a single composited preview image:
 * 1. Cover-crops the overlay image to slot dimensions (offscreen canvas).
 * 2. Clones template EditorState, replacing the variable node's src with
 *    croppedSrc BEFORE the post-pass reads it — so the post-pass blits the
 *    already-fitted image without distortion or transparent bars.
 * 3. Calls compositeFromElement with the patched overlay nodes directly
 *    (no DOM re-render required) and returns the result data URL.
 */
export function useSingleComposite(): UseSingleCompositeResult {
  const [compositeDataUrl, setCompositeDataUrl] = useState<string | null>(null);
  const [isRendering, setIsRendering] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generate = useCallback(async (
    canvasEl: HTMLElement,
    template: EditorState,
    slot: VariableSlot,
    overlaySrc: string,
  ) => {
    setIsRendering(true);
    setError(null);
    try {
      const croppedSrc = await coverCropDataUrl(overlaySrc, slot.width, slot.height);
      const patchedOverlays = patchOverlays(template, slot.overlayNodeId, croppedSrc);
      const dataUrl = await compositeFromElement(canvasEl, patchedOverlays);
      setCompositeDataUrl(dataUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Composite generation failed");
    } finally {
      setIsRendering(false);
    }
  }, []);

  return { compositeDataUrl, isRendering, error, generate };
}
