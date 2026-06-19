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

  beforeEach(() => {
    ctx = {
      drawImage: vi.fn(),
      save: vi.fn(),
      restore: vi.fn(),
      translate: vi.fn(),
      rotate: vi.fn(),
      beginPath: vi.fn(),
      roundRect: vi.fn(),
      clip: vi.fn(),
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
    expect(ctx.shadowOffsetX).toBe(10); // 5 * pixelRatio
    expect(ctx.shadowOffsetY).toBe(10);
    expect(ctx.shadowBlur).toBe(20); // 10 * pixelRatio
    expect(ctx.shadowColor).toBe("rgba(0, 0, 0, 0.5)");
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
