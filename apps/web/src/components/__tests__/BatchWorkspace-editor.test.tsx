import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";

// Hoist stable spies so mock factories and test assertions share the same refs.
const spies = vi.hoisted(() => ({
  handleSetItemTextValue: vi.fn(),
  setTextValue: vi.fn(),
  mockTextOverlayCanvas: vi.fn(),
}));

// Mock next/navigation — BatchWorkspace uses useSearchParams
vi.mock("next/navigation", () => ({
  useSearchParams: () => ({
    get: (key: string) => (key === "section" ? "template" : null),
    toString: () => "section=template",
  }),
  useRouter: () => ({ push: vi.fn() }),
}));

// Mock all hooks used by BatchWorkspace
vi.mock("@/hooks/use-batch-project", () => ({
  useBatchProject: () => ({
    background: { id: "bg1", filename: "bg.png", blobKey: "data:image/png;base64,bg" },
    overlays: [],
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
  useSingleComposite: () => ({
    compositeDataUrl: null,
    isRendering: false,
    error: null,
    generate: vi.fn(),
  }),
}));

vi.mock("@/hooks/use-batch-render", () => ({
  useBatchRender: () => ({
    isRunning: false,
    progress: 0,
    error: null,
    run: vi.fn(),
    cancel: vi.fn(),
  }),
}));

vi.mock("@/hooks/use-zip-export", () => ({
  useZipExport: () => ({
    isExporting: false,
    error: null,
    exportZip: vi.fn(),
  }),
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
    setTextValue: spies.setTextValue,
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
    handleSetItemTextValue: spies.handleSetItemTextValue,
    handleSetItemTextStyle: vi.fn(),
    handleSetNodeHidden: vi.fn(),
  }),
}));

vi.mock("@/lib/image-helpers", () => ({
  fileToDataUrl: vi.fn().mockResolvedValue("data:image/png;base64,abc"),
}));

// Stub heavy child components — capture props so tests can invoke callbacks.
// The mock is defined via a hoisted spy so assertions can reference it.
type TextOverlayCanvasProps = ComponentProps<"div"> & {
  onNodeContentChange?: (id: string, content: string) => void;
  [key: string]: unknown;
};
spies.mockTextOverlayCanvas.mockImplementation(
  ({ onNodeContentChange: _oncc, ...rest }: TextOverlayCanvasProps) => (
    <div data-testid="text-overlay-canvas" {...(rest as ComponentProps<"div">)} />
  ),
);
vi.mock("@/components/text-overlay-canvas", () => ({
  get TextOverlayCanvas() {
    return spies.mockTextOverlayCanvas;
  },
}));

vi.mock("@/components/text-style-panel", () => ({
  TextStylePanel: () => <div data-testid="text-style-panel" />,
}));

vi.mock("@/components/overlay-controls-panel", () => ({
  OverlayControlsPanel: () => <div data-testid="overlay-controls-panel" />,
}));

vi.mock("@maga/editor", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@maga/editor")>();
  return { ...actual, isTextNode: () => false, isOverlayNode: () => false };
});

describe("BatchWorkspace — embedded editor surface", () => {
  it("renders TextOverlayCanvas when a background is set", async () => {
    const { BatchWorkspace } = await import("@/components/batch/BatchWorkspace");
    render(<BatchWorkspace />);
    expect(screen.getByTestId("text-overlay-canvas")).toBeInTheDocument();
  });

  it("does not render a TemplateEditor or Save Template button", async () => {
    const { BatchWorkspace } = await import("@/components/batch/BatchWorkspace");
    render(<BatchWorkspace />);
    expect(screen.queryByText("Save Template")).not.toBeInTheDocument();
    expect(screen.queryByText("Edit Template")).not.toBeInTheDocument();
    expect(screen.queryByText("Set Up Template")).not.toBeInTheDocument();
  });

  it("onNodeContentChange fans out via fanOut.handleSetItemTextValue, not itemText.setTextValue", async () => {
    spies.handleSetItemTextValue.mockClear();
    spies.setTextValue.mockClear();
    spies.mockTextOverlayCanvas.mockClear();
    // Re-mock implementation after clear so the component still renders
    spies.mockTextOverlayCanvas.mockImplementation(
      ({ onNodeContentChange: _oncc, ...rest }: TextOverlayCanvasProps) => (
        <div data-testid="text-overlay-canvas" {...(rest as ComponentProps<"div">)} />
      ),
    );

    const { BatchWorkspace } = await import("@/components/batch/BatchWorkspace");
    render(<BatchWorkspace />);

    // Pull the onNodeContentChange prop that was passed to the mocked TextOverlayCanvas
    const calls = spies.mockTextOverlayCanvas.mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    const lastCall = calls[calls.length - 1]!;
    const { onNodeContentChange } = lastCall[0] as { onNodeContentChange?: (id: string, content: string) => void };
    expect(onNodeContentChange).toBeDefined();

    onNodeContentChange!("node-1", "hello world");

    // Must fan out to all selected variants via fanOut
    expect(spies.handleSetItemTextValue).toHaveBeenCalledWith(
      expect.any(String), // activeOverlayId (null → "" in the handler)
      "node-1",
      "hello world",
    );

    // Must NOT touch the single-overlay itemText path
    expect(spies.setTextValue).toHaveBeenCalledTimes(0);
  });
});
