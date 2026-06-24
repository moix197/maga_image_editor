import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";
import { usePreviewEditorState } from "@/hooks/use-preview-editor-state";
import type { EditorState } from "@maga/editor";
import type { ItemNodeOverrides } from "@maga/projects";

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

/** Makes a minimal EditorState with one overlay node (non-text) at the given id/src. */
function makeBaseWithOverlayNode(id: string, src: string): EditorState {
  return {
    nodes: [
      {
        id: makeNodeId(id),
        src,
        x: 0,
        y: 0,
        width: 100,
        height: 100,
        rotation: 0,
        zIndex: 0,
        opacity: 1,
        feather: 0,
        cornerRadius: 0,
      } as unknown as EditorState["nodes"][number],
    ],
  };
}

/** Makes an EditorState with one overlay node + one text node. */
function makeBaseWithMixedNodes(slotId: string, slotSrc: string, textId: string, textContent: string): EditorState {
  return {
    nodes: [
      {
        id: makeNodeId(slotId),
        src: slotSrc,
        x: 0,
        y: 0,
        width: 100,
        height: 100,
        rotation: 0,
        zIndex: 0,
        opacity: 1,
        feather: 0,
        cornerRadius: 0,
      } as unknown as EditorState["nodes"][number],
      {
        id: makeNodeId(textId),
        content: textContent,
        x: 0,
        y: 0,
        rotation: 0,
        zIndex: 1,
        fontSize: 16,
        color: "#000000",
        opacity: 1,
        fontFamily: "Arial",
        fontWeight: "400",
        fontStyle: "normal",
        shadow: null,
        textBackground: null,
      } as unknown as EditorState["nodes"][number],
    ],
  };
}

const OVERLAY_A = "overlay-a";
const NODE_1 = "node-1";
const NODE_2 = "node-2";

// --- tests ---

