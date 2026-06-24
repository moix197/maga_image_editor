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
import { isTextNode, isOverlayNode } from "@maga/editor";
import type { EditorState, NodeId, OverlayNode, TextNode } from "@maga/editor";
import type { GeneratedOutput, ItemNodeOverrides, NodeOverride, ProjectAsset, TextStyle, VariableSlot } from "@maga/projects";

/**
 * A text node's id paired with its template (original) content AND the full set
 * of overridable fields (style + geometry). The snapshot is the restore target:
 * after applying a per-item partial the loop writes ALL of these fields back so
 * a partial override can never leak into the shared template.
 */
interface TextLayer {
  id: NodeId;
  templateValue: string;
  templateStyle: TextStyle & { x: number; y: number; width?: number; height?: number };
}

/**
 * Snapshots the overridable fields of a template text node (the restore target).
 * Covers style, geometry (x/y), AND size (fontSize from style + width/height),
 * so a per-variant move/resize/restyle is fully reverted in the `finally`.
 * width/height are not declared on TextNode, so they're read via a loose cast
 * (undefined for plain text) — restoring `undefined` is a harmless no-op.
 */
function templateStyleOf(node: TextNode): TextStyle & { x: number; y: number; width?: number; height?: number } {
  const sized = node as TextNode & { width?: number; height?: number };
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
    width: sized.width,
    height: sized.height,
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

/**
 * The full set of overlay fields a per-variant override can touch: geometry
 * (x/y/width/height) AND transforms (opacity/rotation/cornerRadius/dropShadow/
 * featherRadius/aspectRatioLocked). Snapshot + patch + composite all operate on
 * this set so every {@link OverlayControlsPanel} field round-trips.
 */
type OverlayTransform = Pick<
  OverlayNode,
  | "x"
  | "y"
  | "width"
  | "height"
  | "opacity"
  | "rotation"
  | "cornerRadius"
  | "dropShadow"
  | "featherRadius"
  | "aspectRatioLocked"
>;

const OVERLAY_TRANSFORM_KEYS = [
  "x",
  "y",
  "width",
  "height",
  "opacity",
  "rotation",
  "cornerRadius",
  "dropShadow",
  "featherRadius",
  "aspectRatioLocked",
] as const satisfies readonly (keyof OverlayTransform)[];

/**
 * An overlay node's id paired with the template (original) transform fields. The
 * snapshot is the restore target: after applying a per-item override the loop
 * writes ALL of these fields back so a partial override can never leak into the
 * shared template — mirrors {@link TextLayer} but uses `updateOverlayNode`.
 */
interface OverlayLayer {
  id: NodeId;
  templateTransform: OverlayTransform;
}

/** Snapshots the full transform field set of a template overlay node (the restore target). */
function templateTransformOf(node: OverlayNode): OverlayTransform {
  return {
    x: node.x,
    y: node.y,
    width: node.width,
    height: node.height,
    opacity: node.opacity,
    rotation: node.rotation,
    cornerRadius: node.cornerRadius,
    dropShadow: node.dropShadow,
    featherRadius: node.featherRadius,
    aspectRatioLocked: node.aspectRatioLocked,
  };
}

/**
 * Collects every overlay node in the template, capturing its template transform
 * as the restore target so per-variant moves/resizes/restyles never leak to the
 * template.
 */
function perItemOverlayLayers(template: EditorState): OverlayLayer[] {
  return template.nodes
    .filter((n): n is OverlayNode => isOverlayNode(n))
    .map((n) => ({ id: n.id, templateTransform: templateTransformOf(n) }));
}

/** Picks only the overlay-transform fields (geometry + style) from an override patch. */
function overlayTransformPatch(override: NodeOverride): Partial<OverlayTransform> {
  const patch: Partial<OverlayTransform> = {};
  for (const key of OVERLAY_TRANSFORM_KEYS) {
    if (override[key] !== undefined) {
      (patch as Record<string, unknown>)[key] = override[key];
    }
  }
  return patch;
}

/**
 * Applies the per-item overlay transform overrides to the explicit overlay-node
 * array that the image post-pass composites. Image overlays are NOT read from the
 * live DOM at capture (the DOM elements are suppressed); their geometry/transforms
 * come from this array, so the override must be spread here for the output to
 * reflect it.
 *
 * When `hidden: true` is set, the overlay is invisible in the output: its opacity
 * is forced to 0 in the composited array (mirrors the text-node opacity-0 path).
 */
function applyOverlayOverrides(
  overlayNodes: OverlayNode[],
  overlayOverrides: Record<string, NodeOverride> | undefined,
): OverlayNode[] {
  if (!overlayOverrides) return overlayNodes;
  return overlayNodes.map((n) => {
    const override = overlayOverrides[n.id as string];
    if (!override) return n;
    const patch = overlayTransformPatch(override);
    // A hidden overlay must be invisible in the composited output.
    if (override.hidden) patch.opacity = 0;
    if (Object.keys(patch).length === 0) return n;
    return { ...n, ...patch };
  });
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
  updateOverlayNode?: (id: NodeId, patch: Partial<Omit<OverlayNode, "id">>) => void,
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

    // Every overlay node is per-item too. Its template geometry is captured up
    // front so a per-variant x/y/width/height override is restored after each
    // capture via `updateOverlayNode` — the shared template stays pristine.
    const perItemOverlays = updateOverlayNode ? perItemOverlayLayers(template) : [];

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

          // (1b) Write this item's overlay transform override (geometry + style)
          // into the LIVE editor state via `updateOverlayNode`, so the captured
          // canvas reflects the per-variant position/size/opacity/rotation/etc.
          // A hidden overlay is set to opacity 0 so it is invisible in the output.
          // A missing override leaves the template transform untouched. Restored
          // from the snapshot in the finally.
          for (const layer of perItemOverlays) {
            const override = overlayOverrides?.[layer.id as string];
            if (!override) continue;
            const patch = overlayTransformPatch(override);
            if (override.hidden) patch.opacity = 0;
            if (Object.keys(patch).length > 0) updateOverlayNode!(layer.id, patch);
          }

          // (2) Let React re-paint the canvas before capture.
          await waitTwoFrames();

          const croppedSrc = await coverCropDataUrl(overlay.blobKey, slot.width, slot.height);
          // Image overlays are composited from this explicit node array (a
          // post-pass), NOT from the live DOM — so the per-variant geometry
          // override must be applied to these nodes too, not only to live state.
          const patchedOverlays = applyOverlayOverrides(
            patchOverlays(template, slot.overlayNodeId, croppedSrc),
            overlayOverrides,
          );
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
          // Restore each overlay node's full template transform — even if capture
          // threw — so a per-variant move/resize/restyle never leaks into the
          // template.
          for (const layer of perItemOverlays) {
            updateOverlayNode!(layer.id, layer.templateTransform);
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
  }, [overlays, template, slot, itemNodeOverrides, updateTextNode, updateOverlayNode]);

  const cancel = useCallback(() => {
    cancelRef.current = true;
  }, []);

  return { isRunning, progress, error, run, cancel };
}
