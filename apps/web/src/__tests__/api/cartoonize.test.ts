import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock next/server before importing the route
vi.mock("next/server", () => ({
  NextResponse: {
    json: (data: unknown, init?: { status?: number }) => ({
      status: init?.status ?? 200,
      data,
      json: async () => data,
    }),
  },
}));

// Mock cartoonize-service so the route tests control behaviour
vi.mock("@/lib/cartoonize-service", () => ({
  isCartoonizeEnabled: vi.fn(),
  cartoonizeDataUrl: vi.fn(),
}));

import { GET, POST } from "@/app/api/cartoonize/route";
import { isCartoonizeEnabled, cartoonizeDataUrl } from "@/lib/cartoonize-service";

const mockEnabled = vi.mocked(isCartoonizeEnabled);
const mockCartoonize = vi.mocked(cartoonizeDataUrl);

function makeRequest(body: unknown): Request {
  return {
    json: async () => body,
  } as unknown as Request;
}

function makeMalformedRequest(): Request {
  return {
    json: async () => { throw new SyntaxError("Unexpected token"); },
  } as unknown as Request;
}

// --- GET ---

describe("GET /api/cartoonize", () => {
  afterEach(() => vi.clearAllMocks());

  it("returns { enabled: false } when key is absent", async () => {
    mockEnabled.mockReturnValue(false);
    const res = await GET();
    expect((res as any).data).toEqual({ enabled: false });
    expect((res as any).status).toBe(200);
  });

  it("returns { enabled: true } when key is present", async () => {
    mockEnabled.mockReturnValue(true);
    const res = await GET();
    expect((res as any).data).toEqual({ enabled: true });
  });
});

// --- POST ---

describe("POST /api/cartoonize", () => {
  beforeEach(() => {
    mockEnabled.mockReturnValue(true);
  });

  afterEach(() => vi.clearAllMocks());

  it("returns 400 when request body is malformed JSON", async () => {
    const res = await POST(makeMalformedRequest());
    expect((res as any).status).toBe(400);
    expect((res as any).data.error).toBe("Invalid request body");
  });

  it("returns 400 when imageDataUrl is missing", async () => {
    const res = await POST(makeRequest({}));
    expect((res as any).status).toBe(400);
  });

  it("returns 400 when imageDataUrl does not start with data:image/", async () => {
    const res = await POST(makeRequest({ imageDataUrl: "data:text/plain;base64,abc" }));
    expect((res as any).status).toBe(400);
    expect((res as any).data.error).toBe("Invalid image format");
  });

  it("returns 413 when imageDataUrl exceeds the size limit", async () => {
    const oversized = "data:image/jpeg;base64," + "A".repeat(14_000_001);
    const res = await POST(makeRequest({ imageDataUrl: oversized }));
    expect((res as any).status).toBe(413);
    expect((res as any).data.error).toBe("Image too large");
  });

  it("returns 503 with disabled:true when key is absent", async () => {
    mockEnabled.mockReturnValue(false);
    const res = await POST(makeRequest({ imageDataUrl: "data:image/jpeg;base64,abc" }));
    expect((res as any).status).toBe(503);
    expect((res as any).data.disabled).toBe(true);
  });

  it("returns outputUrl on success", async () => {
    mockCartoonize.mockResolvedValue("data:image/jpeg;base64,result");
    const res = await POST(makeRequest({ imageDataUrl: "data:image/jpeg;base64,abc" }));
    expect((res as any).status).toBe(200);
    expect((res as any).data.outputUrl).toBe("data:image/jpeg;base64,result");
  });

  it("returns 502 when cartoonizeDataUrl throws", async () => {
    mockCartoonize.mockRejectedValue(new Error("DeepAI rate limit exceeded. Try again later."));
    const res = await POST(makeRequest({ imageDataUrl: "data:image/jpeg;base64,abc" }));
    expect((res as any).status).toBe(502);
    expect((res as any).data.error).toMatch(/rate limit/);
  });
});
