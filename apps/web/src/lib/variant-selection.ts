/**
 * Pure helper for reconciling variant selection state.
 *
 * Two distinct cases:
 * 1. Active variant changed → reset to `{ newActiveId }`.
 * 2. Overlays list changed (deletion/reorder) without active change → prune
 *    stale ids then ensure activeId is present.
 */
export interface ReconcileParams {
  prev: Set<string>;
  activeId: string;
  overlayIds: ReadonlyArray<string>;
  activeChanged: boolean;
}

export function reconcileVariantSelection({
  prev,
  activeId,
  overlayIds,
  activeChanged,
}: ReconcileParams): Set<string> {
  if (activeChanged) {
    return new Set([activeId]);
  }

  const existingSet = new Set(overlayIds);
  const pruned = new Set([...prev].filter((id) => existingSet.has(id)));
  pruned.add(activeId);
  return pruned;
}