describe("usePreviewEditorState", () => {
  it("(1) text layer gets per-item content override applied", () => {
    const base = makeBase({ id: NODE_1, content: "template text" });
    const overrides: ItemNodeOverrides = { [OVERLAY_A]: { [NODE_1]: { content: "per-item text" } } };

    const { result } = renderHook(() =>
      usePreviewEditorState(base, OVERLAY_A, overrides),
    );

    const node = result.current.nodes[0]!;
    expect(node).toHaveProperty("content", "per-item text");
  });

  it("(2) text layer gets per-item style override applied", () => {
    const base = makeBase({ id: NODE_1, content: "hello", fontSize: 16, color: "#000000" });
    const overrides: ItemNodeOverrides = {
      [OVERLAY_A]: { [NODE_1]: { fontSize: 32, color: "#ff0000" } },
    };

    const { result } = renderHook(() =>
      usePreviewEditorState(base, OVERLAY_A, overrides),
    );

    const node = result.current.nodes[0]!;
    expect(node).toHaveProperty("fontSize", 32);
    expect(node).toHaveProperty("color", "#ff0000");
    // content unchanged
    expect(node).toHaveProperty("content", "hello");
  });

  it("(3) per-item override is ALWAYS applied — a previously-locked node now overrides too", () => {
    // Pre-v4 this node would have been "locked" and retained the template value.
    // The lock model is gone, so the per-item override always wins.
    const base = makeBase({ id: NODE_1, content: "template text" });
    const overrides: ItemNodeOverrides = {
      [OVERLAY_A]: { [NODE_1]: { content: "now applied", fontSize: 99 } },
    };

    const { result } = renderHook(() =>
      usePreviewEditorState(base, OVERLAY_A, overrides),
    );

    const node = result.current.nodes[0]!;
    expect(node).toHaveProperty("content", "now applied");
    expect(node).toHaveProperty("fontSize", 99);
  });

  it("(4) returns base state unchanged when activeOverlayId is null", () => {
    const base = makeBase({ id: NODE_1, content: "template text" });
    const overrides: ItemNodeOverrides = { [OVERLAY_A]: { [NODE_1]: { content: "per-item text" } } };

    const { result } = renderHook(() =>
      usePreviewEditorState(base, null, overrides),
    );

    expect(result.current).toBe(base);
  });

  it("(5) memoization — same reference returned when deps unchanged", () => {
    const base = makeBase({ id: NODE_1, content: "template text" });
    const overrides: ItemNodeOverrides = { [OVERLAY_A]: { [NODE_1]: { content: "per-item text" } } };

    const { result, rerender } = renderHook(() =>
      usePreviewEditorState(base, OVERLAY_A, overrides),
    );

    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
  });

  it("(6) variant with empty override map returns base state unchanged (no crash)", () => {
    const base = makeBase({ id: NODE_1, content: "template text" });
    const overrides: ItemNodeOverrides = {};

    const { result } = renderHook(() =>
      usePreviewEditorState(base, OVERLAY_A, overrides),
    );

    // No overrides for OVERLAY_A — should return base unchanged (same reference)
    expect(result.current).toBe(base);
  });

  it("(7) selectedNodeId change on editorState does NOT cause a new derived object", () => {
    // EditorState only has `nodes`. Adding/removing selectedNodeId-style field
    // is not part of EditorState — it lives outside. But we simulate the key
    // concern: if `base` reference stays the same, derived result is the same.
    const base = makeBase({ id: NODE_1, content: "template text" });
    const overrides: ItemNodeOverrides = { [OVERLAY_A]: { [NODE_1]: { content: "per-item text" } } };

    // Render once with base
    const { result, rerender } = renderHook(
      ({ b }: { b: EditorState }) =>
        usePreviewEditorState(b, OVERLAY_A, overrides),
      { initialProps: { b: base } },
    );

    const firstResult = result.current;

    // Re-render with the SAME base reference (simulates selectedNodeId updating
    // outside EditorState — the base object itself does not change)
    rerender({ b: base });

    expect(result.current).toBe(firstResult);
  });

  it("applies content and style together on a text layer", () => {
    const base = makeBase({ id: NODE_1, content: "old", fontSize: 12, color: "#aaa" });
    const overrides: ItemNodeOverrides = {
      [OVERLAY_A]: { [NODE_1]: { content: "new", fontSize: 24, color: "#fff" } },
    };

    const { result } = renderHook(() =>
      usePreviewEditorState(base, OVERLAY_A, overrides),
    );

    const node = result.current.nodes[0]!;
    expect(node).toHaveProperty("content", "new");
    expect(node).toHaveProperty("fontSize", 24);
    expect(node).toHaveProperty("color", "#fff");
  });

  it("mixed nodes: each text node's per-item override is applied independently", () => {
    const base = makeBase(
      { id: NODE_1, content: "template-1" },
      { id: NODE_2, content: "template-2" },
    );
    const overrides: ItemNodeOverrides = {
      [OVERLAY_A]: { [NODE_1]: { content: "override-1" }, [NODE_2]: { content: "override-2" } },
    };

    const { result } = renderHook(() =>
      usePreviewEditorState(base, OVERLAY_A, overrides),
    );

    const n1 = result.current.nodes.find((n) => n.id === NODE_1)!;
    const n2 = result.current.nodes.find((n) => n.id === NODE_2)!;
    expect(n1).toHaveProperty("content", "override-1");
    expect(n2).toHaveProperty("content", "override-2");
  });

  // --- Phase 2: per-variant text position (x/y) override ---

  it("(geo-a) x/y override is applied to the active variant's text node", () => {
    const base = makeBase({ id: NODE_1, content: "template text" });
    const overrides: ItemNodeOverrides = { [OVERLAY_A]: { [NODE_1]: { x: 120, y: 240 } } };

    const { result } = renderHook(() =>
      usePreviewEditorState(base, OVERLAY_A, overrides),
    );

    const node = result.current.nodes[0]!;
    expect(node).toHaveProperty("x", 120);
    expect(node).toHaveProperty("y", 240);
    // content untouched
    expect(node).toHaveProperty("content", "template text");
  });

  it("(geo-b) an unselected variant (different active overlay) keeps the template position", () => {
    const OVERLAY_B = "overlay-b";
    const base = makeBase({ id: NODE_1, content: "template text" });
    // position overridden only for overlay-a
    const overrides: ItemNodeOverrides = { [OVERLAY_A]: { [NODE_1]: { x: 120, y: 240 } } };

    const { result } = renderHook(() =>
      usePreviewEditorState(base, OVERLAY_B, overrides),
    );

    // overlay-b has no override — node stays at the template x/y (0,0), base returned as-is
    expect(result.current).toBe(base);
    const node = result.current.nodes[0]!;
    expect(node).toHaveProperty("x", 0);
    expect(node).toHaveProperty("y", 0);
  });

  it("(geo-c) early-return-base preserved when there are no overrides", () => {
    const base = makeBase({ id: NODE_1, content: "template text" });

    const { result } = renderHook(() =>
      usePreviewEditorState(base, OVERLAY_A, {}),
    );

    expect(result.current).toBe(base);
  });

  it("(geo-d) x/y and content/style all apply together on a text node", () => {
    const base = makeBase({ id: NODE_1, content: "old", fontSize: 16 });
    const overrides: ItemNodeOverrides = {
      [OVERLAY_A]: { [NODE_1]: { content: "new", fontSize: 32, x: 50, y: 75 } },
    };

    const { result } = renderHook(() =>
      usePreviewEditorState(base, OVERLAY_A, overrides),
    );

    const node = result.current.nodes[0]!;
    expect(node).toHaveProperty("content", "new");
    expect(node).toHaveProperty("fontSize", 32);
    expect(node).toHaveProperty("x", 50);
    expect(node).toHaveProperty("y", 75);
  });

  // --- Variable-slot overlay-image swap (Change 1) ---

  it("(slot-a) slot node src is swapped to activeOverlayBlobKey when variableSlotNodeId matches", () => {
    const SLOT_ID = "slot-node";
    const OLD_SRC = "blob:old-key";
    const NEW_SRC = "blob:new-key";
    const base = makeBaseWithOverlayNode(SLOT_ID, OLD_SRC);

    const { result } = renderHook(() =>
      usePreviewEditorState(base, OVERLAY_A, {}, makeNodeId(SLOT_ID), NEW_SRC),
    );

    const node = result.current.nodes.find((n) => n.id === SLOT_ID)!;
    expect((node as unknown as { src: string }).src).toBe(NEW_SRC);
  });

  it("(slot-b) non-slot overlay nodes are left unchanged", () => {
    const SLOT_ID = "slot-node";
    const OTHER_ID = "other-node";
    const base: EditorState = {
      nodes: [
        {
          id: makeNodeId(SLOT_ID),
          src: "blob:new-key",
          x: 0, y: 0, width: 100, height: 100, rotation: 0, zIndex: 0, opacity: 1, feather: 0, cornerRadius: 0,
        } as unknown as EditorState["nodes"][number],
        {
          id: makeNodeId(OTHER_ID),
          src: "blob:other-original",
          x: 0, y: 0, width: 100, height: 100, rotation: 0, zIndex: 1, opacity: 1, feather: 0, cornerRadius: 0,
        } as unknown as EditorState["nodes"][number],
      ],
    };

    const { result } = renderHook(() =>
      usePreviewEditorState(base, OVERLAY_A, {}, makeNodeId(SLOT_ID), "blob:new-key"),
    );

    const other = result.current.nodes.find((n) => n.id === OTHER_ID)!;
    expect((other as unknown as { src: string }).src).toBe("blob:other-original");
  });

  it("(slot-c) when variableSlotNodeId is null, no overlay node src is changed", () => {
    const SLOT_ID = "slot-node";
    const OLD_SRC = "blob:old-key";
    const base = makeBaseWithOverlayNode(SLOT_ID, OLD_SRC);

    const { result } = renderHook(() =>
      usePreviewEditorState(base, OVERLAY_A, {}, null, "blob:new-key"),
    );

    // No text overrides and no slot swap — base returned as-is
    expect(result.current).toBe(base);
  });

  it("(slot-d) slot swap applies even when there are NO text overrides", () => {
    const SLOT_ID = "slot-node";
    const OLD_SRC = "blob:old-key";
    const NEW_SRC = "blob:new-key";
    const base = makeBaseWithOverlayNode(SLOT_ID, OLD_SRC);

    const { result } = renderHook(() =>
      usePreviewEditorState(
        base,
        null, // no active overlay id — but slot swap should still apply
        {},
        makeNodeId(SLOT_ID),
        NEW_SRC,
      ),
    );

    const node = result.current.nodes.find((n) => n.id === SLOT_ID)!;
    expect((node as unknown as { src: string }).src).toBe(NEW_SRC);
  });

  it("(slot-e) purity — base is not mutated by a slot swap", () => {
    const SLOT_ID = "slot-node";
    const OLD_SRC = "blob:old-key";
    const NEW_SRC = "blob:new-key";
    const base = makeBaseWithOverlayNode(SLOT_ID, OLD_SRC);
    const originalNode = base.nodes[0]!;

    renderHook(() =>
      usePreviewEditorState(base, OVERLAY_A, {}, makeNodeId(SLOT_ID), NEW_SRC),
    );

    // The original node in base must not be touched
    expect((originalNode as unknown as { src: string }).src).toBe(OLD_SRC);
  });

  it("(slot-f) memoization — same slot params in → same derived object out", () => {
    const SLOT_ID = "slot-node";
    const NEW_SRC = "blob:new-key";
    const base = makeBaseWithOverlayNode(SLOT_ID, "blob:old-key");
    const overrides: ItemNodeOverrides = {};
    const slotNodeId = makeNodeId(SLOT_ID);

    const { result, rerender } = renderHook(() =>
      usePreviewEditorState(base, OVERLAY_A, overrides, slotNodeId, NEW_SRC),
    );

    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
  });

  it("(slot-g) slot swap and unlocked text override both apply in one derived state", () => {
    const SLOT_ID = "slot-node";
    const TEXT_ID = "text-node";
    const NEW_SRC = "blob:new-key";
    const base = makeBaseWithMixedNodes(SLOT_ID, "blob:old-key", TEXT_ID, "template text");
    const overrides: ItemNodeOverrides = { [OVERLAY_A]: { [TEXT_ID]: { content: "per-item text" } } };

    const { result } = renderHook(() =>
      usePreviewEditorState(base, OVERLAY_A, overrides, makeNodeId(SLOT_ID), NEW_SRC),
    );

    const slot = result.current.nodes.find((n) => n.id === makeNodeId(SLOT_ID))!;
    const text = result.current.nodes.find((n) => n.id === makeNodeId(TEXT_ID))!;
    expect(slot).toHaveProperty("src", NEW_SRC);
    expect(text).toHaveProperty("content", "per-item text");
  });

  // ── Phase 4: per-variant text-node hiding ────────────────────────────────────

  it("(hidden-a) a node hidden for the active overlay is excluded from derived nodes", () => {
    const base = makeBase(
      { id: NODE_1, content: "template-1" },
      { id: NODE_2, content: "template-2" },
    );
    const overrides: ItemNodeOverrides = { [OVERLAY_A]: { [NODE_1]: { hidden: true } } };

    const { result } = renderHook(() =>
      usePreviewEditorState(base, OVERLAY_A, overrides),
    );

    const ids = result.current.nodes.map((n) => n.id);
    expect(ids).not.toContain(makeNodeId(NODE_1));
    expect(ids).toContain(makeNodeId(NODE_2));
  });

  it("(hidden-b) a node hidden for overlay-a is still present in the base (not mutated)", () => {
    const base = makeBase({ id: NODE_1, content: "template" });
    const overrides: ItemNodeOverrides = { [OVERLAY_A]: { [NODE_1]: { hidden: true } } };

    renderHook(() =>
      usePreviewEditorState(base, OVERLAY_A, overrides),
    );

    // The base object must not be mutated — its node list is intact.
    expect(base.nodes).toHaveLength(1);
    expect(base.nodes[0]).toHaveProperty("id", makeNodeId(NODE_1));
  });

  it("(hidden-c) a node hidden for overlay-a is NOT hidden for overlay-b", () => {
    const OVERLAY_B = "overlay-b";
    const base = makeBase({ id: NODE_1, content: "template" });
    const overrides: ItemNodeOverrides = { [OVERLAY_A]: { [NODE_1]: { hidden: true } } };

    const { result } = renderHook(() =>
      usePreviewEditorState(base, OVERLAY_B, overrides),
    );

    // overlay-b has no hidden nodes — node-1 should be present
    const ids = result.current.nodes.map((n) => n.id);
    expect(ids).toContain(makeNodeId(NODE_1));
  });

  it("(hidden-d) non-hidden nodes still receive per-item overrides when some nodes are hidden", () => {
    const base = makeBase(
      { id: NODE_1, content: "template-1" },
      { id: NODE_2, content: "template-2" },
    );
    const overrides: ItemNodeOverrides = {
      [OVERLAY_A]: { [NODE_1]: { hidden: true }, [NODE_2]: { content: "override-2" } },
    };

    const { result } = renderHook(() =>
      usePreviewEditorState(base, OVERLAY_A, overrides),
    );

    const n2 = result.current.nodes.find((n) => n.id === makeNodeId(NODE_2))!;
    expect(n2).toHaveProperty("content", "override-2");
    // node-1 absent
    expect(result.current.nodes.find((n) => n.id === makeNodeId(NODE_1))).toBeUndefined();
  });

  it("(hidden-e) empty overrides has no effect — all nodes present", () => {
    const base = makeBase(
      { id: NODE_1, content: "a" },
      { id: NODE_2, content: "b" },
    );

    const { result } = renderHook(() =>
      usePreviewEditorState(base, OVERLAY_A, {}),
    );

    // No overrides, no hidden nodes — should return base as-is
    expect(result.current).toBe(base);
  });

  it("(hidden-f) hiding all text nodes results in an empty node list", () => {
    const base = makeBase(
      { id: NODE_1, content: "a" },
      { id: NODE_2, content: "b" },
    );
    const overrides: ItemNodeOverrides = {
      [OVERLAY_A]: { [NODE_1]: { hidden: true }, [NODE_2]: { hidden: true } },
    };

    const { result } = renderHook(() =>
      usePreviewEditorState(base, OVERLAY_A, overrides),
    );

    expect(result.current.nodes).toHaveLength(0);
  });
});
