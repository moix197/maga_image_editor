import type { EditorState, NodeId } from "@maga/editor";

/**
 * Schema version for {@link BatchProject}. Bump on any breaking change to the
 * project JSON shape; consumers (ZIP import, IDB restore) gate on this literal
 * to reject incompatible projects.
 */
export const SCHEMA_VERSION = 1 as const;

/** Numeric literal type for the current schema version. */
export type SchemaVersion = typeof SCHEMA_VERSION;

/**
 * A binary asset referenced by a project. The actual bytes live out-of-band
 * (IndexedDB blob store / ZIP entry); the project JSON holds only the
 * {@link ProjectAsset.blobKey} ref so it stays small, queryable, and portable.
 */
export interface ProjectAsset {
  /** Stable uuid identifying this asset within the project. */
  id: string;
  /** Original upload filename, preserved for display and ZIP entry naming. */
  filename: string;
  /** Key into the blob store (IDB) / relative path (ZIP) — never an absolute URL. */
  blobKey: string;
}

/**
 * The single "variable image slot" in a template: the {@link OverlayNode}
 * whose `src` is swapped per overlay image at render time, plus the cover-fit
 * parameters used to center-crop each overlay into the slot.
 */
export interface VariableSlot {
  /** Id of the template {@link OverlayNode} that acts as the variable slot. */
  overlayNodeId: NodeId;
  /** Target slot width in px for cover-fit cropping. */
  width: number;
  /** Target slot height in px for cover-fit cropping. */
  height: number;
}

/** One composited result produced for a single overlay image. */
export interface GeneratedOutput {
  /** Id of the {@link ProjectAsset} overlay this output was rendered from. */
  overlayAssetId: string;
  /** Blob store key / relative ZIP path for the rendered composite. */
  outputBlobKey: string;
  /** Epoch milliseconds when this output was generated. */
  timestamp: number;
}

/**
 * Versioned batch-compositing project. One background, N overlay images, a
 * template with one variable slot, and the generated outputs.
 *
 * @example
 * const project: BatchProject = {
 *   schemaVersion: 1,
 *   id: crypto.randomUUID(),
 *   name: "Summer campaign",
 *   createdAt: Date.now(),
 *   updatedAt: Date.now(),
 *   background: { id: "bg", filename: "bg.png", blobKey: "blob-bg" },
 *   overlays: [],
 *   template: { nodes: [] },
 *   variableSlotId: "slot-node-id",
 *   outputs: [],
 * };
 */
export interface BatchProject {
  /** Discriminant pinning the project to schema v1. */
  schemaVersion: SchemaVersion;
  /** Stable uuid for the project. */
  id: string;
  /** Human-readable project name. */
  name: string;
  /** Epoch milliseconds at creation. */
  createdAt: number;
  /** Epoch milliseconds of last mutation. */
  updatedAt: number;
  /** The background image asset. */
  background: ProjectAsset;
  /** Overlay image assets, one composite produced per entry. */
  overlays: ProjectAsset[];
  /** Editor template the variable slot is composited into. */
  template: EditorState;
  /** Id of the template node that is the variable slot ({@link VariableSlot.overlayNodeId}). */
  variableSlotId: string;
  /** Generated composites; defaults to `[]` before any render. */
  outputs: GeneratedOutput[];
}
