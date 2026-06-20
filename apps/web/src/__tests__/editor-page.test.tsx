import { describe, it, expect, vi, beforeEach } from "vitest";

const mockRedirect = vi.fn();

vi.mock("next/navigation", () => ({
  redirect: mockRedirect,
}));

describe("EditorPage — redirects to /batch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls redirect('/batch') when rendered", async () => {
    const { default: EditorPage } = await import("@/app/editor/page");
    // redirect() throws in real Next.js; in tests the mock does not throw
    try {
      EditorPage();
    } catch {
      // ignore any throw — we only care about the call
    }
    expect(mockRedirect).toHaveBeenCalledWith("/batch");
    expect(mockRedirect).toHaveBeenCalledTimes(1);
  });
});
