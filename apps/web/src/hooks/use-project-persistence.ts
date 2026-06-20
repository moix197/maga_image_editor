"use client";

import { useCallback, useEffect, useState } from "react";
import {
  openDb,
  loadProject,
  saveProject,
  saveBlob,
  loadBlob,
  deleteProject,
  dataUrlToBlob,
  importProjectZip,
  ZipImportError,
  type BatchProject,
  type GeneratedOutput,
  type ProjectAsset,
} from "@maga/projects";
import { downscaleIfNeeded } from "@/lib/image-helpers";

/** Fixed key for the single in-progress project persisted to IndexedDB. */
const ACTIVE_PROJECT_KEY = "active";
const SAVE_DEBOUNCE_MS = 500;

/** Stable IDB blob keys derived from asset ids so re-saves overwrite cleanly. */
const bgBlobKey = (asset: ProjectAsset) => `bg-${asset.id}`;
const overlayBlobKey = (asset: ProjectAsset) => `ov-${asset.id}`;
const outputBlobKey = (output: GeneratedOutput) => `out-${output.overlayAssetId}`;

/** Reads a Blob's bytes, preferring `arrayBuffer()` with a FileReader fallback. */
function blobToBytes(blob: Blob): Promise<Uint8Array> {
  if (typeof blob.arrayBuffer === "function") {
    return blob.arrayBuffer().then((buf) => new Uint8Array(buf));
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read blob"));
    reader.readAsArrayBuffer(blob);
  });
}

/**
 * Encodes a Blob as a `data:<type>;base64,...` URL, preserving the Blob's own
 * MIME type. Reads bytes directly (not `readAsDataURL`) so the rendered UI/export
 * code keeps working with the same data-URL refs the in-memory project uses.
 */
async function blobToDataUrl(blob: Blob): Promise<string> {
  const bytes = await blobToBytes(blob);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
  const mime = blob.type || "application/octet-stream";
  return `data:${mime};base64,${btoa(binary)}`;
}

/** Replaces an asset's `blobKey` with the resolved value (data URL or key). */
function withBlobKey(asset: ProjectAsset, blobKey: string): ProjectAsset {
  return { ...asset, blobKey };
}

interface UseProjectPersistenceArgs {
  /** Current in-memory project (data URLs in blobKey fields), or null. */
  project: BatchProject | null;
  /** Hydrates in-memory state from a restored/imported project. */
  setProject: (project: BatchProject) => void;
}

interface UseProjectPersistenceResult {
  restored: boolean;
  /** Non-null exactly once per IDB-load or ZIP-import event; cleared by consumeRestore(). */
  pendingRestore: BatchProject | null;
  /** Drains pendingRestore — call after seeding the editor so subsequent live-sync
   *  updates to `project` do not re-trigger seeding. */
  consumeRestore: () => void;
  /** Permanently removes the active project record from IndexedDB. */
  clearPersisted: () => Promise<void>;
  importError: string | null;
  quotaWarning: boolean;
  importZip: (file: File) => Promise<void>;
}

