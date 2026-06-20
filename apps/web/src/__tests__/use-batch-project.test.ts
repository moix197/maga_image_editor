import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useBatchProject } from "@/hooks/use-batch-project";
import { useProjectPersistence } from "@/hooks/use-project-persistence";
import type { BatchProject, VariableSlot } from "@maga/projects";
import type { NodeId, EditorState } from "@maga/editor";

// ── mocks for useProjectPersistence ─────────────────────────────────────────

vi.mock("@maga/projects", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@maga/projects")>();
  return {
    ...actual,
    openDb: vi.fn().mockResolvedValue({} as IDBDatabase),
    loadProject: vi.fn().mockResolvedValue(null),
    saveProject: vi.fn().mockResolvedValue(undefined),
    saveBlob: vi.fn().mockResolvedValue(undefined),
    loadBlob: vi.fn().mockResolvedValue(null),
    importProjectZip: vi.fn(),
  };
});

vi.mock("@/lib/image-helpers", () => ({
  fileToDataUrl: vi.fn((file: File) =>
    Promise.resolve("data:image/png;base64," + file.name)
  ),
}));

function makeFile(name: string): File {
  return new File([new Uint8Array(10)], name, { type: "image/png" });
}

describe("useBatchProject", () => {
  it("background starts null and overlays starts empty", () => {
    const { result } = renderHook(() => useBatchProject());
    expect(result.current.background).toBeNull();
    expect(result.current.overlays).toHaveLength(0);
  });

  it("setBackground sets the background asset", async () => {
    const { result } = renderHook(() => useBatchProject());
    const file = makeFile("bg.png");

    await act(async () => {
      await result.current.setBackground(file);
    });

    expect(result.current.background).not.toBeNull();
    expect(result.current.background!.filename).toBe("bg.png");
    expect(result.current.background!.blobKey).toBe("data:image/png;base64,bg.png");
  });

  it("addOverlays appends assets", async () => {
    const { result } = renderHook(() => useBatchProject());
    const files = [makeFile("a.png"), makeFile("b.png"), makeFile("c.png")];

    await act(async () => {
      await result.current.addOverlays(files);
    });

    expect(result.current.overlays).toHaveLength(3);
    expect(result.current.overlays.map((o) => o.filename)).toEqual([
      "a.png",
      "b.png",
      "c.png",
    ]);
  });

  it("duplicate filenames get different ids", async () => {
    const { result } = renderHook(() => useBatchProject());

    await act(async () => {
      await result.current.addOverlays([makeFile("dup.png"), makeFile("dup.png")]);
    });

    expect(result.current.overlays).toHaveLength(2);
    expect(result.current.overlays[0]!.id).not.toBe(result.current.overlays[1]!.id);
  });

  it("setEditorTemplate updates template without touching variableSlot", () => {
    const { result } = renderHook(() => useBatchProject());
    const editorState = { nodes: [{ id: "n1", type: "text" as const, x: 0, y: 0, zIndex: 0, text: "hi", fontSize: 14, fontFamily: "Arial", color: "#000", fontWeight: "normal" as const, fontStyle: "normal" as const, textDecoration: "none" as const, textAlign: "left" as const, opacity: 1 }] };

    act(() => {
      result.current.setEditorTemplate(editorState as never);
    });

    expect(result.current.template).toEqual(editorState);
    // variableSlot was never set, must remain null
    expect(result.current.variableSlot).toBeNull();
  });

  it("setEditorTemplate with undefined sets template to null", () => {
    const { result } = renderHook(() => useBatchProject());

    act(() => {
      result.current.setEditorTemplate(undefined);
    });

    expect(result.current.template).toBeNull();
  });

  it("setVariableSlot sets variableSlot", () => {
    const { result } = renderHook(() => useBatchProject());
    const slot: VariableSlot = { overlayNodeId: "node-1" as NodeId, width: 200, height: 100 };

    act(() => {
      result.current.setVariableSlot(slot);
    });

    expect(result.current.variableSlot).toEqual(slot);
  });

  it("background-only state satisfies the autosave precondition (background set, template + slot null)", async () => {
    // Autosave gates on `background != null` only (template/variableSlot relaxed
    // to nullable in Phase 5), so a background-only draft must persist.
    const { result } = renderHook(() => useBatchProject());

    await act(async () => {
      await result.current.setBackground(makeFile("bg.png"));
    });

    expect(result.current.background).not.toBeNull();
    expect(result.current.template).toBeNull();
    expect(result.current.variableSlot).toBeNull();
  });

  it("with no background the autosave precondition is not met", () => {
    const { result } = renderHook(() => useBatchProject());
    expect(result.current.background).toBeNull();
    expect(result.current.template).toBeNull();
    expect(result.current.variableSlot).toBeNull();
  });

  it("setVariableSlot with null clears variableSlot", () => {
    const { result } = renderHook(() => useBatchProject());
    const slot: VariableSlot = { overlayNodeId: "node-1" as NodeId, width: 200, height: 100 };

    act(() => {
      result.current.setVariableSlot(slot);
    });
    act(() => {
      result.current.setVariableSlot(null);
    });

    expect(result.current.variableSlot).toBeNull();
  });

  it("clearProject resets background, template, variableSlot, overlays, and outputs to empty", async () => {
    const { result } = renderHook(() => useBatchProject());
    const slot: VariableSlot = { overlayNodeId: "node-1" as NodeId, width: 200, height: 100 };

    await act(async () => {
      await result.current.setBackground(makeFile("bg.png"));
      await result.current.addOverlays([makeFile("a.png"), makeFile("b.png")]);
    });
    act(() => {
      result.current.setVariableSlot(slot);
    });

    act(() => {
      result.current.clearProject();
    });

    expect(result.current.background).toBeNull();
    expect(result.current.overlays).toHaveLength(0);
    expect(result.current.template).toBeNull();
    expect(result.current.variableSlot).toBeNull();
    expect(result.current.outputs).toHaveLength(0);
  });
});

