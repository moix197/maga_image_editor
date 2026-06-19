import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock html-to-image BEFORE any imports that pull it in
vi.mock("html-to-image", () => ({
  toPng: vi.fn().mockResolvedValue("data:image/png;base64,mock"),
}));

// Mock the canvas post-pass so export-helpers logic is tested in isolation
// (the real post-pass loads images, which never resolve in jsdom).
vi.mock("@/lib/canvas-post-pass", () => ({
  applyImageOverlayPostPass: vi.fn().mockResolvedValue("data:image/png;base64,postpass"),
}));

import * as htmlToImage from "html-to-image";
import { exportCanvasElement } from "@/lib/export-helpers";

// Capture the real createElement before any spy is installed
const realCreateElement = document.createElement.bind(document);

describe("exportCanvasElement", () => {
  let anchor: { href: string; download: string; click: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();
    anchor = { href: "", download: "", click: vi.fn() };
    vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
      if (tag === "a") return anchor as unknown as HTMLElement;
      return realCreateElement(tag);
    });
    Object.defineProperty(document, "fonts", {
      value: { ready: Promise.resolve() },
      writable: true,
      configurable: true,
    });
  });

  it("calls toPng with the element and pixelRatio 2", async () => {
    const el = realCreateElement("div");
    await exportCanvasElement(el, "test.png");
    expect(htmlToImage.toPng).toHaveBeenCalledWith(el, { pixelRatio: 2 });
  });

  it("sets anchor href to the data URL and clicks it", async () => {
    const el = realCreateElement("div");
    await exportCanvasElement(el, "test.png");
    expect(anchor.href).toBe("data:image/png;base64,postpass");
    expect(anchor.download).toBe("test.png");
    expect(anchor.click).toHaveBeenCalledOnce();
  });
});
