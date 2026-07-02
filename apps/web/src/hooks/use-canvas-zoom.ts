"use client";

import { useState } from "react";

/** Zoom fraction bounds (25%–400%), per plan LOCKED decision. */
export const MIN_ZOOM = 0.25;
export const MAX_ZOOM = 4;

/** +/- button step size (25%). */
const ZOOM_STEP = 0.25;

function clampZoom(value: number): number {
  return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, value));
}

/**
 * Ephemeral (non-persisted) viewport zoom state for the canvas stage. Consumed
 * by BatchWorkspace as the single source of truth for both the CSS scale
 * transform and the scale-aware resize-math fix in the node layers — never a
 * second copy of zoom state (see plan "Single scale source of truth").
 */
export function useCanvasZoom() {
  const [zoom, setZoom] = useState(1);

  function zoomIn() {
    setZoom((z) => clampZoom(z + ZOOM_STEP));
  }

  function zoomOut() {
    setZoom((z) => clampZoom(z - ZOOM_STEP));
  }

  function resetZoom() {
    setZoom(1);
  }

  /**
   * Computes the zoom fraction that fits the image's natural size fully
   * within the container's current content box, clamped to [MIN_ZOOM, MAX_ZOOM].
   * No-ops when either element or the image's natural size is unavailable.
   */
  function fitToViewport(containerEl: HTMLElement | null, imageEl: HTMLImageElement | null) {
    if (!containerEl || !imageEl) return;
    const { naturalWidth, naturalHeight } = imageEl;
    if (!naturalWidth || !naturalHeight) return;
    // clientWidth/Height include the container's padding; subtract it so the
    // fitted image sits inside the visible content box rather than overflowing
    // it by the padding amount.
    const style = getComputedStyle(containerEl);
    const availWidth =
      containerEl.clientWidth -
      (parseFloat(style.paddingLeft) || 0) -
      (parseFloat(style.paddingRight) || 0);
    const availHeight =
      containerEl.clientHeight -
      (parseFloat(style.paddingTop) || 0) -
      (parseFloat(style.paddingBottom) || 0);
    if (availWidth <= 0 || availHeight <= 0) return;
    const ratio = Math.min(availWidth / naturalWidth, availHeight / naturalHeight);
    setZoom(clampZoom(ratio));
  }

  return {
    zoom,
    zoomIn,
    zoomOut,
    resetZoom,
    fitToViewport,
  };
}
