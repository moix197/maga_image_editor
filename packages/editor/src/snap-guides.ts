/**
 * Pure, DOM-free alignment snap math. Every geometry value is expressed in a
 * single canvas-space pixel coordinate system that the caller (@maga/web)
 * supplies: @maga/web measures the DOM, converts to canvas-space, and passes
 * plain data in. This module NEVER touches the DOM or any browser API.
 *
 * Rotation: v1 always treats a `SnapBox` as its upright (un-rotated)
 * axis-aligned box — the module carries no rotation field and applies no
 * rotation math (see plan "Rotation" LOCKED decision).
 */

export interface Size {
  width: number;
  height: number;
}

/** Upright (un-rotated) axis-aligned box in canvas-space px; (x, y) is top-left. */
export interface SnapBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Line orientation: "vertical" constrains a box's X; "horizontal" constrains Y. */
export type SnapAxis = "vertical" | "horizontal";

/**
 * Whether a line originates from a bound's edge or its center, or represents
 * an equalized gap between neighbors ("spacing", Phase 4 distribution guide).
 * Additive: existing edge/center rendering switches only on `axis`/`position`
 * and is unaffected by this new variant.
 */
export type SnapKind = "edge" | "center" | "spacing";

/** A candidate alignment line derived from a reference bound (canvas/image/sibling). */
export interface SnapReference {
  axis: SnapAxis;
  /** Canvas-space coordinate of the line along the constrained axis (px). */
  position: number;
  kind: SnapKind;
}

/** A line the dragged box is currently snapped to (same shape as a reference). */
export type SnapGuide = SnapReference;

export interface SnapResult {
  /** Snapped top-left X in canvas-space px (unchanged when no X snap applied). */
  x: number;
  /** Snapped top-left Y in canvas-space px (unchanged when no Y snap applied). */
  y: number;
  /** The reference lines that were snapped to (0, 1, or 2 entries). */
  guides: SnapGuide[];
}

/**
 * Builds edge + center snap references for a rectangular bound (the canvas or
 * the base image) in canvas-space px. `origin` lets a bound sit offset inside a
 * larger canvas (e.g. a letterboxed image); it defaults to the top-left corner,
 * where image and canvas bounds coincide.
 */
export function computeContainerSnapTargets(
  containerSize: Size,
  origin: { x: number; y: number } = { x: 0, y: 0 },
): SnapReference[] {
  const left = origin.x;
  const right = origin.x + containerSize.width;
  const centerX = origin.x + containerSize.width / 2;
  const top = origin.y;
  const bottom = origin.y + containerSize.height;
  const centerY = origin.y + containerSize.height / 2;
  return [
    { axis: "vertical", position: left, kind: "edge" },
    { axis: "vertical", position: centerX, kind: "center" },
    { axis: "vertical", position: right, kind: "edge" },
    { axis: "horizontal", position: top, kind: "edge" },
    { axis: "horizontal", position: centerY, kind: "center" },
    { axis: "horizontal", position: bottom, kind: "edge" },
  ];
}

/**
 * Builds edge + center snap references per sibling box (other nodes visible
 * on the same canvas), in canvas-space px. Pure/DOM-free, mirroring
 * `computeContainerSnapTargets`. Carries NO self-exclusion logic — the caller
 * (`@maga/web`) must exclude the dragged node's own box from `boxes` before
 * calling this, otherwise a box would trivially "snap" to its own edges
 * (delta 0) (see plan "Sibling-snap staleness").
 */
export function computeSiblingSnapTargets(boxes: SnapBox[]): SnapReference[] {
  const references: SnapReference[] = [];
  for (const box of boxes) {
    const centerX = box.x + box.width / 2;
    const centerY = box.y + box.height / 2;
    references.push(
      { axis: "vertical", position: box.x, kind: "edge" },
      { axis: "vertical", position: centerX, kind: "center" },
      { axis: "vertical", position: box.x + box.width, kind: "edge" },
      { axis: "horizontal", position: box.y, kind: "edge" },
      { axis: "horizontal", position: centerY, kind: "center" },
      { axis: "horizontal", position: box.y + box.height, kind: "edge" },
    );
  }
  return references;
}

/**
 * Box anchors tested against a reference: center-to-center, or both edges.
 * Only ever called with "edge"/"center" kinds — `SnapReference`s built by
 * `computeContainerSnapTargets`/`computeSiblingSnapTargets` never carry
 * `kind: "spacing"`, so the `!== "center"` branch below covers "edge" only.
 */
function anchorsFor(kind: SnapKind, start: number, size: number): number[] {
  return kind === "center" ? [start + size / 2] : [start, start + size];
}

/** Picks the reference on `axis` whose closest box anchor is nearest within threshold. */
function pickBest(
  references: SnapReference[],
  axis: SnapAxis,
  start: number,
  size: number,
  threshold: number,
): { delta: number; reference: SnapReference } | null {
  let best: { delta: number; reference: SnapReference } | null = null;
  for (const ref of references) {
    if (ref.axis !== axis) continue;
    for (const anchor of anchorsFor(ref.kind, start, size)) {
      const delta = ref.position - anchor;
      if (Math.abs(delta) > threshold) continue;
      if (!best || Math.abs(delta) < Math.abs(best.delta)) {
        best = { delta, reference: ref };
      }
    }
  }
  return best;
}

