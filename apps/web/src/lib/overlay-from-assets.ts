import type { ProjectAsset } from "@maga/projects";

export interface OverlayFromAssetsDecision {
  /** blobKey of the first picked asset — the new node's initial `src`. */
  nodeSrc: string;
  /** True when 2+ assets were picked — the new node should become the variable slot. */
  makeVariableSlot: boolean;
  /** Ids of every picked asset, in pick order — the variant selection when `makeVariableSlot` is true. */
  variantIds: string[];
}

/**
 * Resolves an overlay-picker selection (asset ids) into the intent for
 * `handleAddOverlayFromAssets`: one pick is a static overlay node; 2+ picks
 * are one node auto-designated as the variable slot cycling the picked assets.
 * Pure so the 1-vs-2+ branch is unit-testable without touching editor state.
 * Returns null if none of the ids resolve to a known asset (defensive — the
 * picker only ever offers ids drawn from `overlays`).
 */
export function resolveOverlayFromAssets(
  ids: string[],
  overlays: ProjectAsset[],
): OverlayFromAssetsDecision | null {
  const assets = ids
    .map((id) => overlays.find((overlay) => overlay.id === id))
    .filter((asset): asset is ProjectAsset => asset !== undefined);

  if (assets.length === 0) return null;

  return {
    nodeSrc: assets[0]!.blobKey,
    makeVariableSlot: assets.length > 1,
    variantIds: assets.map((asset) => asset.id),
  };
}