export function useProjectPersistence({
  project,
  setProject,
}: UseProjectPersistenceArgs): UseProjectPersistenceResult {
  const [db, setDb] = useState<IDBDatabase | null>(null);
  const [restored, setRestored] = useState(false);
  const [pendingRestore, setPendingRestore] = useState<BatchProject | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [quotaWarning, setQuotaWarning] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const opened = await openDb();
      if (cancelled) return;
      setDb(opened);
      const stored = await loadProject(opened, ACTIVE_PROJECT_KEY);
      if (cancelled || !stored) return;
      const hydrated = await hydrateFromIdb(opened, stored);
      setProject(hydrated);
      setPendingRestore(hydrated);
      setRestored(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [setProject]);

  useEffect(() => {
    if (!db || !project) return;
    const timer = setTimeout(() => {
      void persistProject(db, project, () => setQuotaWarning(true));
    }, SAVE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [db, project]);

  const consumeRestore = useCallback(() => {
    setPendingRestore(null);
  }, []);

  const clearPersisted = useCallback(async () => {
    if (!db) return;
    await deleteProject(db, ACTIVE_PROJECT_KEY);
  }, [db]);

  const importZip = useCallback(
    async (file: File) => {
      setImportError(null);
      try {
        const { project: imported, blobs } = await importProjectZip(file);
        const hydrated = await hydrateFromBlobs(imported, blobs);
        setProject(hydrated);
        setPendingRestore(hydrated);
        setRestored(true);
      } catch (error) {
        if (error instanceof ZipImportError) {
          setImportError(error.message);
          return;
        }
        throw error;
      }
    },
    [setProject],
  );

  return { restored, pendingRestore, consumeRestore, clearPersisted, importError, quotaWarning, importZip };
}

/** Loads each ref's blob from IDB and rehydrates the project with data URLs. */
async function hydrateFromIdb(db: IDBDatabase, project: BatchProject): Promise<BatchProject> {
  const resolve = async (key: string) => {
    const blob = await loadBlob(db, key);
    return blob ? blobToDataUrl(blob) : key;
  };
  return {
    ...project,
    background: withBlobKey(project.background, await resolve(project.background.blobKey)),
    overlays: await Promise.all(
      project.overlays.map(async (o) => withBlobKey(o, await resolve(o.blobKey))),
    ),
    outputs: await Promise.all(
      project.outputs.map(async (o) => ({
        ...o,
        outputBlobKey: await resolve(o.outputBlobKey),
      })),
    ),
  };
}

/** Converts each imported ZIP blob to a data URL keyed by the project's refs. */
async function hydrateFromBlobs(
  project: BatchProject,
  blobs: Map<string, Blob>,
): Promise<BatchProject> {
  const resolve = async (key: string) => {
    const blob = blobs.get(key);
    return blob ? blobToDataUrl(blob) : key;
  };
  return {
    ...project,
    background: withBlobKey(project.background, await resolve(project.background.blobKey)),
    overlays: await Promise.all(
      project.overlays.map(async (o) => withBlobKey(o, await resolve(o.blobKey))),
    ),
    outputs: await Promise.all(
      project.outputs.map(async (o) => ({
        ...o,
        outputBlobKey: await resolve(o.outputBlobKey),
      })),
    ),
  };
}

/**
 * Persists the in-memory project to IDB: downscales + stores each blob under a
 * stable key, then writes the project JSON (blob-key refs only) under the active
 * key. Quota errors during blob writes are reported via `onQuotaExceeded` and do
 * not crash the session.
 */
async function persistProject(
  db: IDBDatabase,
  project: BatchProject,
  onQuotaExceeded: () => void,
): Promise<void> {
  const guardQuota = async (write: () => Promise<void>): Promise<void> => {
    try {
      await write();
    } catch (error) {
      if (error instanceof DOMException && error.name === "QuotaExceededError") {
        onQuotaExceeded();
        return;
      }
      throw error;
    }
  };

  const store = async (key: string, dataUrl: string, downscale: boolean) => {
    const src = downscale ? await downscaleIfNeeded(dataUrl, 2048) : dataUrl;
    await guardQuota(() => saveBlob(db, key, dataUrlToBlob(src)));
  };

  const bgKey = bgBlobKey(project.background);
  await store(bgKey, project.background.blobKey, true);

  const overlays: ProjectAsset[] = [];
  for (const overlay of project.overlays) {
    const key = overlayBlobKey(overlay);
    await store(key, overlay.blobKey, true);
    overlays.push(withBlobKey(overlay, key));
  }

  const outputs: GeneratedOutput[] = [];
  for (const output of project.outputs) {
    const key = outputBlobKey(output);
    await store(key, output.outputBlobKey, false);
    outputs.push({ ...output, outputBlobKey: key });
  }

  const record: BatchProject = {
    ...project,
    id: ACTIVE_PROJECT_KEY,
    updatedAt: Date.now(),
    background: withBlobKey(project.background, bgKey),
    overlays,
    outputs,
  };
  await guardQuota(() => saveProject(db, record));
}