/**
 * Resolves the snapped position of `dragBox` against `references`. `thresholdPx`
 * is a screen-space distance converted to canvas-space via `thresholdPx / scale`
 * (scale = current zoom fraction), so snapping triggers at a consistent on-screen
 * distance at any zoom level. A position exactly at the threshold snaps; one unit
 * past it does not.
 */
export function resolveSnap(
  dragBox: SnapBox,
  references: SnapReference[],
  thresholdPx: number,
  scale: number,
): SnapResult {
  const threshold = thresholdPx / scale;

  const bestX = pickBest(references, "vertical", dragBox.x, dragBox.width, threshold);
  const bestY = pickBest(references, "horizontal", dragBox.y, dragBox.height, threshold);

  const guides: SnapGuide[] = [];
  let x = dragBox.x;
  let y = dragBox.y;
  if (bestX) {
    x = dragBox.x + bestX.delta;
    guides.push(bestX.reference);
  }
  if (bestY) {
    y = dragBox.y + bestY.delta;
    guides.push(bestY.reference);
  }

  return { x, y, guides };
}

/** Top-left coordinate of `box` along `axis` (x for "vertical", y for "horizontal"). */
function axisStart(box: SnapBox, axis: SnapAxis): number {
  return axis === "vertical" ? box.x : box.y;
}

/** Size of `box` along `axis` (width for "vertical", height for "horizontal"). */
function axisSize(box: SnapBox, axis: SnapAxis): number {
  return axis === "vertical" ? box.width : box.height;
}

/** Whether `a` and `b` overlap on the axis perpendicular to `axis` (required to treat `b` as a same-row/column neighbor). */
function crossAxisOverlaps(a: SnapBox, b: SnapBox, axis: SnapAxis): boolean {
  const crossAxis: SnapAxis = axis === "vertical" ? "horizontal" : "vertical";
  const aStart = axisStart(a, crossAxis);
  const aEnd = aStart + axisSize(a, crossAxis);
  const bStart = axisStart(b, crossAxis);
  const bEnd = bStart + axisSize(b, crossAxis);
  return aStart < bEnd && bStart < aEnd;
}

export interface EqualSpacingSnapResult {
  /** Snapped top-left coordinate along `axis`, canvas-space px. */
  position: number;
  /** Distribution guide to render alongside the snap. */
  guide: SnapGuide;
}

/**
 * Detects when moving `dragBox` along `axis` would equalize the gap between
 * its nearest neighbor on each side, among `otherBoxes` that overlap
 * `dragBox` on the cross axis (non-overlapping boxes aren't in the same
 * row/column and would produce false positives). Requires a qualifying
 * neighbor on BOTH sides (2+ of `otherBoxes`, i.e. 3+ elements total
 * including the dragged one) — with 0 or 1 neighbor there is nothing, or
 * only one gap, to equalize against. Returns `null` when there's no neighbor
 * on each side, or the equalized position falls outside `thresholdPx`
 * (screen-space, converted to canvas-space via `thresholdPx / scale`, same
 * convention as `resolveSnap`).
 */
export function resolveEqualSpacingSnap(
  dragBox: SnapBox,
  otherBoxes: SnapBox[],
  axis: SnapAxis,
  thresholdPx: number,
  scale: number,
): EqualSpacingSnapResult | null {
  const threshold = thresholdPx / scale;
  const qualifying = otherBoxes.filter((box) => crossAxisOverlaps(dragBox, box, axis));
  if (qualifying.length < 2) return null;

  const dragCenter = axisStart(dragBox, axis) + axisSize(dragBox, axis) / 2;
  let before: SnapBox | null = null;
  let after: SnapBox | null = null;
  for (const box of qualifying) {
    const center = axisStart(box, axis) + axisSize(box, axis) / 2;
    // Exact-center ties resolve to `before` (arbitrary but deterministic) —
    // only affects which side "wins" a tie, never the equalization math itself.
    if (center <= dragCenter) {
      if (!before || axisStart(box, axis) + axisSize(box, axis) > axisStart(before, axis) + axisSize(before, axis)) {
        before = box;
      }
    } else if (!after || axisStart(box, axis) < axisStart(after, axis)) {
      after = box;
    }
  }
  if (!before || !after) return null;

  const beforeEnd = axisStart(before, axis) + axisSize(before, axis);
  const afterStart = axisStart(after, axis);
  const gap = (afterStart - beforeEnd - axisSize(dragBox, axis)) / 2;
  const targetStart = beforeEnd + gap;

  const delta = targetStart - axisStart(dragBox, axis);
  if (Math.abs(delta) > threshold) return null;

  const targetCenter = targetStart + axisSize(dragBox, axis) / 2;
  return {
    position: targetStart,
    guide: { axis, position: targetCenter, kind: "spacing" },
  };
}
