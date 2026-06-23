import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useBatchProject } from "@/hooks/use-batch-project";
import { useFanOutTextHandlers } from "@/hooks/use-fan-out-text-handlers";
import { useItemText } from "@/hooks/use-item-text";

// ── useBatchProject: setItemNodeHidden ────────────────────────────────────────

describe("useBatchProject — setItemNodeHidden", () => {
  it("hides a node for the given overlay without clobbering other overlays", () => {
    const { result } = renderHook(() => useBatchProject());

    act(() => {
      result.current.setItemNodeHidden("overlay-a", "node-1", true);
    });

    expect(result.current.itemHiddenNodeIds["overlay-a"]).toContain("node-1");
    // overlay-b untouched
    expect(result.current.itemHiddenNodeIds["overlay-b"]).toBeUndefined();
  });

  it("does not duplicate a nodeId already hidden for an overlay", () => {
    const { result } = renderHook(() => useBatchProject());

    act(() => {
      result.current.setItemNodeHidden("overlay-a", "node-1", true);
      result.current.setItemNodeHidden("overlay-a", "node-1", true);
    });

    const ids = result.current.itemHiddenNodeIds["overlay-a"] ?? [];
    expect(ids.filter((id) => id === "node-1")).toHaveLength(1);
  });

  it("unhides a previously hidden node", () => {
    const { result } = renderHook(() => useBatchProject());

    act(() => {
      result.current.setItemNodeHidden("overlay-a", "node-1", true);
    });
    act(() => {
      result.current.setItemNodeHidden("overlay-a", "node-1", false);
    });

    expect(result.current.itemHiddenNodeIds["overlay-a"] ?? []).not.toContain("node-1");
  });

  it("hides multiple nodes for the same overlay independently", () => {
    const { result } = renderHook(() => useBatchProject());

    act(() => {
      result.current.setItemNodeHidden("overlay-a", "node-1", true);
      result.current.setItemNodeHidden("overlay-a", "node-2", true);
    });

    const ids = result.current.itemHiddenNodeIds["overlay-a"] ?? [];
    expect(ids).toContain("node-1");
    expect(ids).toContain("node-2");
  });

  it("hiding a node for overlay-a does not affect overlay-b's hidden list", () => {
    const { result } = renderHook(() => useBatchProject());

    act(() => {
      result.current.setItemNodeHidden("overlay-a", "node-1", true);
      result.current.setItemNodeHidden("overlay-b", "node-2", true);
    });

    const a = result.current.itemHiddenNodeIds["overlay-a"] ?? [];
    const b = result.current.itemHiddenNodeIds["overlay-b"] ?? [];
    expect(a).toContain("node-1");
    expect(a).not.toContain("node-2");
    expect(b).toContain("node-2");
    expect(b).not.toContain("node-1");
  });

  it("unhiding a node from overlay-a does not clobber overlay-b's list", () => {
    const { result } = renderHook(() => useBatchProject());

    act(() => {
      result.current.setItemNodeHidden("overlay-a", "node-1", true);
      result.current.setItemNodeHidden("overlay-b", "node-1", true);
    });
    act(() => {
      result.current.setItemNodeHidden("overlay-a", "node-1", false);
    });

    expect(result.current.itemHiddenNodeIds["overlay-a"] ?? []).not.toContain("node-1");
    expect(result.current.itemHiddenNodeIds["overlay-b"] ?? []).toContain("node-1");
  });

  it("itemHiddenNodeIds defaults to {} on load with no field in project", () => {
    const { result } = renderHook(() => useBatchProject());

    // Simulate loading a project without itemHiddenNodeIds (old project format)
    act(() => {
      result.current.setProject({
        schemaVersion: 4,
        id: "p1",
        name: "test",
        createdAt: 0,
        updatedAt: 0,
        background: { id: "bg", filename: "bg.png", blobKey: "data:bg" },
        overlays: [],
        template: null,
        variableSlot: null,
        outputs: [],
        itemTextValues: {},
        itemTextStyles: {},
        // itemHiddenNodeIds intentionally absent
      });
    });

    expect(result.current.itemHiddenNodeIds).toEqual({});
  });
});

// ── useItemText: isNodeHidden / setNodeHidden ─────────────────────────────────

