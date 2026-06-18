import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  validateImageFile,
  fileToDataUrl,
  downscaleIfNeeded,
  downloadDataUrl,
} from "@/lib/image-helpers";

function makeFile(name: string, type: string, sizeBytes: number): File {
  const content = new Uint8Array(sizeBytes);
  return new File([content], name, { type });
}

// --- validateImageFile ---

describe("validateImageFile", () => {
  it("accepts jpeg", () => {
    expect(validateImageFile(makeFile("a.jpg", "image/jpeg", 100)).valid).toBe(true);
  });

  it("accepts png", () => {
    expect(validateImageFile(makeFile("a.png", "image/png", 100)).valid).toBe(true);
  });

  it("accepts webp", () => {
    expect(validateImageFile(makeFile("a.webp", "image/webp", 100)).valid).toBe(true);
  });

  it("accepts gif", () => {
    expect(validateImageFile(makeFile("a.gif", "image/gif", 100)).valid).toBe(true);
  });

  it("rejects unsupported type", () => {
    const result = validateImageFile(makeFile("a.txt", "text/plain", 100));
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/unsupported/i);
  });

  it("rejects files over 20 MB", () => {
    const size = 21 * 1024 * 1024;
    const result = validateImageFile(makeFile("big.jpg", "image/jpeg", size));
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/too large/i);
  });

  it("accepts file exactly at 20 MB", () => {
    const size = 20 * 1024 * 1024;
    expect(validateImageFile(makeFile("edge.jpg", "image/jpeg", size)).valid).toBe(true);
  });
});

// --- fileToDataUrl ---

describe("fileToDataUrl", () => {
  it("resolves a data URL string", async () => {
    const file = makeFile("a.png", "image/png", 10);
    const result = await fileToDataUrl(file);
    expect(typeof result).toBe("string");
    expect(result.startsWith("data:")).toBe(true);
  });
});

// --- downscaleIfNeeded ---

describe("downscaleIfNeeded", () => {
  const SMALL_DATA_URL = "data:image/png;base64,small";
  const LARGE_DATA_URL = "data:image/png;base64,large";

  beforeEach(() => {
    // Mock Image
    vi.stubGlobal("Image", class {
      width = 0;
      height = 0;
      onload: (() => void) | null = null;
      set src(value: string) {
        if (value === SMALL_DATA_URL) {
          this.width = 100;
          this.height = 100;
        } else {
          this.width = 4000;
          this.height = 3000;
        }
        this.onload?.();
      }
    });

    // Mock canvas
    const mockCtx = { drawImage: vi.fn() };
    const mockCanvas = {
      width: 0,
      height: 0,
      getContext: () => mockCtx,
      toDataURL: () => "data:image/png;base64,downscaled",
    };
    vi.stubGlobal("document", {
      createElement: (tag: string) => tag === "canvas" ? mockCanvas : { href: "", download: "", click: vi.fn() },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns original when within bounds", async () => {
    const result = await downscaleIfNeeded(SMALL_DATA_URL, 2048);
    expect(result).toBe(SMALL_DATA_URL);
  });

  it("returns downscaled URL when image exceeds maxDimension", async () => {
    const result = await downscaleIfNeeded(LARGE_DATA_URL, 2048);
    expect(result).toBe("data:image/png;base64,downscaled");
  });
});

// --- downloadDataUrl ---

describe("downloadDataUrl", () => {
  it("creates anchor and calls click", () => {
    const clickMock = vi.fn();
    vi.stubGlobal("document", {
      createElement: () => ({ href: "", download: "", click: clickMock }),
    });

    downloadDataUrl("data:image/png;base64,abc", "output.png");
    expect(clickMock).toHaveBeenCalledOnce();

    vi.unstubAllGlobals();
  });
});
