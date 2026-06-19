import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useCartoonize } from "@/hooks/use-cartoonize";

// Mock downscaleIfNeeded so tests don't depend on browser canvas APIs
vi.mock("@/lib/image-helpers", () => ({
  downscaleIfNeeded: vi.fn((dataUrl: string) => Promise.resolve(dataUrl)),
}));

const MOCK_DATA_URL = "data:image/png;base64,abc123";
const MOCK_OUTPUT_URL = "data:image/png;base64,cartoonresult";

function mockFetchSequence(...responses: unknown[]) {
  let callIndex = 0;
  vi.stubGlobal("fetch", vi.fn(() => {
    const res = responses[callIndex] ?? responses[responses.length - 1];
    callIndex++;
    return Promise.resolve(res);
  }));
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

// --- enabled state from GET ---

describe("useCartoonize — enabled state", () => {
  it("starts with enabled false before mount effect resolves", () => {
    mockFetchSequence({ json: async () => ({ enabled: true }) });
    const { result } = renderHook(() => useCartoonize());
    expect(result.current.enabled).toBe(false);
  });

  it("sets enabled true when GET returns { enabled: true }", async () => {
    mockFetchSequence({ json: async () => ({ enabled: true }) });
    const { result } = renderHook(() => useCartoonize());
    await waitFor(() => expect(result.current.enabled).toBe(true));
  });

  it("sets enabled false when GET fetch throws", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("network"))));
    const { result } = renderHook(() => useCartoonize());
    await waitFor(() => expect(result.current.enabled).toBe(false));
  });
});

// --- cartoonize() happy path ---

describe("useCartoonize — cartoonize() success", () => {
  beforeEach(() => {
    // First call: GET /api/cartoonize, Second call: POST /api/cartoonize
    mockFetchSequence(
      { json: async () => ({ enabled: true }) },
      { json: async () => ({ outputUrl: MOCK_OUTPUT_URL }) },
    );
  });

  it("calls POST with correct URL, method, and body", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ json: async () => ({ enabled: true }) })
      .mockResolvedValueOnce({ json: async () => ({ outputUrl: MOCK_OUTPUT_URL }) });
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useCartoonize());
    await waitFor(() => expect(result.current.enabled).toBe(true));

    await act(async () => {
      await result.current.cartoonize(MOCK_DATA_URL);
    });

    const postCall = fetchMock.mock.calls[1]!;
    expect(postCall[0]).toBe("/api/cartoonize");
    expect(postCall[1].method).toBe("POST");
    const body = JSON.parse(postCall[1].body);
    expect(body.imageDataUrl).toBe(MOCK_DATA_URL);
  });

  it("returns outputUrl on success", async () => {
    const { result } = renderHook(() => useCartoonize());
    await waitFor(() => expect(result.current.enabled).toBe(true));

    let returnVal: string | null = null;
    await act(async () => {
      returnVal = await result.current.cartoonize(MOCK_DATA_URL);
    });

    expect(returnVal).toBe(MOCK_OUTPUT_URL);
  });

  it("loading is true during request, false after resolve", async () => {
    let resolveFetch!: (v: unknown) => void;
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ json: async () => ({ enabled: true }) })
      .mockImplementationOnce(() => new Promise((res) => { resolveFetch = res; }));
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useCartoonize());
    await waitFor(() => expect(result.current.enabled).toBe(true));

    let cartoonizePromise!: Promise<string | null>;
    act(() => { cartoonizePromise = result.current.cartoonize(MOCK_DATA_URL); });

    // loading should become true
    await waitFor(() => expect(result.current.loading).toBe(true));

    // resolve the fetch
    act(() => { resolveFetch({ json: async () => ({ outputUrl: MOCK_OUTPUT_URL }) }); });
    await act(async () => { await cartoonizePromise; });

    expect(result.current.loading).toBe(false);
  });
});

// --- cartoonize() error paths ---

describe("useCartoonize — cartoonize() error paths", () => {
  it("sets error and returns null on network failure", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ json: async () => ({ enabled: true }) })
      .mockRejectedValueOnce(new Error("Network error"));
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useCartoonize());
    await waitFor(() => expect(result.current.enabled).toBe(true));

    let returnVal: string | null = "sentinel";
    await act(async () => { returnVal = await result.current.cartoonize(MOCK_DATA_URL); });

    expect(returnVal).toBeNull();
    expect(result.current.error).toBeTruthy();
    expect(result.current.loading).toBe(false);
  });

  it("sets error and returns null when response has { disabled: true }", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ json: async () => ({ enabled: true }) })
      .mockResolvedValueOnce({ json: async () => ({ disabled: true, error: "Cartoonize is disabled." }) });
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useCartoonize());
    await waitFor(() => expect(result.current.enabled).toBe(true));

    let returnVal: string | null = "sentinel";
    await act(async () => { returnVal = await result.current.cartoonize(MOCK_DATA_URL); });

    expect(returnVal).toBeNull();
    expect(result.current.error).toBeTruthy();
  });

  it("sets error and returns null when response has { error }", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ json: async () => ({ enabled: true }) })
      .mockResolvedValueOnce({ json: async () => ({ error: "DeepAI rate limit exceeded." }) });
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useCartoonize());
    await waitFor(() => expect(result.current.enabled).toBe(true));

    let returnVal: string | null = "sentinel";
    await act(async () => { returnVal = await result.current.cartoonize(MOCK_DATA_URL); });

    expect(returnVal).toBeNull();
    expect(result.current.error).toMatch(/rate limit/);
  });
});
