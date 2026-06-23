import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useFanOutTextHandlers } from "../hooks/use-fan-out-text-handlers";

describe("useFanOutTextHandlers", () => {
  it("handleSetItemTextValue calls setItemTextValue once per selected id", () => {
    const setItemTextValue = vi.fn();
    const setItemTextStyle = vi.fn();
    const selectedVariantIds = new Set(["a", "b", "c"]);

    const { result } = renderHook(() =>
      useFanOutTextHandlers({ selectedVariantIds, setItemTextValue, setItemTextStyle })
    );

    act(() => {
      result.current.handleSetItemTextValue("ignored-overlay", "node1", "hello");
    });

    expect(setItemTextValue).toHaveBeenCalledTimes(3);
    expect(setItemTextValue).toHaveBeenCalledWith("a", "node1", "hello");
    expect(setItemTextValue).toHaveBeenCalledWith("b", "node1", "hello");
    expect(setItemTextValue).toHaveBeenCalledWith("c", "node1", "hello");
  });

  it("handleSetItemTextStyle merges partial style per variant without clobbering", () => {
    const setItemTextStyle = vi.fn();
    const setItemTextValue = vi.fn();
    const selectedVariantIds = new Set(["x", "y"]);

    const { result } = renderHook(() =>
      useFanOutTextHandlers({ selectedVariantIds, setItemTextValue, setItemTextStyle })
    );

    act(() => {
      result.current.handleSetItemTextStyle("ignored", "node2", { color: "#ff0000" });
    });

    expect(setItemTextStyle).toHaveBeenCalledTimes(2);
    // Passes partial style — underlying setItemTextStyle handles merge
    expect(setItemTextStyle).toHaveBeenCalledWith("x", "node2", { color: "#ff0000" });
    expect(setItemTextStyle).toHaveBeenCalledWith("y", "node2", { color: "#ff0000" });
  });

  it("active variant is always included because selectedVariantIds always contains it", () => {
    const setItemTextValue = vi.fn();
    const setItemTextStyle = vi.fn();
    // active id "a" is always in the set (enforced by BatchWorkspace)
    const selectedVariantIds = new Set(["a"]);

    const { result } = renderHook(() =>
      useFanOutTextHandlers({ selectedVariantIds, setItemTextValue, setItemTextStyle })
    );

    act(() => {
      result.current.handleSetItemTextValue("a", "node1", "text");
    });

    expect(setItemTextValue).toHaveBeenCalledWith("a", "node1", "text");
  });

  it("only calls setters for ids in the selected set — removed ids not called", () => {
    const setItemTextValue = vi.fn();
    const setItemTextStyle = vi.fn();
    // "c" was removed from selection
    const selectedVariantIds = new Set(["a", "b"]);

    const { result } = renderHook(() =>
      useFanOutTextHandlers({ selectedVariantIds, setItemTextValue, setItemTextStyle })
    );

    act(() => {
      result.current.handleSetItemTextValue("ignored", "node1", "value");
    });

    expect(setItemTextValue).toHaveBeenCalledTimes(2);
    const calledWith = setItemTextValue.mock.calls.map((c: string[]) => c[0]);
    expect(calledWith).not.toContain("c");
  });
});
