import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  isCartoonizeEnabled,
  dataUrlToBuffer,
  cartoonizeBuffer,
  fetchOutputAsDataUrl,
  cartoonizeDataUrl,
} from "@/lib/cartoonize-service";

// --- isCartoonizeEnabled ---

describe("isCartoonizeEnabled", () => {
  it("returns false when DEEPAI_API_KEY is absent", () => {
    delete process.env.DEEPAI_API_KEY;
    expect(isCartoonizeEnabled()).toBe(false);
  });

  it("returns true when DEEPAI_API_KEY is set", () => {
    process.env.DEEPAI_API_KEY = "test-key";
    expect(isCartoonizeEnabled()).toBe(true);
    delete process.env.DEEPAI_API_KEY;
  });
});

// --- dataUrlToBuffer ---

describe("dataUrlToBuffer", () => {
  it("decodes a known base64 string and extracts mimeType", () => {
    const text = "hello";
    const base64 = Buffer.from(text).toString("base64");
    const dataUrl = `data:image/jpeg;base64,${base64}`;
    const { buffer, mimeType } = dataUrlToBuffer(dataUrl);
    expect(mimeType).toBe("image/jpeg");
    expect(buffer.toString("utf8")).toBe(text);
  });

  it("handles image/png mimeType", () => {
    const dataUrl = `data:image/png;base64,${Buffer.from("x").toString("base64")}`;
    const { mimeType } = dataUrlToBuffer(dataUrl);
    expect(mimeType).toBe("image/png");
  });
});

// --- cartoonizeBuffer ---

describe("cartoonizeBuffer", () => {
  beforeEach(() => {
    process.env.DEEPAI_API_KEY = "test-key";
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.DEEPAI_API_KEY;
  });

  it("calls DeepAI with correct URL, method, and api-key header", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ output_url: "https://cdn.deepai.org/result.jpg" }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const buf = Buffer.from("img");
    await cartoonizeBuffer(buf, "image/jpeg");

    expect(mockFetch).toHaveBeenCalledOnce();
    const call = mockFetch.mock.calls[0]!;
    const [url, opts] = call;
    expect(url).toBe("https://api.deepai.org/api/toonify");
    expect(opts.method).toBe("POST");
    expect(opts.headers["api-key"]).toBe("test-key");

    vi.unstubAllGlobals();
  });

  it("returns output_url on success", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ output_url: "https://cdn.deepai.org/result.jpg" }),
    }));

    const result = await cartoonizeBuffer(Buffer.from("img"), "image/jpeg");
    expect(result).toBe("https://cdn.deepai.org/result.jpg");

    vi.unstubAllGlobals();
  });

  it("throws rate limit message on HTTP 429", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 429, json: async () => ({}) }));
    await expect(cartoonizeBuffer(Buffer.from("img"), "image/jpeg")).rejects.toThrow("rate limit exceeded");
    vi.unstubAllGlobals();
  });

  it("throws quota exceeded message on HTTP 402", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 402, json: async () => ({}) }));
    await expect(cartoonizeBuffer(Buffer.from("img"), "image/jpeg")).rejects.toThrow("quota exceeded");
    vi.unstubAllGlobals();
  });

  it("throws quota exceeded message on HTTP 403", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 403, json: async () => ({}) }));
    await expect(cartoonizeBuffer(Buffer.from("img"), "image/jpeg")).rejects.toThrow("quota exceeded");
    vi.unstubAllGlobals();
  });

  it("throws generic error on other non-ok response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) }));
    await expect(cartoonizeBuffer(Buffer.from("img"), "image/jpeg")).rejects.toThrow("500");
    vi.unstubAllGlobals();
  });

  it("throws when output_url is missing from response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ output_url: null }),
    }));
    await expect(cartoonizeBuffer(Buffer.from("img"), "image/jpeg")).rejects.toThrow("missing output_url");
    vi.unstubAllGlobals();
  });
});

// --- fetchOutputAsDataUrl ---

describe("fetchOutputAsDataUrl", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fetches CDN URL and returns a data: base64 string", async () => {
    const fakeBytes = Buffer.from("fake-image-bytes");
    // Copy to a standalone ArrayBuffer so Buffer.from() in the service re-reads correctly
    const arrayBuffer = fakeBytes.buffer.slice(fakeBytes.byteOffset, fakeBytes.byteOffset + fakeBytes.byteLength);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      headers: { get: () => "image/jpeg" },
      arrayBuffer: async () => arrayBuffer,
    }));

    const result = await fetchOutputAsDataUrl("https://cdn.deepai.org/result.jpg");
    expect(result.startsWith("data:image/jpeg;base64,")).toBe(true);
    const decoded = Buffer.from(result.split(",")[1]!, "base64").toString();
    expect(decoded).toBe("fake-image-bytes");
  });
});

// --- cartoonizeDataUrl ---

describe("cartoonizeDataUrl", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    delete process.env.DEEPAI_API_KEY;
  });

  it("end-to-end returns a base64 data URL, not a CDN URL", async () => {
    process.env.DEEPAI_API_KEY = "test-key";

    const inputDataUrl = `data:image/png;base64,${Buffer.from("pixel").toString("base64")}`;

    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ output_url: "https://cdn.deepai.org/toon.jpg" }),
      })
      .mockResolvedValueOnce({
        headers: { get: () => "image/jpeg" },
        arrayBuffer: async () => Buffer.from("cartoon").buffer,
      })
    );

    const result = await cartoonizeDataUrl(inputDataUrl);
    expect(result.startsWith("data:")).toBe(true);
    expect(result).not.toContain("https://");
  });
});
