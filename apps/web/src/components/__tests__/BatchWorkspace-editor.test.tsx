import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

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

vi.mock("@/lib/image-helpers", () => ({
  fileToDataUrl: vi.fn().mockResolvedValue("data:image/png;base64,abc"),
}));

// Stub heavy child components
vi.mock("@/components/text-overlay-canvas", () => ({
  TextOverlayCanvas: () => <div data-testid="text-overlay-canvas" />,
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
});
