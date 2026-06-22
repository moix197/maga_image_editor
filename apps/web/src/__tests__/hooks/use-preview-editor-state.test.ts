import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";
import { usePreviewEditorState } from "@/hooks/use-preview-editor-state";
import type { EditorState } from "@maga/editor";
import type { TextStyle } from "@maga/projects";

// --- helpers ---

type NodeId = string & { readonly __brand: "NodeId" };

function makeNodeId(s: string): NodeId {
  return s as NodeId;
}

function makeBase(...textNodes: { id: string; content: string; fontSize?: number; color?: string }[]): EditorState {
  return {
    nodes: textNodes.map((t) => ({
      id: makeNodeId(t.id),
      content: t.content,
      x: 0,
      y: 0,
      rotation: 0,
      zIndex: 0,
      fontSize: t.fontSize ?? 16,
      color: t.color ?? "#000000",
      opacity: 1,
      fontFamily: "Arial",
      fontWeight: "400",
      fontStyle: "normal",
      shadow: null,
      textBackground: null,
    })),
  };
}

const OVERLAY_A = "overlay-a";
const NODE_1 = "node-1";
const NODE_2 = "node-2";

// --- tests ---

describe("usePreviewEditorState", () => {
  it("(1) unlocked layer gets per-item content override applied", () => {
    const base = makeBase({ id: NODE_1, content: "template text" });
    const itemTextValues = { [OVERLAY_A]: { [NODE_1]: "per-item text" } };
    const itemTextStyles: Record<string, Record<string, Partial<TextStyle>>> = {};
    const textLayerLocks: Record<string, boolean> = {};

    const { result } = renderHook(() =>
      usePreviewEditorState(base, OVERLAY_A, itemTextValues, itemTextStyles, textLayerLocks),
    );

    const node = result.current.nodes[0]!;
    expect(node).toHaveProperty("content", "per-item text");
  });

  it("(2) unlocked layer gets per-item style override applied", () => {
    const base = makeBase({ id: NODE_1, content: "hello", fontSize: 16, color: "#000000" });
    const itemTextValues: Record<string, Record<string, string>> = {};
    const itemTextStyles = {
      [OVERLAY_A]: { [NODE_1]: { fontSize: 32, color: "#ff0000" } as Partial<TextStyle> },
    };
    const textLayerLocks: Record<string, boolean> = {};

    const { result } = renderHook(() =>
      usePreviewEditorState(base, OVERLAY_A, itemTextValues, itemTextStyles, textLayerLocks),
    );

    const node = result.current.nodes[0]!;
    expect(node).toHaveProperty("fontSize", 32);
    expect(node).toHaveProperty("color", "#ff0000");
    // content unchanged
    expect(node).toHaveProperty("content", "hello");
  });

  it("(3) locked layer retains template value regardless of per-item override", () => {
    const base = makeBase({ id: NODE_1, content: "template text" });
    const itemTextValues = { [OVERLAY_A]: { [NODE_1]: "should not appear" } };
    const itemTextStyles = {
      [OVERLAY_A]: { [NODE_1]: { fontSize: 99 } as Partial<TextStyle> },
    };
    const textLayerLocks: Record<string, boolean> = { [NODE_1]: true };

    const { result } = renderHook(() =>
      usePreviewEditorState(base, OVERLAY_A, itemTextValues, itemTextStyles, textLayerLocks),
    );

    const node = result.current.nodes[0]!;
    expect(node).toHaveProperty("content", "template text");
    expect(node).toHaveProperty("fontSize", 16);
  });

  it("(4) returns base state unchanged when activeOverlayId is null", () => {
    const base = makeBase({ id: NODE_1, content: "template text" });
    const itemTextValues = { [OVERLAY_A]: { [NODE_1]: "per-item text" } };
    const itemTextStyles: Record<string, Record<string, Partial<TextStyle>>> = {};
    const textLayerLocks: Record<string, boolean> = {};

    const { result } = renderHook(() =>
      usePreviewEditorState(base, null, itemTextValues, itemTextStyles, textLayerLocks),
    );

    expect(result.current).toBe(base);
  });

  it("(5) memoization — same reference returned when deps unchanged", () => {
    const base = makeBase({ id: NODE_1, content: "template text" });
    const itemTextValues = { [OVERLAY_A]: { [NODE_1]: "per-item text" } };
    const itemTextStyles: Record<string, Record<string, Partial<TextStyle>>> = {};
    const textLayerLocks: Record<string, boolean> = {};

    const { result, rerender } = renderHook(() =>
      usePreviewEditorState(base, OVERLAY_A, itemTextValues, itemTextStyles, textLayerLocks),
    );

    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
  });

  it("(6) variant with empty override map returns base state unchanged (no crash)", () => {
    const base = makeBase({ id: NODE_1, content: "template text" });
    const itemTextValues: Record<string, Record<string, string>> = {};
    const itemTextStyles: Record<string, Record<string, Partial<TextStyle>>> = {};
    const textLayerLocks: Record<string, boolean> = {};

    const { result } = renderHook(() =>
      usePreviewEditorState(base, OVERLAY_A, itemTextValues, itemTextStyles, textLayerLocks),
    );

    // No overrides for OVERLAY_A — should return base unchanged (same reference)
    expect(result.current).toBe(base);
  });

  it("(7) selectedNodeId change on editorState does NOT cause a new derived object", () => {
    // EditorState only has `nodes`. Adding/removing selectedNodeId-style field
    // is not part of EditorState — it lives outside. But we simulate the key
    // concern: if `base` reference stays the same, derived result is the same.
    const base = makeBase({ id: NODE_1, content: "template text" });
    const itemTextValues = { [OVERLAY_A]: { [NODE_1]: "per-item text" } };
    const itemTextStyles: Record<string, Record<string, Partial<TextStyle>>> = {};
    const textLayerLocks: Record<string, boolean> = {};

    // Render once with base
    const { result, rerender } = renderHook(
      ({ b }: { b: EditorState }) =>
        usePreviewEditorState(b, OVERLAY_A, itemTextValues, itemTextStyles, textLayerLocks),
      { initialProps: { b: base } },
    );

    const firstResult = result.current;

    // Re-render with the SAME base reference (simulates selectedNodeId updating
    // outside EditorState — the base object itself does not change)
    rerender({ b: base });

    expect(result.current).toBe(firstResult);
  });

  it("applies content and style together on an unlocked layer", () => {
    const base = makeBase({ id: NODE_1, content: "old", fontSize: 12, color: "#aaa" });
    const itemTextValues = { [OVERLAY_A]: { [NODE_1]: "new" } };
    const itemTextStyles = {
      [OVERLAY_A]: { [NODE_1]: { fontSize: 24, color: "#fff" } as Partial<TextStyle> },
    };
    const textLayerLocks: Record<string, boolean> = {};

    const { result } = renderHook(() =>
      usePreviewEditorState(base, OVERLAY_A, itemTextValues, itemTextStyles, textLayerLocks),
    );

    const node = result.current.nodes[0]!;
    expect(node).toHaveProperty("content", "new");
    expect(node).toHaveProperty("fontSize", 24);
    expect(node).toHaveProperty("color", "#fff");
  });

  it("mixed nodes: locked node unchanged, unlocked node overridden", () => {
    const base = makeBase(
      { id: NODE_1, content: "locked-template" },
      { id: NODE_2, content: "unlocked-template" },
    );
    const itemTextValues = {
      [OVERLAY_A]: { [NODE_1]: "should-not-apply", [NODE_2]: "override" },
    };
    const itemTextStyles: Record<string, Record<string, Partial<TextStyle>>> = {};
    const textLayerLocks: Record<string, boolean> = { [NODE_1]: true };

    const { result } = renderHook(() =>
      usePreviewEditorState(base, OVERLAY_A, itemTextValues, itemTextStyles, textLayerLocks),
    );

    const n1 = result.current.nodes.find((n) => n.id === NODE_1)!;
    const n2 = result.current.nodes.find((n) => n.id === NODE_2)!;
    expect(n1).toHaveProperty("content", "locked-template");
    expect(n2).toHaveProperty("content", "override");
  });
});
