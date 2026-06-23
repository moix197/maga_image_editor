import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { useProjectPersistence } from "@/hooks/use-project-persistence";
import { SCHEMA_VERSION, type BatchProject } from "@maga/projects";
import type { NodeId } from "@maga/editor";

// downscaleIfNeeded needs canvas/Image (absent in jsdom) → pass the data URL through.
vi.mock("@/lib/image-helpers", () => ({
  downscaleIfNeeded: vi.fn(async (dataUrl: string) => dataUrl),
}));

// Mock the @maga/projects IDB + ZIP surface so the test exercises the hook's
// orchestration (restore / debounced save / import hydration) without fighting
// jsdom's Blob interop. The real adapter is covered by idb-adapter.test.ts.
const { idbProjects, idbBlobs, mockOpenDb, mockLoadProject, mockSaveProject, mockSaveBlob, mockLoadBlob, mockDeleteProject, mockImportProjectZip } =
  vi.hoisted(() => {
    const idbProjects = new Map<string, BatchProject>();
    // Stub blob shape: only `type` + `arrayBuffer()` (what blobToDataUrl reads).
    type StubBlob = { type: string; arrayBuffer: () => Promise<ArrayBuffer> };
    const idbBlobs = new Map<string, StubBlob>();
    return {
      idbProjects,
      idbBlobs,
      mockOpenDb: vi.fn(async () => ({}) as IDBDatabase),
      mockLoadProject: vi.fn(async (_db: IDBDatabase, id: string) => idbProjects.get(id) ?? null),
      mockSaveProject: vi.fn(async (_db: IDBDatabase, p: BatchProject) => {
        idbProjects.set(p.id, p);
      }),
      mockSaveBlob: vi.fn(async (_db: IDBDatabase, key: string, blob: StubBlob) => {
        idbBlobs.set(key, blob);
      }),
      mockLoadBlob: vi.fn(async (_db: IDBDatabase, key: string) => idbBlobs.get(key) ?? null),
      mockDeleteProject: vi.fn(async (_db: IDBDatabase, id: string) => {
        idbProjects.delete(id);
      }),
      mockImportProjectZip: vi.fn(),
    };
  });

vi.mock("@maga/projects", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@maga/projects")>();
  // Stub blob: carries type + an arrayBuffer() the hook's blobToDataUrl accepts.
  const makeBlob = (type: string, bytes: Uint8Array) => ({
    type,
    arrayBuffer: async () => bytes.buffer,
  });
  return {
    ...actual,
    openDb: mockOpenDb,
    loadProject: mockLoadProject,
    saveProject: mockSaveProject,
    saveBlob: mockSaveBlob,
    loadBlob: mockLoadBlob,
    deleteProject: mockDeleteProject,
    // data URL -> stub blob (preserves mime + bytes for round-trip)
    dataUrlToBlob: (dataUrl: string) => {
      const mime = dataUrl.slice(5, dataUrl.indexOf(";"));
      const b64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
      const bin = atob(b64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return makeBlob(mime, bytes);
    },
    importProjectZip: mockImportProjectZip,
  };
});

const PNG_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

const ACTIVE_KEY = "active";

function makeProject(overrides: Partial<BatchProject> = {}): BatchProject {
  return {
    schemaVersion: SCHEMA_VERSION,
    id: ACTIVE_KEY,
    name: "Test",
    createdAt: 0,
    updatedAt: 0,
    background: { id: "bg", filename: "bg.png", blobKey: PNG_DATA_URL },
    overlays: [],
    template: { nodes: [] },
    variableSlot: { overlayNodeId: "slot" as NodeId, width: 100, height: 100 },
    outputs: [],
    itemTextValues: {},
    itemTextStyles: {},
    ...overrides,
  };
}

beforeEach(() => {
  idbProjects.clear();
  idbBlobs.clear();
  vi.clearAllMocks();
});

describe("useProjectPersistence", () => {
  it("restores an existing IDB project on mount (setProject with data URLs)", async () => {
    // Seed: project JSON references blob keys; blobs hold the bytes.
    idbProjects.set(
      ACTIVE_KEY,
      makeProject({ background: { id: "bg", filename: "bg.png", blobKey: "bg-bg" } }),
    );
    const bin = atob(PNG_DATA_URL.slice(PNG_DATA_URL.indexOf(",") + 1));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    idbBlobs.set("bg-bg", {
      type: "image/png",
      arrayBuffer: async () => bytes.buffer,
    });

    const setProject = vi.fn();
    renderHook(() => useProjectPersistence({ project: null, setProject }));

    await waitFor(() => expect(setProject).toHaveBeenCalledTimes(1));
    const restored = setProject.mock.calls[0]![0] as BatchProject;
    expect(restored.background.blobKey).toMatch(/^data:image\/png;base64,/);
  });

  it("debounced state change triggers a saveProject to IDB", async () => {
    const setProject = vi.fn();
    const project = makeProject();

    renderHook(() => useProjectPersistence({ project, setProject }));

    // Wait for mount openDb() to resolve and the debounced save to fire.
    await waitFor(() => expect(mockSaveProject).toHaveBeenCalled(), { timeout: 2000 });
    expect(idbProjects.get(ACTIVE_KEY)).toBeDefined();
  });

  it("clearPersisted calls deleteProject with ACTIVE_PROJECT_KEY", async () => {
    // Stable setProject ref: the mount effect depends on it, so an inline
    // vi.fn() (new ref each render) would re-fire the effect forever.
    const setProject = vi.fn();
    const { result } = renderHook(() =>
      useProjectPersistence({ project: null, setProject }),
    );
    // Wait for the mount effect (openDb + loadProject) so db state is set.
    await waitFor(() => expect(mockLoadProject).toHaveBeenCalled(), { timeout: 2000 });

    await act(async () => {
      await result.current.clearPersisted();
    });

    await waitFor(() => expect(mockDeleteProject).toHaveBeenCalledWith(expect.anything(), "active"), {
      timeout: 2000,
    });
  });

  it("importZip hydrates state from a ZIP", async () => {
    mockImportProjectZip.mockResolvedValue({
      project: makeProject({
        background: { id: "bg", filename: "bg.png", blobKey: "background.png" },
        overlays: [{ id: "o1", filename: "a.png", blobKey: "overlays/0-a.png" }],
      }),
      blobs: new Map<string, { type: string; arrayBuffer: () => Promise<ArrayBuffer> }>([
        ["background.png", { type: "image/png", arrayBuffer: async () => new Uint8Array([1, 2]).buffer }],
        ["overlays/0-a.png", { type: "image/png", arrayBuffer: async () => new Uint8Array([3, 4]).buffer }],
      ]),
    });

    const setProject = vi.fn();
    const { result } = renderHook(() =>
      useProjectPersistence({ project: null, setProject }),
    );

    await act(async () => {
      await result.current.importZip(new File([], "p.zip"));
    });

    const calls = setProject.mock.calls;
    const imported = calls[calls.length - 1]![0] as BatchProject;
    expect(imported.overlays).toHaveLength(1);
    expect(imported.background.blobKey).toMatch(/^data:image\/png;base64,/);
    expect(imported.overlays[0]!.blobKey).toMatch(/^data:image\/png;base64,/);
  });
});
