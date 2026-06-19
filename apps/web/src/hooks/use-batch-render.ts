"use client";

// NOTE: outputs are held in React state as data URLs. For large batches (20+
// overlays), if memory becomes a constraint, write each output to IndexedDB
// immediately per-item and store a reference (key) instead of the data URL.
// This is a known trade-off deferred to a future phase.

import { useRef, useState, useCallback } from "react";
import { coverCropDataUrl } from "@/lib/cover-crop";
import { compositeFromElement } from "@/lib/export-helpers";
import { patchOverlays } from "@/lib/overlay-patch";
import type { EditorState } from "@maga/editor";
import type { GeneratedOutput, ProjectAsset, VariableSlot } from "@maga/projects";

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
  ) => Promise<void>;
  cancel: () => void;
}

export function useBatchRender(
  canvasEl: HTMLElement | null,
  overlays: ProjectAsset[],
  template: EditorState,
  slot: VariableSlot,
): UseBatchRenderResult {
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState<Progress>({ current: 0, total: 0 });
  const [error, setError] = useState<string | null>(null);
  const cancelRef = useRef(false);

  const run = useCallback(async (
    addOutput: (output: GeneratedOutput) => void,
    clearOutputs: () => void,
  ) => {
    if (!canvasEl || overlays.length === 0) return;

    setIsRunning(true);
    setError(null);
    cancelRef.current = false;
    clearOutputs();
    setProgress({ current: 0, total: overlays.length });

    try {
      let index = 0;
      for (const overlay of overlays) {
        if (cancelRef.current) break;

        await new Promise<void>((r) => setTimeout(r, 0));

        const croppedSrc = await coverCropDataUrl(overlay.blobKey, slot.width, slot.height);
        const patchedOverlays = patchOverlays(template, slot.overlayNodeId, croppedSrc);
        const outputBlobKey = await compositeFromElement(canvasEl, patchedOverlays);

        addOutput({ overlayAssetId: overlay.id, outputBlobKey, timestamp: Date.now() });
        setProgress({ current: index + 1, total: overlays.length });

        index++;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Batch render failed");
    } finally {
      setIsRunning(false);
    }
  }, [canvasEl, overlays, template, slot]);

  const cancel = useCallback(() => {
    cancelRef.current = true;
  }, []);

  return { isRunning, progress, error, run, cancel };
}
