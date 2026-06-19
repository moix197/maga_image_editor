import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useCartoonize } from "@/hooks/use-cartoonize";

vi.mock("@/lib/image-helpers", () => ({
  downscaleIfNeeded: vi.fn((dataUrl: string) => Promise.resolve(dataUrl)),
}));

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("useCartoonize — disabled state", () => {
  it("enabled is false when GET returns { enabled: false }", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ json: async () => ({ enabled: false }) });
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useCartoonize());

    // Wait until the GET fetch has been called (effect has run)
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/cartoonize"));

    // After the effect settles, enabled must still be false
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(result.current.enabled).toBe(false);
  });
});
