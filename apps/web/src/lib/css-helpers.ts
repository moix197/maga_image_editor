/** Converts a #rrggbb color + alpha (0..1) to an rgba() string. */
export function withAlpha(color: string, alpha: number): string {
  const hex = color.replace("#", "");
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** Clamps the feather inset so it never exceeds half the smaller dimension. */
function clampFeather(radius: number, width: number, height: number): number {
  return Math.min(radius, width / 2, height / 2);
}

/**
 * Builds an inset linear-gradient mask string that fades all four edges inward
 * by `radius` px. Returns "" when radius is 0 (no mask). The same inset-gradient
 * intent is mirrored by the canvas alpha-gradient feather so preview ~= export.
 */
export function buildFeatherMaskCss(radius: number, width: number, height: number): string {
  if (radius <= 0) return "";
  const inset = clampFeather(radius, width, height);
  const vertical = `linear-gradient(to bottom, transparent 0, black ${inset}px, black calc(100% - ${inset}px), transparent 100%)`;
  const horizontal = `linear-gradient(to right, transparent 0, black ${inset}px, black calc(100% - ${inset}px), transparent 100%)`;
  return `${vertical}, ${horizontal}`;
}
