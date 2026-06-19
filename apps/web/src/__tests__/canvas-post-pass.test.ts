import { describe, it, expect, vi, beforeEach } from "vitest";
import { toCanvasPx, applyImageOverlayPostPass } from "@/lib/canvas-post-pass";
import type { OverlayNode, NodeId } from "@maga/editor";

function makeNode(partial: Partial<OverlayNode>): OverlayNode {
  return {
    id: "n" as NodeId,
    src: "data:image/png;base64,abc",
    x: 10,
    y: 10,
    width: 100,
    height: 100,
    opacity: 0.7,
    zIndex: 0,
    overlayType: "image",
    ...partial,
  };
}

describe("toCanvasPx", () => {
  it("returns correct px at pixelRatio 1", () => {
    expect(toCanvasPx(50, 800, 1)).toBe(400);
  });

  it("returns correct px at pixelRatio 2", () => {
    expect(toCanvasPx(50, 800, 2)).toBe(800);
    expect(toCanvasPx(10, 600, 2)).toBe(120);
  });
});

/** A mock 2D context plus the call log it appends to. */
type MockCtx = Record<string, unknown>;

/** Mock canvas element exposing its own ctx, recorded as it is created. */
interface MockCanvas {
  width: number;
  height: number;
  getContext: () => MockCtx;
  toDataURL: () => string;
}

