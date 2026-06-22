import { isTextNode } from "@maga/editor";
import type { EditorState, NodeId, TextNode } from "@maga/editor";

/**
 * The styleable subset of a {@link TextNode}: every field a per-item override
 * may carry except identity/content/position. Used as the value type of
 * {@link BatchProject.itemTextStyles} so callers (and the render loop) can
 * apply a `Partial<TextStyle>` without reaching across to `@maga/editor`.
 */
export type TextStyle = Pick<
  TextNode,
  | "fontSize"
  | "color"
  | "opacity"
  | "fontFamily"
  | "fontWeight"
  | "fontStyle"
  | "rotation"
  | "shadow"
  | "textBackground"
>;

/**
 * Schema version for {@link BatchProject}. Bump on any breaking change to the
 * project JSON shape; consumers (ZIP import, IDB restore) gate on this literal
 * to reject incompatible projects.
 */
export const SCHEMA_VERSION = 3 as const;

/** Numeric literal type for the current schema version. */
export type SchemaVersion = typeof SCHEMA_VERSION;

/**
 * Lock default for a text layer added in a schema-v2 project: `false`
 * (per-image). New layers diverge per overlay item unless explicitly locked.
 */
export const newTextLayerLockDefault = false as const;

/**
 * Lock default applied to every text layer when migrating a v1 project to v2:
 * `true` (shared). v1 had no per-item text, so all existing layers are locked
 * to preserve the prior shared-text behavior. This is the OPPOSITE of
 * {@link newTextLayerLockDefault} — intentional.
 */
export const migratedTextLayerLockDefault = true as const;

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
 *   variableSlot: { overlayNodeId: "slot-node-id", width: 800, height: 600 },
 *   outputs: [],
 * };
 */
export interface BatchProject {
  /** Discriminant pinning the project to its schema version (current: v3). */
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
  /**
   * Editor template the variable slot is composited into, or `null` for a
   * background-only draft (no template authored yet).
   */
  template: EditorState | null;
  /**
   * The variable slot descriptor (node id + cover-fit dimensions), or `null`
   * when no slot has been designated yet.
   */
  variableSlot: VariableSlot | null;
  /** Generated composites; defaults to `[]` before any render. */
  outputs: GeneratedOutput[];
  /**
   * Per-item text overrides keyed `overlayAssetId → textNodeId → value`. Only
   * UNLOCKED text layers consult this map at render time; a missing entry falls
   * back to the template's own text value. Empty `{}` means no overrides.
   */
  itemTextValues: Record<string, Record<string, string>>;
  /**
   * Per-text-layer lock state keyed `textNodeId → locked`. `true` = the layer
   * shares the template value across all items; `false` = per-item value from
   * {@link itemTextValues}. New layers default to {@link newTextLayerLockDefault};
   * v1-migrated layers default to {@link migratedTextLayerLockDefault}.
   */
  textLayerLocks: Record<string, boolean>;
  /**
   * Per-item text STYLE overrides keyed `overlayAssetId → textNodeId → style
   * partial` (schema v3). Mirrors {@link itemTextValues} but carries a
   * {@link TextStyle} partial instead of a string. Only UNLOCKED layers consult
   * it at render time (same {@link textLayerLocks} that govern content govern
   * style too — there is no separate style lock); a missing/empty entry falls
   * back to the template node's own style. Empty `{}` means no style overrides.
   */
  itemTextStyles: Record<string, Record<string, Partial<TextStyle>>>;
}

/**
 * Builds the v1→v2 default lock map: every text layer in the template locked
 * (shared) to preserve v1's shared-text behavior. Returns `{}` when there is
 * no template or no text layers.
 */
export function migratedTextLayerLocks(template: EditorState | null): Record<string, boolean> {
  const locks: Record<string, boolean> = {};
  for (const node of template?.nodes ?? []) {
    if (isTextNode(node)) locks[node.id] = migratedTextLayerLockDefault;
  }
  return locks;
}

/**
 * Upgrades a project record missing the v2 fields (`schemaVersion < 2` or
 * absent) to v2: empty `itemTextValues` and an all-locked `textLayerLocks`
 * derived from the template. A record already at v2-or-newer is returned with
 * those fields intact. This step is the FIRST link in the {@link migrateProject}
 * chain and intentionally gates on the v2 literal (`2`), not `SCHEMA_VERSION`,
 * so bumping the current version never causes it to re-stamp a v2 record.
 */
export function migrateToV2<T extends { schemaVersion: number; template: EditorState | null }>(
  project: T,
): T & { schemaVersion: number } & Pick<BatchProject, "itemTextValues" | "textLayerLocks"> {
  if (project.schemaVersion >= 2) {
    return project as T &
      { schemaVersion: number } &
      Pick<BatchProject, "itemTextValues" | "textLayerLocks">;
  }
  return {
    ...project,
    schemaVersion: 2,
    itemTextValues: {},
    textLayerLocks: migratedTextLayerLocks(project.template),
  };
}

/**
 * Upgrades a v2 record to v3 by adding an empty {@link BatchProject.itemTextStyles}
 * map. Idempotent: a record already carrying `itemTextStyles` keeps it (never
 * reset), so re-running the chain on a v3 record is a no-op for style overrides.
 * Run after {@link migrateToV2} via {@link migrateProject}.
 */
export function migrateToV3<
  T extends { schemaVersion: number; itemTextStyles?: BatchProject["itemTextStyles"] },
>(project: T): T & Pick<BatchProject, "schemaVersion" | "itemTextStyles"> {
  return {
    ...project,
    schemaVersion: SCHEMA_VERSION,
    itemTextStyles: project.itemTextStyles ?? {},
  };
}

/**
 * Single forward-migration entry point: chains v1→v2→v3 by composing
 * {@link migrateToV2} then {@link migrateToV3}. Idempotent on an already-current
 * record (existing `itemTextValues` / `textLayerLocks` / `itemTextStyles` are
 * preserved, never reset). Shared by ZIP import and IDB load so both apply an
 * identical migration path — no forked copies.
 */
export function migrateProject<
  T extends {
    schemaVersion: number;
    template: EditorState | null;
    itemTextStyles?: BatchProject["itemTextStyles"];
  },
>(
  project: T,
): T & Pick<BatchProject, "schemaVersion" | "itemTextValues" | "textLayerLocks" | "itemTextStyles"> {
  return migrateToV3(migrateToV2(project));
}
