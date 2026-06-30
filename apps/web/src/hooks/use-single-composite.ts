"use client";

import { useState, useCallback } from "react";
import { coverCropDataUrl } from "@/lib/cover-crop";
import { compositeFromElement, EXPORT_PIXEL_RATIO } from "@/lib/export-helpers";
import { patchOverlays } from "@/lib/overlay-patch";
import { waitTwoFrames } from "@/lib/capture-helpers";
import type { EditorState, NodeId } from "@maga/editor";
import type { ProjectAsset, VariableSlot } from "@maga/projects";

interface UseSingleCompositeOptions {
  /**
   * Overlay assets available in the project. When provided, `generate` can
   * resolve the overlay source by `overlayAssetId` instead of requiring the
   * caller to supply a raw URL. Defaults to `[]`.
   */
  overlays?: ProjectAsset[];
}

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
    /**
     * Optional: id of the {@link ProjectAsset} to use as the overlay source.
     * When provided, the asset's `blobKey` is used instead of `overlaySrc`.
     * Falls back to the first overlay in `options.overlays` when omitted and
     * `options.overlays` is non-empty. Has no effect when `options.overlays`
     * is not supplied — `overlaySrc` is always used in that case.
     */
    overlayAssetId?: string,
  ) => Promise<void>;
}

/**
 * Generates a single composited preview image from the live canvas element.
 *
 * Capture contract: caller must pass onDeselectForCapture (clears selection
 * ring from DOM) and onRestoreSelection (restores it after capture). The hook
 * waits two animation frames between deselect and capture so React can flush
 * the DOM update — matching the /editor handleExport pattern exactly.
 *
 * Optional `overlays` enables per-item canvas switching: pass `overlayAssetId`
 * to `generate()` to preview a specific overlay instead of the default first one.
 * All existing call sites that omit `overlayAssetId` are unaffected.
 */
export function useSingleComposite(options: UseSingleCompositeOptions = {}): UseSingleCompositeResult {
  const { overlays = [] } = options;

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
    overlayAssetId?: string,
  ) => {
    if (!canvasEl) {
      console.warn("[useSingleComposite] canvasEl is null — capture skipped");
      return;
    }

    // Resolve the actual source: explicit asset id > first overlay > fallback overlaySrc
    const resolvedSrc = resolveOverlaySrc(overlays, overlaySrc, overlayAssetId);

    setIsRendering(true);
    setError(null);
    const prevId = onDeselectForCapture();
    try {
      await waitTwoFrames();
      // No staleness here: `patchOverlays` below draws the slot node straight
      // from `template` (the live, un-overridden base state) with no per-variant
      // geometry override applied — single-composite has no itemNodeOverrides
      // input. So `slot.width/height` (captured from this same template node
      // when the slot was toggled) always equals the actual draw size, since
      // nothing in this flow mutates the template node's width/height directly.
      const croppedSrc = await coverCropDataUrl(resolvedSrc, slot.width, slot.height, EXPORT_PIXEL_RATIO);
      const patchedOverlays = patchOverlays(template, slot.overlayNodeId, croppedSrc);
      const dataUrl = await compositeFromElement(canvasEl, patchedOverlays);
      setCompositeDataUrl(dataUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Composite generation failed");
    } finally {
      setIsRendering(false);
      onRestoreSelection(prevId);
    }
  }, [overlays]);

  return { compositeDataUrl, isRendering, error, generate };
}

/**
 * Resolves which blob URL to use for compositing.
 * Priority: explicit overlayAssetId match > first overlay > fallback overlaySrc.
 */
function resolveOverlaySrc(
  overlays: ProjectAsset[],
  fallbackSrc: string,
  overlayAssetId?: string,
): string {
  if (overlays.length === 0) return fallbackSrc;
  if (overlayAssetId) {
    const match = overlays.find((o) => o.id === overlayAssetId);
    if (match) return match.blobKey;
  }
  return overlays[0]?.blobKey ?? fallbackSrc;
}
