import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useBatchProject } from "@/hooks/use-batch-project";
import { useFanOutTextHandlers } from "@/hooks/use-fan-out-text-handlers";
import { useItemText } from "@/hooks/use-item-text";

// ── useBatchProject: setNodeHidden ────────────────────────────────────────────

describe("useBatchProject — setNodeHidden", () => {
  it("hides a node for the given overlay without clobbering other overlays", () => {
    const { result } = renderHook(() => useBatchProject());

    act(() => {
      result.current.setNodeHidden("overlay-a", "node-1", true);
    });

    expect(result.current.itemNodeOverrides["overlay-a"]?.["node-1"]?.hidden).toBe(true);
    // overlay-b untouched
    expect(result.current.itemNodeOverrides["overlay-b"]).toBeUndefined();
  });

  it("setting hidden=true on an already-hidden node is a no-op (referential equality)", () => {
    const { result } = renderHook(() => useBatchProject());

    act(() => {
      result.current.setNodeHidden("overlay-a", "node-1", true);
    });
    const before = result.current.itemNodeOverrides;
    act(() => {
      result.current.setNodeHidden("overlay-a", "node-1", true);
    });
    expect(result.current.itemNodeOverrides).toBe(before);
  });

  it("unhides a previously hidden node", () => {
    const { result } = renderHook(() => useBatchProject());

    act(() => {
      result.current.setNodeHidden("overlay-a", "node-1", true);
    });
    act(() => {
      result.current.setNodeHidden("overlay-a", "node-1", false);
    });

    expect(result.current.itemNodeOverrides["overlay-a"]?.["node-1"]?.hidden).toBe(false);
  });

  it("hides multiple nodes for the same overlay independently", () => {
    const { result } = renderHook(() => useBatchProject());

    act(() => {
      result.current.setNodeHidden("overlay-a", "node-1", true);
      result.current.setNodeHidden("overlay-a", "node-2", true);
    });

    expect(result.current.itemNodeOverrides["overlay-a"]?.["node-1"]?.hidden).toBe(true);
    expect(result.current.itemNodeOverrides["overlay-a"]?.["node-2"]?.hidden).toBe(true);
  });

  it("hiding a node for overlay-a does not affect overlay-b's overrides", () => {
    const { result } = renderHook(() => useBatchProject());

    act(() => {
      result.current.setNodeHidden("overlay-a", "node-1", true);
      result.current.setNodeHidden("overlay-b", "node-2", true);
    });

    expect(result.current.itemNodeOverrides["overlay-a"]?.["node-1"]?.hidden).toBe(true);
    expect(result.current.itemNodeOverrides["overlay-a"]?.["node-2"]).toBeUndefined();
    expect(result.current.itemNodeOverrides["overlay-b"]?.["node-2"]?.hidden).toBe(true);
    expect(result.current.itemNodeOverrides["overlay-b"]?.["node-1"]).toBeUndefined();
  });

  it("unhiding a node from overlay-a does not clobber overlay-b's override", () => {
    const { result } = renderHook(() => useBatchProject());

    act(() => {
      result.current.setNodeHidden("overlay-a", "node-1", true);
      result.current.setNodeHidden("overlay-b", "node-1", true);
    });
    act(() => {
      result.current.setNodeHidden("overlay-a", "node-1", false);
    });

    expect(result.current.itemNodeOverrides["overlay-a"]?.["node-1"]?.hidden).toBe(false);
    expect(result.current.itemNodeOverrides["overlay-b"]?.["node-1"]?.hidden).toBe(true);
  });

  it("hiding preserves a pre-existing content/style override on the same node", () => {
    const { result } = renderHook(() => useBatchProject());

    act(() => {
      result.current.setNodeOverride("overlay-a", "node-1", { content: "hi", fontSize: 24 });
    });
    act(() => {
      result.current.setNodeHidden("overlay-a", "node-1", true);
    });

    expect(result.current.itemNodeOverrides["overlay-a"]?.["node-1"]).toEqual({
      content: "hi",
      fontSize: 24,
      hidden: true,
    });
  });

  it("itemNodeOverrides defaults to {} on load with no field in project", () => {
    const { result } = renderHook(() => useBatchProject());

    // Simulate loading a project without itemNodeOverrides (old project format)
    act(() => {
      result.current.setProject({
        schemaVersion: 5,
        id: "p1",
        name: "test",
        createdAt: 0,
        updatedAt: 0,
        background: { id: "bg", filename: "bg.png", blobKey: "data:bg" },
        overlays: [],
        template: null,
        variableSlot: null,
        outputs: [],
        // itemNodeOverrides intentionally absent
      } as never);
    });

    expect(result.current.itemNodeOverrides).toEqual({});
  });
});

// ── useItemText: isNodeHidden / setNodeHidden ─────────────────────────────────

describe("useItemText — isNodeHidden / setNodeHidden", () => {
  it("isNodeHidden returns false when no override exists for the overlay", () => {
    const { result } = renderHook(() =>
      useItemText({
        itemNodeOverrides: {},
        setNodeOverride: vi.fn(),
        setNodeHidden: vi.fn(),
      }),
    );
    expect(result.current.isNodeHidden("overlay-a", "node-1")).toBe(false);
  });

  it("isNodeHidden returns true when the override carries hidden: true", () => {
    const { result } = renderHook(() =>
      useItemText({
        itemNodeOverrides: { "overlay-a": { "node-1": { hidden: true } } },
        setNodeOverride: vi.fn(),
        setNodeHidden: vi.fn(),
      }),
    );
    expect(result.current.isNodeHidden("overlay-a", "node-1")).toBe(true);
  });

  it("isNodeHidden for a different node in the same overlay returns false", () => {
    const { result } = renderHook(() =>
      useItemText({
        itemNodeOverrides: { "overlay-a": { "node-1": { hidden: true } } },
        setNodeOverride: vi.fn(),
        setNodeHidden: vi.fn(),
      }),
    );
    expect(result.current.isNodeHidden("overlay-a", "node-2")).toBe(false);
  });

  it("setNodeHidden delegates to the provided setNodeHidden callback", () => {
    const mockSetNodeHidden = vi.fn();
    const { result } = renderHook(() =>
      useItemText({
        itemNodeOverrides: {},
        setNodeOverride: vi.fn(),
        setNodeHidden: mockSetNodeHidden,
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
        setNodeOverride: vi.fn(),
        setNodeHidden: mockSetNodeHidden,
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
        setNodeOverride: vi.fn(),
        setNodeHidden: mockSetNodeHidden,
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
        setNodeOverride: vi.fn(),
        setNodeHidden: mockSetNodeHidden,
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

  it("with a single selected id, calls setNodeHidden exactly once", () => {
    const mockSetNodeHidden = vi.fn();
    const selectedVariantIds = new Set(["overlay-a"]);

    const { result } = renderHook(() =>
      useFanOutTextHandlers({
        selectedVariantIds,
        setNodeOverride: vi.fn(),
        setNodeHidden: mockSetNodeHidden,
      }),
    );

    act(() => {
      result.current.handleSetNodeHidden("overlay-a", "node-2", true);
    });

    expect(mockSetNodeHidden).toHaveBeenCalledTimes(1);
    expect(mockSetNodeHidden).toHaveBeenCalledWith("overlay-a", "node-2", true);
  });
});
