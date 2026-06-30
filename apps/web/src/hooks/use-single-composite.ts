"use client";

import { useState, useCallback } from "react";
import { coverCropDataUrl } from "@/lib/cover-crop";
import { compositeFromElement, EXPORT_PIXEL_RATIO } from "@/lib/export-helpers";
import { patchOverlays } from "@/lib/overlay-patch";
import { waitTwoFrames } from "@/lib/capture-helpers";
import { isOverlayNode } from "@maga/editor";
import type { EditorState, NodeId, OverlayNode } from "@maga/editor";
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
      // `patchOverlays` below draws the slot node straight from `template` at
      // that node's CURRENT width/height — which can differ from `slot.width/
      // height` (a snapshot taken when the slot was toggled) if the user
      // resized the overlay node afterwards. Crop at the live node's draw
      // size so the bitmap is never upscaled/blurry; fall back to the slot
      // snapshot only if the node can't be found.
      const liveOverlayNode = findOverlayNode(template, slot.overlayNodeId);
      const slotWidth = liveOverlayNode?.width ?? slot.width;
      const slotHeight = liveOverlayNode?.height ?? slot.height;
      const croppedSrc = await coverCropDataUrl(resolvedSrc, slotWidth, slotHeight, EXPORT_PIXEL_RATIO);
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
 * Finds the live overlay node `patchOverlays` will draw, so the export crop
 * can be sized to its current (not stale) width/height.
 */
function findOverlayNode(template: EditorState, nodeId: NodeId): OverlayNode | undefined {
  return template.nodes.find(
    (n): n is OverlayNode => isOverlayNode(n) && n.overlayType === "image" && n.id === nodeId,
  );
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
