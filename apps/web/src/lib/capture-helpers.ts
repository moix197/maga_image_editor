/**
 * Returns a Promise that resolves after two animation frames.
 * Used to flush React state updates (e.g. deselect) before DOM capture.
 */
export function waitTwoFrames(): Promise<void> {
  return new Promise<void>((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
  );
}
