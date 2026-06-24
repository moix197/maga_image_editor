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

  // --- Phase 3: per-variant text size (width/height/fontSize) override ---

  it("(size-a) fontSize override is applied to the active variant's text node", () => {
    const base = makeBase({ id: NODE_1, content: "template text", fontSize: 16 });
    const overrides: ItemNodeOverrides = { [OVERLAY_A]: { [NODE_1]: { fontSize: 48 } } };

    const { result } = renderHook(() =>
      usePreviewEditorState(base, OVERLAY_A, overrides),
    );

    const node = result.current.nodes[0]!;
    expect(node).toHaveProperty("fontSize", 48);
    // content untouched
    expect(node).toHaveProperty("content", "template text");
  });

  it("(size-b) width/height size override flows through the generic spread", () => {
    const base = makeBase({ id: NODE_1, content: "template text" });
    const overrides: ItemNodeOverrides = {
      [OVERLAY_A]: { [NODE_1]: { width: 300, height: 120 } },
    };

    const { result } = renderHook(() =>
      usePreviewEditorState(base, OVERLAY_A, overrides),
    );

    const node = result.current.nodes[0]!;
    expect(node).toHaveProperty("width", 300);
    expect(node).toHaveProperty("height", 120);
  });

  it("(size-c) an unselected variant keeps the template size", () => {
    const OVERLAY_B = "overlay-b";
    const base = makeBase({ id: NODE_1, content: "template text", fontSize: 16 });
    const overrides: ItemNodeOverrides = { [OVERLAY_A]: { [NODE_1]: { fontSize: 48 } } };

    const { result } = renderHook(() =>
      usePreviewEditorState(base, OVERLAY_B, overrides),
    );

    // overlay-b has no override — base returned as-is, template fontSize kept
    expect(result.current).toBe(base);
    expect(result.current.nodes[0]!).toHaveProperty("fontSize", 16);
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

  // ── Phase 4: per-variant IMAGE OVERLAY geometry (x/y/width/height) ─────────────

  it("(ov-a) x/y/width/height override is applied to the active variant's overlay node", () => {
    const SLOT_ID = "img-node";
    const base = makeBaseWithOverlayNode(SLOT_ID, "blob:src"); // template at x:0 y:0 w:100 h:100
    const overrides: ItemNodeOverrides = {
      [OVERLAY_A]: { [SLOT_ID]: { x: 120, y: 240, width: 300, height: 200 } },
    };

    const { result } = renderHook(() =>
      usePreviewEditorState(base, OVERLAY_A, overrides),
    );

    const node = result.current.nodes.find((n) => n.id === makeNodeId(SLOT_ID))!;
    expect(node).toHaveProperty("x", 120);
    expect(node).toHaveProperty("y", 240);
    expect(node).toHaveProperty("width", 300);
    expect(node).toHaveProperty("height", 200);
    // src untouched (geometry-only override)
    expect((node as unknown as { src: string }).src).toBe("blob:src");
  });

  it("(ov-b) an unselected variant (different active overlay) keeps the template overlay geometry", () => {
    const OVERLAY_B = "overlay-b";
    const SLOT_ID = "img-node";
    const base = makeBaseWithOverlayNode(SLOT_ID, "blob:src");
    const overrides: ItemNodeOverrides = {
      [OVERLAY_A]: { [SLOT_ID]: { x: 120, y: 240 } },
    };

    const { result } = renderHook(() =>
      usePreviewEditorState(base, OVERLAY_B, overrides),
    );

    // overlay-b has no override — base returned as-is, template geometry kept
    expect(result.current).toBe(base);
    const node = result.current.nodes.find((n) => n.id === makeNodeId(SLOT_ID))!;
    expect(node).toHaveProperty("x", 0);
    expect(node).toHaveProperty("y", 0);
  });

  it("(ov-c) early-return-base preserved when an overlay node has no override", () => {
    const SLOT_ID = "img-node";
    const base = makeBaseWithOverlayNode(SLOT_ID, "blob:src");

    const { result } = renderHook(() =>
      usePreviewEditorState(base, OVERLAY_A, {}),
    );

    expect(result.current).toBe(base);
  });

  it("(ov-d) overlay geometry override and a text override apply together in one derived state", () => {
    const SLOT_ID = "img-node";
    const TEXT_ID = "text-node";
    const base = makeBaseWithMixedNodes(SLOT_ID, "blob:src", TEXT_ID, "template text");
    const overrides: ItemNodeOverrides = {
      [OVERLAY_A]: {
        [SLOT_ID]: { x: 50, y: 75, width: 200 },
        [TEXT_ID]: { content: "per-item text" },
      },
    };

    const { result } = renderHook(() =>
      usePreviewEditorState(base, OVERLAY_A, overrides),
    );

    const img = result.current.nodes.find((n) => n.id === makeNodeId(SLOT_ID))!;
    const text = result.current.nodes.find((n) => n.id === makeNodeId(TEXT_ID))!;
    expect(img).toHaveProperty("x", 50);
    expect(img).toHaveProperty("y", 75);
    expect(img).toHaveProperty("width", 200);
    expect(text).toHaveProperty("content", "per-item text");
  });

  it("(ov-e) purity — base overlay node is not mutated by a geometry override", () => {
    const SLOT_ID = "img-node";
    const base = makeBaseWithOverlayNode(SLOT_ID, "blob:src");
    const originalNode = base.nodes[0]!;
    const overrides: ItemNodeOverrides = { [OVERLAY_A]: { [SLOT_ID]: { x: 999 } } };

    renderHook(() =>
      usePreviewEditorState(base, OVERLAY_A, overrides),
    );

    expect(originalNode).toHaveProperty("x", 0);
  });

  it("(ov-f) overlay geometry override layers under the variable-slot src swap on the same node", () => {
    const SLOT_ID = "slot-node";
    const NEW_SRC = "blob:new-key";
    const base = makeBaseWithOverlayNode(SLOT_ID, "blob:old-key");
    const overrides: ItemNodeOverrides = { [OVERLAY_A]: { [SLOT_ID]: { x: 42 } } };

    const { result } = renderHook(() =>
      usePreviewEditorState(base, OVERLAY_A, overrides, makeNodeId(SLOT_ID), NEW_SRC),
    );

    const node = result.current.nodes.find((n) => n.id === makeNodeId(SLOT_ID))!;
    // Both the geometry override AND the slot src swap apply.
    expect(node).toHaveProperty("x", 42);
    expect((node as unknown as { src: string }).src).toBe(NEW_SRC);
  });

  // ── Phase 5: per-variant IMAGE OVERLAY style/transform (opacity/rotation/etc.) ──

  it("(ov-t-a) transform override (opacity/rotation/cornerRadius/dropShadow/featherRadius) applies to the active variant's overlay node", () => {
    const SLOT_ID = "img-node";
    const base = makeBaseWithOverlayNode(SLOT_ID, "blob:src");
    const dropShadow = { x: 5, y: 5, blur: 10, color: "#000000", opacity: 0.7 };
    const overrides: ItemNodeOverrides = {
      [OVERLAY_A]: {
        [SLOT_ID]: { opacity: 0.4, rotation: 45, cornerRadius: 12, dropShadow, featherRadius: 8, aspectRatioLocked: false },
      },
    };

    const { result } = renderHook(() =>
      usePreviewEditorState(base, OVERLAY_A, overrides),
    );

    const node = result.current.nodes.find((n) => n.id === makeNodeId(SLOT_ID))!;
    expect(node).toHaveProperty("opacity", 0.4);
    expect(node).toHaveProperty("rotation", 45);
    expect(node).toHaveProperty("cornerRadius", 12);
    expect(node).toHaveProperty("dropShadow", dropShadow);
    expect(node).toHaveProperty("featherRadius", 8);
    expect(node).toHaveProperty("aspectRatioLocked", false);
  });

  it("(ov-t-b) an unselected variant keeps the template transform (no override leak)", () => {
    const OVERLAY_B = "overlay-b";
    const SLOT_ID = "img-node";
    const base = makeBaseWithOverlayNode(SLOT_ID, "blob:src"); // template opacity:1
    const overrides: ItemNodeOverrides = {
      [OVERLAY_A]: { [SLOT_ID]: { opacity: 0.4, rotation: 90 } },
    };

    const { result } = renderHook(() =>
      usePreviewEditorState(base, OVERLAY_B, overrides),
    );

    // overlay-b has no override — base returned as-is, template transform kept
    expect(result.current).toBe(base);
    const node = result.current.nodes.find((n) => n.id === makeNodeId(SLOT_ID))!;
    expect(node).toHaveProperty("opacity", 1);
  });

  // ── Phase 6: per-variant IMAGE OVERLAY hidden (filter out of derived nodes) ──

  it("(ov-hidden-a) an overlay node hidden for the active overlay is excluded from derived nodes", () => {
    const IMG_ID = "img-node";
    const base = makeBaseWithOverlayNode(IMG_ID, "blob:src");
    const overrides: ItemNodeOverrides = { [OVERLAY_A]: { [IMG_ID]: { hidden: true } } };

    const { result } = renderHook(() =>
      usePreviewEditorState(base, OVERLAY_A, overrides),
    );

    const ids = result.current.nodes.map((n) => n.id);
    expect(ids).not.toContain(makeNodeId(IMG_ID));
  });

  it("(ov-hidden-b) an overlay node hidden for overlay-a is still present for overlay-b (base returned as-is)", () => {
    const OVERLAY_B = "overlay-b";
    const IMG_ID = "img-node";
    const base = makeBaseWithOverlayNode(IMG_ID, "blob:src");
    const overrides: ItemNodeOverrides = { [OVERLAY_A]: { [IMG_ID]: { hidden: true } } };

    const { result } = renderHook(() =>
      usePreviewEditorState(base, OVERLAY_B, overrides),
    );

    // overlay-b has no override — base returned as-is, node still present
    expect(result.current).toBe(base);
    const ids = result.current.nodes.map((n) => n.id);
    expect(ids).toContain(makeNodeId(IMG_ID));
  });

  it("(ov-hidden-c) base is not mutated when an overlay node is hidden", () => {
    const IMG_ID = "img-node";
    const base = makeBaseWithOverlayNode(IMG_ID, "blob:src");
    const overrides: ItemNodeOverrides = { [OVERLAY_A]: { [IMG_ID]: { hidden: true } } };

    renderHook(() => usePreviewEditorState(base, OVERLAY_A, overrides));

    expect(base.nodes).toHaveLength(1);
    expect(base.nodes[0]).toHaveProperty("id", makeNodeId(IMG_ID));
  });
});
