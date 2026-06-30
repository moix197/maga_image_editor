import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { coverCropDataUrl } from "@/lib/cover-crop";

/**
 * jsdom provides HTMLImageElement but does not decode image data.
 * We stub globalThis.Image with a constructor that fires onload synchronously
 * (via queueMicrotask) and exposes the naturalWidth/Height we set.
 * We also mock canvas getContext so drawImage calls are recorded.
 */

interface DrawRecord {
  x: number;
  y: number;
  w: number;
  h: number;
}

const draws: DrawRecord[] = [];

function makeCtx() {
  return {
    drawImage(_img: unknown, x: number, y: number, w: number, h: number) {
      draws.push({ x, y, w, h });
    },
  };
}

/** Dimensions set by the test before each Image load. */
let imgNaturalWidth = 100;
let imgNaturalHeight = 100;

function buildImageConstructor() {
  return class MockImage {
    naturalWidth = imgNaturalWidth;
    naturalHeight = imgNaturalHeight;
    crossOrigin: string | null = null;
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    private _src = "";
    get src() { return this._src; }
    set src(v: string) {
      this._src = v;
      // Fire onload on the next microtask to simulate async load.
      queueMicrotask(() => this.onload?.());
    }
  };
}

let capturedCanvas: { width: number; height: number; toDataURL: () => string } | null = null;

beforeEach(() => {
  draws.length = 0;
  capturedCanvas = null;
  imgNaturalWidth = 100;
  imgNaturalHeight = 100;

  vi.stubGlobal("Image", buildImageConstructor());

  const originalCreate = document.createElement.bind(document);
  vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
    if (tag === "canvas") {
      const c = {
        width: 0,
        height: 0,
        getContext: vi.fn(() => makeCtx()),
        toDataURL: vi.fn(() => "data:image/png;base64,MOCK"),
      };
      capturedCanvas = c;
      return c as unknown as HTMLElement;
    }
    return originalCreate(tag);
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("coverCropDataUrl", () => {
  it("output canvas dimensions equal the requested slot dims", async () => {
    imgNaturalWidth = 400;
    imgNaturalHeight = 300;
    await coverCropDataUrl("data:image/png;base64,X", 200, 150);
    expect(capturedCanvas!.width).toBe(200);
    expect(capturedCanvas!.height).toBe(150);
  });

  it("wide image into square slot — drawW and drawH both >= slot (cover, no bars)", async () => {
    // Source: 400×200. Slot: 100×100.
    // scale = max(100/400, 100/200) = 0.5
    // drawW = 200 >= 100 ✓  drawH = 100 >= 100 ✓
    imgNaturalWidth = 400;
    imgNaturalHeight = 200;
    await coverCropDataUrl("data:image/png;base64,X", 100, 100);
    expect(draws).toHaveLength(1);
    expect(draws[0]!.w).toBeGreaterThanOrEqual(100);
    expect(draws[0]!.h).toBeGreaterThanOrEqual(100);
  });

  it("tall image into wide slot — cover-fit, both dims fill slot", async () => {
    // Source: 100×400. Slot: 200×100.
    // scale = max(200/100, 100/400) = 2
    // drawW = 200 >= 200 ✓  drawH = 800 >= 100 ✓
    imgNaturalWidth = 100;
    imgNaturalHeight = 400;
    await coverCropDataUrl("data:image/png;base64,X", 200, 100);
    expect(draws).toHaveLength(1);
    expect(draws[0]!.w).toBeGreaterThanOrEqual(200);
    expect(draws[0]!.h).toBeGreaterThanOrEqual(100);
  });

  it("square image into slot — centered (drawX and drawY both zero for equal dims)", async () => {
    // Source: 100×100. Slot: 100×100.
    // scale = 1, drawX = 0, drawY = 0
    imgNaturalWidth = 100;
    imgNaturalHeight = 100;
    await coverCropDataUrl("data:image/png;base64,X", 100, 100);
    expect(draws[0]!.x).toBeCloseTo(0);
    expect(draws[0]!.y).toBeCloseTo(0);
  });

  it("returns a data URL string", async () => {
    const result = await coverCropDataUrl("data:image/png;base64,X", 50, 50);
    expect(result).toMatch(/^data:/);
  });

  it("default scale (omitted) reproduces current 1× output", async () => {
    imgNaturalWidth = 400;
    imgNaturalHeight = 300;
    await coverCropDataUrl("data:image/png;base64,X", 200, 150);
    expect(capturedCanvas!.width).toBe(200);
    expect(capturedCanvas!.height).toBe(150);
  });

  it("scales the crop canvas by the given scale (slot * scale) when within source bounds", async () => {
    imgNaturalWidth = 4000;
    imgNaturalHeight = 3000;
    await coverCropDataUrl("data:image/png;base64,X", 200, 150, 2);
    expect(capturedCanvas!.width).toBe(400);
    expect(capturedCanvas!.height).toBe(300);
  });

  it("clamps output to the source's native size when slot * scale exceeds it, preserving slot aspect ratio", async () => {
    // Slot 200x150 * scale 4 = 800x600 requested, but source is only 400x300.
    // Width is the binding constraint: clamp = 400/800 = 0.5 → 400x300 (== source).
    imgNaturalWidth = 400;
    imgNaturalHeight = 300;
    await coverCropDataUrl("data:image/png;base64,X", 200, 150, 4);
    expect(capturedCanvas!.width).toBe(400);
    expect(capturedCanvas!.height).toBe(300);
  });

  it("clamps asymmetrically without distorting slot aspect ratio when only one axis is the binding constraint", async () => {
    // Slot 100x100 * scale 4 = 400x400 requested. Source is 400x100 (wide).
    // Height is the binding constraint: clamp = 100/400 = 0.25 → 100x100.
    imgNaturalWidth = 400;
    imgNaturalHeight = 100;
    await coverCropDataUrl("data:image/png;base64,X", 100, 100, 4);
    expect(capturedCanvas!.width).toBe(100);
    expect(capturedCanvas!.height).toBe(100);
  });
});
