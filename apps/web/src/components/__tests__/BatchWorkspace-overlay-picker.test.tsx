/**
 * Phase 3 integration: "Add Image Overlay" opens the reuse-existing-assets
 * picker when overlay assets exist, and confirming 2+ picks creates one node
 * auto-designated the variable slot (via BatchWorkspace's
 * `setVariableSlotForNode`) with those assets as the active variants.
 *
 * `use-editor-state` is intentionally NOT mocked here (unlike the sibling
 * BatchWorkspace-editor.test.tsx) — the slot-designation path reads the
 * newly created node back out of `editorState.state.nodes`, which only a
 * real (stateful) hook instance provides.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const spies = vi.hoisted(() => ({
  setVariableSlot: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => ({
    get: (key: string) => (key === "section" ? "template" : null),
    toString: () => "section=template",
  }),
  useRouter: () => ({ push: vi.fn() }),
}));

const OVERLAY_A = { id: "asset-a", filename: "a.png", blobKey: "data:image/png;base64,a" };
const OVERLAY_B = { id: "asset-b", filename: "b.png", blobKey: "data:image/png;base64,b" };
// Stable references (not recreated per render) — BatchWorkspace reconciles
// `activeOverlayId`/`selectedVariantIds` during render by comparing the
// `overlays` array's identity across renders; a fresh array literal on every
// mock invocation would look like a "changed" prop on every re-render and
// trigger React's runaway-render guard.
const OVERLAYS = [OVERLAY_A, OVERLAY_B];
const BACKGROUND = { id: "bg1", filename: "bg.png", blobKey: "data:image/png;base64,bg" };

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
    setVariableSlot: spies.setVariableSlot,
    setNodeOverride: vi.fn(),
    setNodeHidden: vi.fn(),
    itemNodeOverrides: {},
    reorderOverlays: vi.fn(),
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

vi.mock("@/components/text-overlay-canvas", () => ({
  TextOverlayCanvas: () => <div data-testid="text-overlay-canvas" />,
}));
vi.mock("@/components/text-style-panel", () => ({
  TextStylePanel: () => <div data-testid="text-style-panel" />,
}));
vi.mock("@/components/overlay-controls-panel", () => ({
  OverlayControlsPanel: () => <div data-testid="overlay-controls-panel" />,
}));

describe("BatchWorkspace — overlay picker integration (Phase 3)", () => {
  beforeEach(() => {
    spies.setVariableSlot.mockClear();
  });

  it("clicking 'Add Image Overlay' opens the picker when overlay assets exist", async () => {
    const user = userEvent.setup();
    const { BatchWorkspace } = await import("@/components/batch/BatchWorkspace");
    render(<BatchWorkspace />);

    await user.click(screen.getByRole("button", { name: /add image overlay/i }));

    expect(screen.getByText(/choose an overlay image/i)).toBeInTheDocument();
  });

  it("picking two assets creates one node with the variable slot auto-enabled", async () => {
    const user = userEvent.setup();
    const { BatchWorkspace } = await import("@/components/batch/BatchWorkspace");
    render(<BatchWorkspace />);

    await user.click(screen.getByRole("button", { name: /add image overlay/i }));
    await user.click(screen.getByRole("checkbox", { name: /select a\.png/i }));
    await user.click(screen.getByRole("checkbox", { name: /select b\.png/i }));
    await user.click(screen.getByRole("button", { name: /^add$/i }));

    // setVariableSlot is called once by setVariableSlotForNode designating the
    // freshly created node as the (single) variable slot.
    expect(spies.setVariableSlot).toHaveBeenCalledTimes(1);
    const [slot] = spies.setVariableSlot.mock.calls[0]!;
    expect(slot).toMatchObject({ overlayNodeId: expect.any(String) });

    // The picker dialog closes after confirming.
    expect(screen.queryByText(/choose an overlay image/i)).not.toBeInTheDocument();
  });
});
