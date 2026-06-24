import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useFanOutTextHandlers } from "../hooks/use-fan-out-text-handlers";

describe("useFanOutTextHandlers", () => {
  it("handleSetItemTextValue calls setNodeOverride with a content patch once per selected id", () => {
    const setNodeOverride = vi.fn();
    const selectedVariantIds = new Set(["a", "b", "c"]);

    const { result } = renderHook(() =>
      useFanOutTextHandlers({ selectedVariantIds, setNodeOverride, setNodeHidden: vi.fn() })
    );

    act(() => {
      result.current.handleSetItemTextValue("ignored-overlay", "node1", "hello");
    });

    expect(setNodeOverride).toHaveBeenCalledTimes(3);
    expect(setNodeOverride).toHaveBeenCalledWith("a", "node1", { content: "hello" });
    expect(setNodeOverride).toHaveBeenCalledWith("b", "node1", { content: "hello" });
    expect(setNodeOverride).toHaveBeenCalledWith("c", "node1", { content: "hello" });
  });

  it("handleSetItemTextStyle fans a style patch per variant without clobbering", () => {
    const setNodeOverride = vi.fn();
    const selectedVariantIds = new Set(["x", "y"]);

    const { result } = renderHook(() =>
      useFanOutTextHandlers({ selectedVariantIds, setNodeOverride, setNodeHidden: vi.fn() })
    );

    act(() => {
      result.current.handleSetItemTextStyle("ignored", "node2", { color: "#ff0000" });
    });

    expect(setNodeOverride).toHaveBeenCalledTimes(2);
    // Passes the style partial — the underlying setNodeOverride handles merge
    expect(setNodeOverride).toHaveBeenCalledWith("x", "node2", { color: "#ff0000" });
    expect(setNodeOverride).toHaveBeenCalledWith("y", "node2", { color: "#ff0000" });
  });

  it("active variant is always included because selectedVariantIds always contains it", () => {
    const setNodeOverride = vi.fn();
    // active id "a" is always in the set (enforced by BatchWorkspace)
    const selectedVariantIds = new Set(["a"]);

    const { result } = renderHook(() =>
      useFanOutTextHandlers({ selectedVariantIds, setNodeOverride, setNodeHidden: vi.fn() })
    );

    act(() => {
      result.current.handleSetItemTextValue("a", "node1", "text");
    });

    expect(setNodeOverride).toHaveBeenCalledWith("a", "node1", { content: "text" });
  });

  it("handleSetNodeOverride fans an arbitrary patch across every selected id and ignores the overlayId", () => {
    const setNodeOverride = vi.fn();
    const selectedVariantIds = new Set(["a", "b", "c"]);

    const { result } = renderHook(() =>
      useFanOutTextHandlers({ selectedVariantIds, setNodeOverride, setNodeHidden: vi.fn() })
    );

    act(() => {
      result.current.handleSetNodeOverride("ignored-overlay", "node1", { x: 10, y: 20 });
    });

    expect(setNodeOverride).toHaveBeenCalledTimes(3);
    expect(setNodeOverride).toHaveBeenCalledWith("a", "node1", { x: 10, y: 20 });
    expect(setNodeOverride).toHaveBeenCalledWith("b", "node1", { x: 10, y: 20 });
    expect(setNodeOverride).toHaveBeenCalledWith("c", "node1", { x: 10, y: 20 });
    // overlayId arg never leaks into the setter call (selection set decides targets)
    const targetIds = setNodeOverride.mock.calls.map((c: string[]) => c[0]);
    expect(targetIds).not.toContain("ignored-overlay");
  });

  it("only calls setters for ids in the selected set — removed ids not called", () => {
    const setNodeOverride = vi.fn();
    // "c" was removed from selection
    const selectedVariantIds = new Set(["a", "b"]);

    const { result } = renderHook(() =>
      useFanOutTextHandlers({ selectedVariantIds, setNodeOverride, setNodeHidden: vi.fn() })
    );

    act(() => {
      result.current.handleSetItemTextValue("ignored", "node1", "value");
    });

    expect(setNodeOverride).toHaveBeenCalledTimes(2);
    const calledWith = setNodeOverride.mock.calls.map((c: string[]) => c[0]);
    expect(calledWith).not.toContain("c");
  });
});
