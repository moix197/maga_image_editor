/**
 * Structural invariant (plan "Dependencies & Risks -> export non-contamination
 * (a)"): the CSS scale-transform wrapper added in BatchWorkspace.tsx MUST be a
 * strict ANCESTOR of, never the same element as, the div bound to
 * `canvasCallbackRef` — that exact div is what html-to-image rasterizes for
 * export (see export-helpers.ts). If the transform ever landed on the ref'd
 * div itself, exports would come out at the zoomed size instead of the true
 * canvas size.
 *
 * This test renders the REAL TextOverlayCanvas (unlike the sibling
 * BatchWorkspace-editor.test.tsx / BatchWorkspace-overlay-picker.test.tsx,
 * which stub it out) so the actual DOM nesting can be inspected.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  useSearchParams: () => ({
    get: (key: string) => (key === "section" ? "template" : null),
    toString: () => "section=template",
  }),
  useRouter: () => ({ push: vi.fn() }),
}));

// Stable references (not recreated per render) — BatchWorkspace reconciles
// `activeOverlayId`/`selectedVariantIds` during render by comparing the
// `overlays` array's identity across renders; a fresh array literal on every
// mock invocation would look like a "changed" prop on every re-render and
// trip React's runaway-render guard (see BatchWorkspace-overlay-picker.test.tsx).
const BACKGROUND = { id: "bg1", filename: "bg.png", blobKey: "data:image/png;base64,bg" };
const OVERLAYS: never[] = [];

vi.mock("@/hooks/use-batch-project", () => ({
  useBatchProject: () => ({
    background: BACKGROUND,
    overlays: OVERLAYS,
    template: null,
    variableSlot: null,
    outputs: [],
    setBackground: vi.fn(),
    addOverlays: vi.fn(),
    setTemplate: vi.fn(),
    setEditorTemplate: vi.fn(),
    addOutput: vi.fn(),
    clearOutputs: vi.fn(),
    clearProject: vi.fn(),
    setProject: vi.fn(),
    setVariableSlot: vi.fn(),
    setNodeOverride: vi.fn(),
    setNodeHidden: vi.fn(),
    itemNodeOverrides: {},
    reorderOverlays: vi.fn(),
  }),
}));

vi.mock("@/hooks/use-editor-state", () => ({
  useEditorState: () => ({
    state: { nodes: [] },
    addTextNode: vi.fn(),
    addOverlayNode: vi.fn(),
    addBorderNode: vi.fn(),
    updateTextNode: vi.fn(),
    updateOverlayNode: vi.fn(),
    removeNode: vi.fn(),
    reorderNode: vi.fn(),
    replace: vi.fn(),
  }),
}));

vi.mock("@/hooks/use-single-composite", () => ({
  useSingleComposite: () => ({ compositeDataUrl: null, isRendering: false, error: null, generate: vi.fn() }),
}));

vi.mock("@/hooks/use-batch-render", () => ({
  useBatchRender: () => ({ isRunning: false, progress: 0, error: null, run: vi.fn(), cancel: vi.fn() }),
}));

vi.mock("@/hooks/use-zip-export", () => ({
  useZipExport: () => ({ isExporting: false, error: null, exportZip: vi.fn() }),
}));

vi.mock("@/hooks/use-project-persistence", () => ({
  useProjectPersistence: () => ({
    restored: false,
    pendingRestore: null,
    consumeRestore: vi.fn(),
    clearPersisted: vi.fn(),
    importError: null,
    quotaWarning: false,
    importZip: vi.fn(),
  }),
}));

vi.mock("@/hooks/use-item-text", () => ({
  useItemText: () => ({
    getTextValue: vi.fn().mockReturnValue(""),
    setTextValue: vi.fn(),
    getTextStyle: vi.fn().mockReturnValue({}),
    setTextStyle: vi.fn(),
    isNodeHidden: vi.fn().mockReturnValue(false),
    setNodeHidden: vi.fn(),
    setNodeOverride: vi.fn(),
    getNodeOverride: vi.fn().mockReturnValue({}),
  }),
}));

vi.mock("@/hooks/use-fan-out-text-handlers", () => ({
  useFanOutTextHandlers: () => ({
    handleSetNodeOverride: vi.fn(),
    handleSetItemTextValue: vi.fn(),
    handleSetItemTextStyle: vi.fn(),
    handleSetNodeHidden: vi.fn(),
  }),
}));

vi.mock("@/lib/image-helpers", () => ({
  fileToDataUrl: vi.fn().mockResolvedValue("data:image/png;base64,abc"),
  validateImageFile: vi.fn().mockReturnValue({ valid: true }),
}));

vi.mock("@/components/text-style-panel", () => ({
  TextStylePanel: () => <div data-testid="text-style-panel" />,
}));

vi.mock("@/components/overlay-controls-panel", () => ({
  OverlayControlsPanel: () => <div data-testid="overlay-controls-panel" />,
}));

// No nodes exist in this test (state.nodes = []), so this only affects node
// layer rendering, not the base canvas/img/wrapper structure under test.
vi.mock("@maga/editor", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@maga/editor")>();
  return { ...actual, isTextNode: () => false, isOverlayNode: () => false };
});

/** Finds the canvasCallbackRef div (the base image's direct parent) and its parent wrapper. */
function getCanvasAndWrapper() {
  const img = screen.getByAltText("Editor canvas");
  const canvasDiv = img.parentElement as HTMLElement;
  const wrapperDiv = canvasDiv.parentElement as HTMLElement;
  return { canvasDiv, wrapperDiv };
}

describe("canvas zoom export isolation", () => {
  it("at default zoom (100%): canvasCallbackRef div carries no transform, while its parent wrapper does", async () => {
    const { BatchWorkspace } = await import("@/components/batch/BatchWorkspace");
    render(<BatchWorkspace />);

    const { canvasDiv, wrapperDiv } = getCanvasAndWrapper();

    expect(canvasDiv).not.toBe(wrapperDiv);
    expect(canvasDiv.style.transform).toBe("");
    expect(wrapperDiv.style.transform).toContain("scale(");
  });

  it("after zooming in (non-1 zoom value): canvasCallbackRef div still carries no transform, wrapper's transform updates", async () => {
    const { BatchWorkspace } = await import("@/components/batch/BatchWorkspace");
    render(<BatchWorkspace />);

    fireEvent.click(screen.getByLabelText("Zoom in"));
    fireEvent.click(screen.getByLabelText("Zoom in"));

    const { canvasDiv, wrapperDiv } = getCanvasAndWrapper();

    expect(canvasDiv).not.toBe(wrapperDiv);
    expect(canvasDiv.style.transform).toBe("");
    expect(wrapperDiv.style.transform).toBe("scale(1.5)");
  });

  it("after fit-to-viewport / reset actions: canvasCallbackRef div never gains a transform", async () => {
    const { BatchWorkspace } = await import("@/components/batch/BatchWorkspace");
    render(<BatchWorkspace />);

    fireEvent.click(screen.getByLabelText("Zoom out"));
    fireEvent.click(screen.getByLabelText("Reset zoom"));

    const { canvasDiv } = getCanvasAndWrapper();
    expect(canvasDiv.style.transform).toBe("");
  });
});
