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

describe("applyImageOverlayPostPass", () => {
  let ctx: Record<string, unknown>;
  let calls: string[];
  // Snapshot of shadow props captured at the moment the silhouette is filled,
  // since the shadow is intentionally cleared again before drawImage.
  let shadowAtFill: { x: number; y: number; blur: number; color: string } | null;

  beforeEach(() => {
    calls = [];
    shadowAtFill = null;
    const track = (name: string) => vi.fn(() => calls.push(name));
    ctx = {
      drawImage: track("drawImage"),
      save: track("save"),
      restore: track("restore"),
      translate: track("translate"),
      rotate: track("rotate"),
      beginPath: track("beginPath"),
      roundRect: track("roundRect"),
      fill: vi.fn(() => {
        calls.push("fill");
        shadowAtFill = {
          x: ctx.shadowOffsetX as number,
          y: ctx.shadowOffsetY as number,
          blur: ctx.shadowBlur as number,
          color: ctx.shadowColor as string,
        };
      }),
      clip: track("clip"),
      globalAlpha: 1,
      shadowOffsetX: 0,
      shadowOffsetY: 0,
      shadowBlur: 0,
      shadowColor: "",
    };

    vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
      if (tag === "canvas") {
        return {
          width: 0,
          height: 0,
          getContext: () => ctx,
          toDataURL: () => "data:image/png;base64,result",
        } as unknown as HTMLElement;
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
    const fillIdx = calls.indexOf("fill");
    const clipIdx = calls.indexOf("clip");
    // The first drawImage is the base PNG; the overlay's draw is the last one.
    const drawIdx = calls.lastIndexOf("drawImage");
    expect(fillIdx).toBeGreaterThanOrEqual(0);
    expect(clipIdx).toBeGreaterThanOrEqual(0);
    expect(fillIdx).toBeLessThan(clipIdx); // shadow cast before the clip
    expect(clipIdx).toBeLessThan(drawIdx); // image drawn under the clip

    // The silhouette fill happened with the shadow actually configured.
    expect(shadowAtFill?.blur).toBe(20);
    expect(shadowAtFill?.color).toBe("rgba(0, 0, 0, 0.5)");

    // After the unclipped shadow fill, the shadow is disabled before drawImage
    // so the image itself does not re-cast a (clipped) shadow.
    expect(ctx.shadowColor).toBe("transparent");
    expect(ctx.shadowBlur).toBe(0);
  });

  it("applies node opacity via globalAlpha", async () => {
    await applyImageOverlayPostPass(
      "data:image/png;base64,base",
      [makeNode({ opacity: 0.7 })],
      800,
      600,
      2,
    );
    expect(ctx.globalAlpha).toBe(0.7);
  });
});
