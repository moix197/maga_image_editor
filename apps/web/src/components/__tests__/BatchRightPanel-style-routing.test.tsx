/**
 * Tests that text-style edits (color, fontSize, etc.) in BatchRightPanel fan out
 * to per-variant itemTextStyles via itemText.setTextStyle — NOT to the shared
 * template via editorState.updateTextNode. This is the Phase 1b fix.
 *
 * Also tests the read side: the TextStylePanel receives the effective merged node
 * (template base ⊕ active variant's per-item style override).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { NodeId, TextNode, OverlayNode } from "@maga/editor";
import type { ProjectAsset } from "@maga/projects";
import { BatchRightPanel } from "@/components/batch/BatchRightPanel";

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeNodeId(s: string): NodeId {
  return s as NodeId;
}

const OVERLAY_ID = "overlay-1";
const NODE_ID = makeNodeId("text-node-1");

const BASE_TEXT_NODE: TextNode = {
  id: NODE_ID,
  content: "Hello",
  x: 10,
  y: 10,
  rotation: 0,
  zIndex: 0,
  fontSize: 16,
  color: "#ffffff",
  opacity: 1,
  fontFamily: "Inter",
  fontWeight: "normal",
  fontStyle: "normal",
  shadow: null,
  textBackground: null,
};

const ACTIVE_OVERLAY: ProjectAsset = {
  id: OVERLAY_ID,
  filename: "overlay.png",
  blobKey: "blob:overlay",
};

function makeEditorState(node: TextNode = BASE_TEXT_NODE) {
  return {
    state: { nodes: [node] },
    addTextNode: vi.fn(),
    addOverlayNode: vi.fn(),
    addBorderNode: vi.fn(),
    updateTextNode: vi.fn(),
    updateOverlayNode: vi.fn(),
    removeNode: vi.fn(),
    reorderNode: vi.fn(),
    replace: vi.fn(),
  };
}

function makeItemText(overrides: { getTextStyle?: ReturnType<typeof vi.fn> } = {}) {
  return {
    getTextValue: vi.fn().mockReturnValue(""),
    setTextValue: vi.fn(),
    getTextStyle: overrides.getTextStyle ?? vi.fn().mockReturnValue({}),
    setTextStyle: vi.fn(),
  };
}

/**
 * Renders BatchRightPanel in "template" section with a selected text node.
 * Returns the spy fns for easy assertion.
 */
function renderPanel(
  itemText: ReturnType<typeof makeItemText>,
  editorState: ReturnType<typeof makeEditorState>,
  selectedNode: TextNode = BASE_TEXT_NODE,
) {
  render(
    <BatchRightPanel
      activeSection="template"
      background={{ id: "bg", filename: "bg.png", blobKey: "blob:bg" }}
      overlays={[ACTIVE_OVERLAY]}
      onBackgroundFiles={vi.fn()}
      onOverlayFiles={vi.fn()}
      onImportZipFiles={vi.fn()}
      onReorderOverlays={vi.fn()}
      template={{ nodes: [BASE_TEXT_NODE] }}
      editorState={editorState as never}
      overlayInputRef={{ current: null }}
      onOverlayFile={vi.fn()}
      variableSlotNodeId={null}
      selectedNodeId={NODE_ID}
      selectedNode={selectedNode as unknown as TextNode | OverlayNode}
      isSelectedText
      isSelectedOverlay={false}
      onSetSelectedNodeId={vi.fn()}
      onDeleteOverlayNode={vi.fn()}
      onToggleVariableSlot={vi.fn()}
      activeOverlay={ACTIVE_OVERLAY}
      textNodes={[BASE_TEXT_NODE]}
      itemText={itemText as never}
    />,
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("BatchRightPanel — text style routing (Phase 1b fix)", () => {
  let editorState: ReturnType<typeof makeEditorState>;
  let itemText: ReturnType<typeof makeItemText>;

  beforeEach(() => {
    editorState = makeEditorState();
    itemText = makeItemText();
  });

  it("style change calls itemText.setTextStyle — NOT editorState.updateTextNode", () => {
    renderPanel(itemText, editorState);

    // Change the text color via the color input
    const colorInput = screen.getByLabelText("Text color") as HTMLInputElement;
    fireEvent.change(colorInput, { target: { value: "#ff0000" } });

    // Fan-out setter must be called
    expect(itemText.setTextStyle).toHaveBeenCalledTimes(1);
    expect(itemText.setTextStyle).toHaveBeenCalledWith(OVERLAY_ID, NODE_ID, { color: "#ff0000" });

    // Template must NOT be touched
    expect(editorState.updateTextNode).not.toHaveBeenCalled();
  });

  it("style change fans out to the activeOverlay id passed in the call", () => {
    renderPanel(itemText, editorState);

    const spinbutton = screen.getByRole("spinbutton") as HTMLInputElement; // fontSize input
    fireEvent.change(spinbutton, { target: { value: "32" } });

    expect(itemText.setTextStyle).toHaveBeenCalledWith(OVERLAY_ID, NODE_ID, { fontSize: 32 });
  });

  it("read side: panel displays per-item style override merged with template base", () => {
    // Per-item override sets color to red; template has white
    const getTextStyle = vi.fn().mockReturnValue({ color: "#ff0000", fontSize: 24 });
    const itemTextWithStyle = makeItemText({ getTextStyle });

    renderPanel(itemTextWithStyle, editorState);

    // The color input should show the per-item override (#ff0000), not the template (#ffffff)
    const colorInput = screen.getByLabelText("Text color") as HTMLInputElement;
    expect(colorInput.value).toBe("#ff0000");

    // fontSize spinbutton should reflect the override (24), not the template base (16)
    const spinbutton = screen.getByRole("spinbutton") as HTMLInputElement;
    expect(spinbutton.value).toBe("24");
  });

  it("without activeOverlay, falls back to editorState.updateTextNode (template-only mode)", () => {
    // Render WITHOUT activeOverlay
    render(
      <BatchRightPanel
        activeSection="template"
        background={{ id: "bg", filename: "bg.png", blobKey: "blob:bg" }}
        overlays={[]}
        onBackgroundFiles={vi.fn()}
        onOverlayFiles={vi.fn()}
        onImportZipFiles={vi.fn()}
        onReorderOverlays={vi.fn()}
        template={{ nodes: [BASE_TEXT_NODE] }}
        editorState={editorState as never}
        overlayInputRef={{ current: null }}
        onOverlayFile={vi.fn()}
        variableSlotNodeId={null}
        selectedNodeId={NODE_ID}
        selectedNode={BASE_TEXT_NODE as unknown as TextNode | OverlayNode}
        isSelectedText
        isSelectedOverlay={false}
        onSetSelectedNodeId={vi.fn()}
        onDeleteOverlayNode={vi.fn()}
        onToggleVariableSlot={vi.fn()}
        activeOverlay={null}            // ← no active overlay
        textNodes={[BASE_TEXT_NODE]}
        itemText={itemText as never}
      />,
    );

    const colorInput = screen.getByLabelText("Text color") as HTMLInputElement;
    fireEvent.change(colorInput, { target: { value: "#00ff00" } });

    // Falls back to mutating the template (no overlay context)
    expect(editorState.updateTextNode).toHaveBeenCalledWith(NODE_ID, { color: "#00ff00" });
    expect(itemText.setTextStyle).not.toHaveBeenCalled();
  });
});
