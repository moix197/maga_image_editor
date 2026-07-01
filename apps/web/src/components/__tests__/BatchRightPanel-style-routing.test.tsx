/**
 * Tests that text-style edits (color, fontSize, etc.) in BatchRightPanel fan out
 * to per-variant node overrides via itemText.setTextStyle — NOT to the shared
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

function makeItemText(overrides: { getTextStyle?: ReturnType<typeof vi.fn>; getNodeOverride?: ReturnType<typeof vi.fn> } = {}) {
  return {
    getTextValue: vi.fn().mockReturnValue(""),
    setTextValue: vi.fn(),
    getTextStyle: overrides.getTextStyle ?? vi.fn().mockReturnValue({}),
    setTextStyle: vi.fn(),
    isNodeHidden: vi.fn().mockReturnValue(false),
    setNodeHidden: vi.fn(),
    setNodeOverride: vi.fn(),
    getNodeOverride: overrides.getNodeOverride ?? vi.fn().mockReturnValue({}),
  };
}

const OVERLAY_NODE_ID = makeNodeId("overlay-node-1");

const BASE_OVERLAY_NODE: OverlayNode = {
  id: OVERLAY_NODE_ID,
  src: "data:image/png;base64,abc",
  x: 10,
  y: 20,
  width: 200,
  height: 100,
  opacity: 1,
  zIndex: 0,
  overlayType: "image",
  aspectRatioLocked: true,
};

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
      onAddOverlayFromAssets={vi.fn()}
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
      overlayNodes={[]}
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

    // There are now two spinbuttons: fontSize (max=200) and width (placeholder=Auto).
    // Select the fontSize input by its max attribute.
    const inputs = screen.getAllByRole("spinbutton") as HTMLInputElement[];
    const fontSizeInput = inputs.find((i) => i.max === "200")!;
    fireEvent.change(fontSizeInput, { target: { value: "32" } });

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

    // fontSize spinbutton should reflect the override (24), not the template base (16).
    // Disambiguate by max attribute (fontSize has max=200; width has no max).
    const inputs = screen.getAllByRole("spinbutton") as HTMLInputElement[];
    const fontSizeInput = inputs.find((i) => i.max === "200")!;
    expect(fontSizeInput.value).toBe("24");
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
        onAddOverlayFromAssets={vi.fn()}
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
        overlayNodes={[]}
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

describe("BatchRightPanel — overlay transform routing (Phase 5)", () => {
  function renderOverlayPanel(
    itemText: ReturnType<typeof makeItemText>,
    editorState: ReturnType<typeof makeEditorState>,
    activeOverlay: ProjectAsset | null = ACTIVE_OVERLAY,
  ) {
    render(
      <BatchRightPanel
        activeSection="template"
        background={{ id: "bg", filename: "bg.png", blobKey: "blob:bg" }}
        overlays={activeOverlay ? [ACTIVE_OVERLAY] : []}
        onBackgroundFiles={vi.fn()}
        onOverlayFiles={vi.fn()}
        onImportZipFiles={vi.fn()}
        onReorderOverlays={vi.fn()}
        template={{ nodes: [BASE_OVERLAY_NODE] }}
        editorState={editorState as never}
        overlayInputRef={{ current: null }}
        onOverlayFile={vi.fn()}
        onAddOverlayFromAssets={vi.fn()}
        variableSlotNodeId={null}
        selectedNodeId={OVERLAY_NODE_ID}
        selectedNode={BASE_OVERLAY_NODE as unknown as TextNode | OverlayNode}
        isSelectedText={false}
        isSelectedOverlay
        onSetSelectedNodeId={vi.fn()}
        onDeleteOverlayNode={vi.fn()}
        onToggleVariableSlot={vi.fn()}
        activeOverlay={activeOverlay}
        textNodes={[]}
        overlayNodes={[]}
        itemText={itemText as never}
      />,
    );
  }

  it("transform change fans out via itemText.setNodeOverride — NOT editorState.updateOverlayNode", () => {
    const editorState = makeEditorState(BASE_OVERLAY_NODE as never);
    const itemText = makeItemText();
    renderOverlayPanel(itemText, editorState);

    fireEvent.change(screen.getByLabelText("Rotation value"), { target: { value: "45" } });

    expect(itemText.setNodeOverride).toHaveBeenCalledWith(OVERLAY_ID, OVERLAY_NODE_ID, { rotation: 45 });
    expect(editorState.updateOverlayNode).not.toHaveBeenCalled();
  });

  it("without activeOverlay, falls back to editorState.updateOverlayNode (template-only mode)", () => {
    const editorState = makeEditorState(BASE_OVERLAY_NODE as never);
    const itemText = makeItemText();
    renderOverlayPanel(itemText, editorState, null);

    fireEvent.change(screen.getByLabelText("Rotation value"), { target: { value: "90" } });

    expect(editorState.updateOverlayNode).toHaveBeenCalledWith(OVERLAY_NODE_ID, { rotation: 90 });
    expect(itemText.setNodeOverride).not.toHaveBeenCalled();
  });

  it("read side: panel displays per-variant override merged with template base", () => {
    // The active variant has rotation=45 overriding the template's rotation (0).
    const getNodeOverrideMock = vi.fn().mockReturnValue({ rotation: 45 });
    const editorState = makeEditorState(BASE_OVERLAY_NODE as never);
    const itemText = makeItemText({ getNodeOverride: getNodeOverrideMock });
    renderOverlayPanel(itemText, editorState);

    // OverlayControlsPanel receives effectiveOverlayNode with rotation=45,
    // not the template's rotation=0.
    const rotationInput = screen.getByLabelText("Rotation value") as HTMLInputElement;
    expect(rotationInput.value).toBe("45");
    expect(getNodeOverrideMock).toHaveBeenCalledWith(OVERLAY_ID, OVERLAY_NODE_ID);
  });

  it("read side: with no override for the node, template values are shown unchanged", () => {
    const editorState = makeEditorState(BASE_OVERLAY_NODE as never);
    const itemText = makeItemText();
    renderOverlayPanel(itemText, editorState);

    // No override — panel shows the template's rotation (0).
    const rotationInput = screen.getByLabelText("Rotation value") as HTMLInputElement;
    expect(rotationInput.value).toBe("0");
  });
});