describe("useItemText — isNodeHidden / setNodeHidden", () => {
  it("isNodeHidden returns false when no hidden ids exist for the overlay", () => {
    const { result } = renderHook(() =>
      useItemText({
        itemTextValues: {},
        itemTextStyles: {},
        itemHiddenNodeIds: {},
        setItemTextValue: vi.fn(),
        setItemTextStyle: vi.fn(),
        setItemNodeHidden: vi.fn(),
      }),
    );
    expect(result.current.isNodeHidden("overlay-a", "node-1")).toBe(false);
  });

  it("isNodeHidden returns true when node is in the overlay's hidden list", () => {
    const { result } = renderHook(() =>
      useItemText({
        itemTextValues: {},
        itemTextStyles: {},
        itemHiddenNodeIds: { "overlay-a": ["node-1"] },
        setItemTextValue: vi.fn(),
        setItemTextStyle: vi.fn(),
        setItemNodeHidden: vi.fn(),
      }),
    );
    expect(result.current.isNodeHidden("overlay-a", "node-1")).toBe(true);
  });

  it("isNodeHidden for a different node in the same overlay returns false", () => {
    const { result } = renderHook(() =>
      useItemText({
        itemTextValues: {},
        itemTextStyles: {},
        itemHiddenNodeIds: { "overlay-a": ["node-1"] },
        setItemTextValue: vi.fn(),
        setItemTextStyle: vi.fn(),
        setItemNodeHidden: vi.fn(),
      }),
    );
    expect(result.current.isNodeHidden("overlay-a", "node-2")).toBe(false);
  });

  it("setNodeHidden delegates to the provided setItemNodeHidden callback", () => {
    const mockSetNodeHidden = vi.fn();
    const { result } = renderHook(() =>
      useItemText({
        itemTextValues: {},
        itemTextStyles: {},
        itemHiddenNodeIds: {},
        setItemTextValue: vi.fn(),
        setItemTextStyle: vi.fn(),
        setItemNodeHidden: mockSetNodeHidden,
      }),
    );

    result.current.setNodeHidden("overlay-a", "node-1", true);
    expect(mockSetNodeHidden).toHaveBeenCalledWith("overlay-a", "node-1", true);
  });
});

// ── useFanOutTextHandlers: handleSetNodeHidden ────────────────────────────────

describe("useFanOutTextHandlers — handleSetNodeHidden", () => {
  it("fans out hide to all selected variant ids", () => {
    const mockSetNodeHidden = vi.fn();
    const selectedVariantIds = new Set(["overlay-a", "overlay-b", "overlay-c"]);

    const { result } = renderHook(() =>
      useFanOutTextHandlers({
        selectedVariantIds,
        setItemTextValue: vi.fn(),
        setItemTextStyle: vi.fn(),
        setItemNodeHidden: mockSetNodeHidden,
      }),
    );

    act(() => {
      result.current.handleSetNodeHidden("overlay-a", "node-1", true);
    });

    expect(mockSetNodeHidden).toHaveBeenCalledTimes(3);
    expect(mockSetNodeHidden).toHaveBeenCalledWith("overlay-a", "node-1", true);
    expect(mockSetNodeHidden).toHaveBeenCalledWith("overlay-b", "node-1", true);
    expect(mockSetNodeHidden).toHaveBeenCalledWith("overlay-c", "node-1", true);
  });

  it("fans out unhide (hidden=false) to all selected ids", () => {
    const mockSetNodeHidden = vi.fn();
    const selectedVariantIds = new Set(["overlay-a", "overlay-b"]);

    const { result } = renderHook(() =>
      useFanOutTextHandlers({
        selectedVariantIds,
        setItemTextValue: vi.fn(),
        setItemTextStyle: vi.fn(),
        setItemNodeHidden: mockSetNodeHidden,
      }),
    );

    act(() => {
      result.current.handleSetNodeHidden("overlay-a", "node-1", false);
    });

    expect(mockSetNodeHidden).toHaveBeenCalledTimes(2);
    expect(mockSetNodeHidden).toHaveBeenCalledWith("overlay-a", "node-1", false);
    expect(mockSetNodeHidden).toHaveBeenCalledWith("overlay-b", "node-1", false);
  });

  it("ignores the passed overlayAssetId and fans to selectedVariantIds", () => {
    // The first arg (_overlayAssetId) is intentionally ignored — fan-out
    // always iterates selectedVariantIds, matching the value/style handlers.
    const mockSetNodeHidden = vi.fn();
    const selectedVariantIds = new Set(["overlay-x", "overlay-y"]);

    const { result } = renderHook(() =>
      useFanOutTextHandlers({
        selectedVariantIds,
        setItemTextValue: vi.fn(),
        setItemTextStyle: vi.fn(),
        setItemNodeHidden: mockSetNodeHidden,
      }),
    );

    act(() => {
      // Passing "overlay-z" as the first arg (ignored)
      result.current.handleSetNodeHidden("overlay-z", "node-1", true);
    });

    const calledIds = mockSetNodeHidden.mock.calls.map((c) => c[0]);
    expect(calledIds).toContain("overlay-x");
    expect(calledIds).toContain("overlay-y");
    expect(calledIds).not.toContain("overlay-z");
  });

  it("with a single selected id, calls setItemNodeHidden exactly once", () => {
    const mockSetNodeHidden = vi.fn();
    const selectedVariantIds = new Set(["overlay-a"]);

    const { result } = renderHook(() =>
      useFanOutTextHandlers({
        selectedVariantIds,
        setItemTextValue: vi.fn(),
        setItemTextStyle: vi.fn(),
        setItemNodeHidden: mockSetNodeHidden,
      }),
    );

    act(() => {
      result.current.handleSetNodeHidden("overlay-a", "node-2", true);
    });

    expect(mockSetNodeHidden).toHaveBeenCalledTimes(1);
    expect(mockSetNodeHidden).toHaveBeenCalledWith("overlay-a", "node-2", true);
  });
});