describe("applyImageOverlayPostPass", () => {
  // The post-pass creates the MAIN canvas first, then (only when featherRadius > 0)
  // an offscreen canvas inside applyFeatherMask. We hand each a DISTINCT ctx so the
  // tests can verify the real offscreen→main compositing, not just call counts.
  let canvases: MockCanvas[];
  let mainCtx: MockCtx;
  let calls: string[];
  // Snapshot of shadow props captured at the moment the silhouette is filled,
  // since the shadow is intentionally cleared again before drawImage.
  let shadowAtFill: { x: number; y: number; blur: number; color: string } | null;

  // Builds a fresh ctx whose mutating ops append to its own scoped call log,
  // prefixed so we can tell the main ctx apart from the offscreen one.
  const makeCtx = (label: string, log: string[]): MockCtx => {
    const track = (name: string) => vi.fn(() => log.push(`${label}:${name}`));
    const ctx: MockCtx = {
      drawImage: track("drawImage"),
      save: track("save"),
      restore: track("restore"),
      translate: track("translate"),
      rotate: track("rotate"),
      beginPath: track("beginPath"),
      roundRect: track("roundRect"),
      fill: vi.fn(() => {
        log.push(`${label}:fill`);
        shadowAtFill = {
          x: ctx.shadowOffsetX as number,
          y: ctx.shadowOffsetY as number,
          blur: ctx.shadowBlur as number,
          color: ctx.shadowColor as string,
        };
      }),
      clip: track("clip"),
      fillRect: track("fillRect"),
      createLinearGradient: vi.fn(() => {
        log.push(`${label}:createLinearGradient`);
        return { addColorStop: vi.fn() };
      }),
      globalAlpha: 1,
      globalCompositeOperation: "source-over",
      shadowOffsetX: 0,
      shadowOffsetY: 0,
      shadowBlur: 0,
      shadowColor: "",
    };
    return ctx;
  };

  beforeEach(() => {
    calls = [];
    canvases = [];
    shadowAtFill = null;
    // The first canvas created is the main one; reuse its ctx so tests can
    // reference it directly. Later canvases (offscreen feather) each get their own.
    mainCtx = makeCtx("main", calls);

    vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
      if (tag === "canvas") {
        const isFirst = canvases.length === 0;
        const ctx = isFirst ? mainCtx : makeCtx("off", calls);
        const canvas: MockCanvas = {
          width: 0,
          height: 0,
          getContext: () => ctx,
          toDataURL: () => "data:image/png;base64,result",
        };
        canvases.push(canvas);
        return canvas as unknown as HTMLElement;
      }
      return {} as HTMLElement;
    });

    // Mock Image so .src assignment immediately triggers onload.
    class MockImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      crossOrigin = "";
      set src(_v: string) {
        queueMicrotask(() => this.onload?.());
      }
    }
    vi.stubGlobal("Image", MockImage);
  });

  it("returns a string data URL", async () => {
    const result = await applyImageOverlayPostPass(
      "data:image/png;base64,base",
      [makeNode({})],
      800,
      600,
      2,
    );
    expect(typeof result).toBe("string");
    expect(result).toBe("data:image/png;base64,result");
  });

  it("sets shadow ctx props for a node with dropShadow defined", async () => {
    await applyImageOverlayPostPass(
      "data:image/png;base64,base",
      [makeNode({ dropShadow: { x: 5, y: 5, blur: 10, color: "#000000", opacity: 0.5 } })],
      800,
      600,
      2,
    );
    // Shadow props captured when the silhouette is filled (before being cleared).
    expect(shadowAtFill).not.toBeNull();
    expect(shadowAtFill?.x).toBe(10); // 5 * pixelRatio
    expect(shadowAtFill?.y).toBe(10);
    expect(shadowAtFill?.blur).toBe(20); // 10 * pixelRatio
    expect(shadowAtFill?.color).toBe("rgba(0, 0, 0, 0.5)");
  });

  it("bakes drop shadow OUTSIDE the corner-radius clip (combined case)", async () => {
    await applyImageOverlayPostPass(
      "data:image/png;base64,base",
      [
        makeNode({
          cornerRadius: 20,
          dropShadow: { x: 5, y: 5, blur: 10, color: "#000000", opacity: 0.5 },
        }),
      ],
      800,
      600,
      2,
    );

    // The shadow silhouette is filled, then the clip is applied, then the image
    // is drawn under the clip — so the shadow can never be clipped away.
    const fillIdx = calls.indexOf("main:fill");
    const clipIdx = calls.indexOf("main:clip");
    // The first drawImage is the base PNG; the overlay's draw is the last one.
    const drawIdx = calls.lastIndexOf("main:drawImage");
    expect(fillIdx).toBeGreaterThanOrEqual(0);
    expect(clipIdx).toBeGreaterThanOrEqual(0);
    expect(fillIdx).toBeLessThan(clipIdx); // shadow cast before the clip
    expect(clipIdx).toBeLessThan(drawIdx); // image drawn under the clip

    // The silhouette fill happened with the shadow actually configured.
    expect(shadowAtFill?.blur).toBe(20);
    expect(shadowAtFill?.color).toBe("rgba(0, 0, 0, 0.5)");

    // After the unclipped shadow fill, the shadow is disabled before drawImage
    // so the image itself does not re-cast a (clipped) shadow.
    expect(mainCtx.shadowColor).toBe("transparent");
    expect(mainCtx.shadowBlur).toBe(0);
  });

  it("applies node opacity via globalAlpha", async () => {
    await applyImageOverlayPostPass(
      "data:image/png;base64,base",
      [makeNode({ opacity: 0.7 })],
      800,
      600,
      2,
    );
    expect(mainCtx.globalAlpha).toBe(0.7);
  });

  it("feathers on the OFFSCREEN ctx then composites it back onto the main ctx", async () => {
    await applyImageOverlayPostPass(
      "data:image/png;base64,base",
      [makeNode({ featherRadius: 30 })],
      800,
      600,
      2,
    );

    // A second (offscreen) canvas was created inside applyFeatherMask.
    expect(canvases).toHaveLength(2);
    const offCanvas = canvases[1]!;
    const offCtx = offCanvas.getContext();

    // The four edge gradients are carved on the OFFSCREEN ctx, not the main one,
    // under a destination-in composite so only the feathered intersection remains.
    expect(calls.filter((c) => c === "off:createLinearGradient")).toHaveLength(4);
    expect(calls).toContain("off:fillRect");
    expect(calls).not.toContain("main:createLinearGradient");
    // After the four destination-in fills, the offscreen ctx is reset to source-over.
    expect(offCtx.globalCompositeOperation).toBe("source-over");
    // The offscreen ctx was actually driven into destination-in mode at some point.
    expect(offCtx.createLinearGradient).toHaveBeenCalledTimes(4);

    // The MAIN ctx composites the feathered offscreen canvas back via drawImage(off, x, y).
    // x = toCanvasPx(10, 800, 2) = 160, y = toCanvasPx(10, 600, 2) = 120.
    expect(mainCtx.drawImage).toHaveBeenCalledWith(offCanvas, 160, 120);
    // The offscreen ctx draws the source image into itself before feathering.
    expect(offCtx.drawImage).toHaveBeenCalled();
  });

  it("skips an overlay whose image fails to load instead of rejecting", async () => {
    // src "FAIL" triggers onerror; the good node still draws and export resolves.
    class FailingImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      crossOrigin = "";
      set src(v: string) {
        queueMicrotask(() => (v === "FAIL" ? this.onerror?.() : this.onload?.()));
      }
    }
    vi.stubGlobal("Image", FailingImage);

    const result = await applyImageOverlayPostPass(
      "data:image/png;base64,base",
      [makeNode({ src: "FAIL" }), makeNode({})],
      800,
      600,
      2,
    );
    expect(result).toBe("data:image/png;base64,result");
    // Base PNG draw + exactly one successful overlay draw (the failing one is skipped).
    expect(mainCtx.drawImage).toHaveBeenCalledTimes(2);
  });

  it("does NOT create an offscreen canvas when featherRadius is 0 or undefined", async () => {
    await applyImageOverlayPostPass(
      "data:image/png;base64,base",
      [makeNode({ featherRadius: 0 }), makeNode({})],
      800,
      600,
      2,
    );
    // Only the main canvas is created; the offscreen feather path is never taken.
    expect(canvases).toHaveLength(1);
    expect(calls).not.toContain("off:createLinearGradient");
    expect(calls).not.toContain("main:createLinearGradient");
    expect(calls).not.toContain("off:fillRect");
    // The main ctx draws the image directly (base draw + one per node, no offscreen).
    expect(mainCtx.drawImage).toHaveBeenCalled();
  });
});