// ── useProjectPersistence: pendingRestore drain ──────────────────────────────

function makeProject(templateNodeId: string): BatchProject {
  const template: EditorState = {
    nodes: [
      {
        id: templateNodeId as NodeId,
        src: "data:img",
        x: 0, y: 0, width: 200, height: 150,
        opacity: 1, zIndex: 0, overlayType: "image" as const,
      },
    ],
  };
  return {
    schemaVersion: 1,
    id: "active",
    name: "test",
    createdAt: 0,
    updatedAt: 0,
    background: { id: "bg", filename: "bg.png", blobKey: "data:bg" },
    overlays: [],
    template,
    variableSlot: { overlayNodeId: templateNodeId as NodeId, width: 200, height: 150 },
    outputs: [],
  };
}

describe("useProjectPersistence pendingRestore drain", () => {
  // importProjectZip is resolved inside beforeEach to avoid top-level await
  let importProjectZip: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.clearAllMocks();
    const projects = await import("@maga/projects");
    importProjectZip = vi.mocked(projects.importProjectZip);
    // Reset IDB mocks so each test starts with no stored project
    vi.mocked(projects.openDb).mockResolvedValue({} as IDBDatabase);
    vi.mocked(projects.loadProject).mockResolvedValue(null);
  });

  it("pendingRestore is null on initial render (no IDB data)", async () => {
    const { result } = renderHook(() =>
      useProjectPersistence({ project: null, setProject: vi.fn() })
    );
    // After IDB resolves with null (mocked), pendingRestore stays null
    await act(async () => { await Promise.resolve(); });
    expect(result.current.pendingRestore).toBeNull();
  });

  it("ZIP import sets pendingRestore to the imported project", async () => {
    const imported = makeProject("node-zip");
    importProjectZip.mockResolvedValue({ project: imported, blobs: new Map() });

    const setProject = vi.fn();
    const { result } = renderHook(() =>
      useProjectPersistence({ project: null, setProject })
    );

    await act(async () => {
      await result.current.importZip(new File([], "test.zip"));
    });

    expect(result.current.pendingRestore).not.toBeNull();
    expect(result.current.pendingRestore?.variableSlot?.overlayNodeId).toBe("node-zip");
  });

  it("consumeRestore clears pendingRestore so a subsequent live-sync cannot re-trigger seeding", async () => {
    const imported = makeProject("node-a");
    importProjectZip.mockResolvedValue({ project: imported, blobs: new Map() });

    const setProject = vi.fn();
    const { result } = renderHook(() =>
      useProjectPersistence({ project: null, setProject })
    );

    await act(async () => {
      await result.current.importZip(new File([], "test.zip"));
    });
    expect(result.current.pendingRestore).not.toBeNull();

    // Consumer drains it (simulating BatchWorkspace effect)
    act(() => {
      result.current.consumeRestore();
    });
    expect(result.current.pendingRestore).toBeNull();
  });

  it("a second distinct ZIP import produces a fresh pendingRestore after the first was consumed", async () => {
    const first = makeProject("node-first");
    const second = makeProject("node-second");
    importProjectZip
      .mockResolvedValueOnce({ project: first, blobs: new Map() })
      .mockResolvedValueOnce({ project: second, blobs: new Map() });

    const setProject = vi.fn();
    const { result } = renderHook(() =>
      useProjectPersistence({ project: null, setProject })
    );

    // First import + consume
    await act(async () => {
      await result.current.importZip(new File([], "first.zip"));
    });
    act(() => { result.current.consumeRestore(); });
    expect(result.current.pendingRestore).toBeNull();

    // Second import sets a fresh pendingRestore
    await act(async () => {
      await result.current.importZip(new File([], "second.zip"));
    });
    expect(result.current.pendingRestore).not.toBeNull();
    expect(result.current.pendingRestore?.variableSlot?.overlayNodeId).toBe("node-second");
  });
});
