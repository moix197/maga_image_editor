import { SCHEMA_VERSION, migrateProject, type BatchProject } from "./schema";

const DB_NAME = "maga-batch";
const DB_VERSION = 1;
const PROJECTS_STORE = "projects";
const BLOBS_STORE = "blobs";

/**
 * Opens (creating on first run) the single `maga-batch` IndexedDB database with
 * its two object stores: `projects` (keyed by project id, holds BatchProject
 * JSON with blob-key refs only) and `blobs` (keyed by uuid, holds raw Blobs).
 */
export function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(PROJECTS_STORE)) {
        db.createObjectStore(PROJECTS_STORE);
      }
      if (!db.objectStoreNames.contains(BLOBS_STORE)) {
        db.createObjectStore(BLOBS_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/** Resolves once the given write transaction completes (or rejects on error). */
function awaitTransaction(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

/** Wraps an `IDBRequest` in a promise resolving to its result. */
function awaitRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/** Upserts a project's JSON under its `id`. Blobs are stored separately. */
export function saveProject(db: IDBDatabase, project: BatchProject): Promise<void> {
  const tx = db.transaction(PROJECTS_STORE, "readwrite");
  tx.objectStore(PROJECTS_STORE).put(project, project.id);
  return awaitTransaction(tx);
}

/**
 * Loads a project by id. Returns `null` if absent, or if the stored record's
 * `schemaVersion` is newer than this build understands (logs a warning and
 * discards it). Older records are migrated in-memory via {@link migrateProject}
 * (the shared v1→v2→v3 chain the ZIP import also applies) so legacy IDB records
 * load without error.
 */
export async function loadProject(db: IDBDatabase, id: string): Promise<BatchProject | null> {
  const tx = db.transaction(PROJECTS_STORE, "readonly");
  const stored = await awaitRequest(tx.objectStore(PROJECTS_STORE).get(id));
  if (!stored) return null;
  const project = stored as BatchProject;
  if (project.schemaVersion > SCHEMA_VERSION) {
    console.warn(
      `Discarding stored project ${id}: schemaVersion ${project.schemaVersion} > ${SCHEMA_VERSION}`,
    );
    return null;
  }
  return migrateProject(project);
}

/** Stores a raw blob under `key`. May reject with `QuotaExceededError`. */
export function saveBlob(db: IDBDatabase, key: string, blob: Blob): Promise<void> {
  const tx = db.transaction(BLOBS_STORE, "readwrite");
  tx.objectStore(BLOBS_STORE).put(blob, key);
  return awaitTransaction(tx);
}

/** Loads a blob by key, or `null` if absent. */
export async function loadBlob(db: IDBDatabase, key: string): Promise<Blob | null> {
  const tx = db.transaction(BLOBS_STORE, "readonly");
  const blob = await awaitRequest(tx.objectStore(BLOBS_STORE).get(key));
  return (blob as Blob | undefined) ?? null;
}

/** Removes a project's JSON record by id. Blobs are left untouched. */
export function deleteProject(db: IDBDatabase, id: string): Promise<void> {
  const tx = db.transaction(PROJECTS_STORE, "readwrite");
  tx.objectStore(PROJECTS_STORE).delete(id);
  return awaitTransaction(tx);
}
