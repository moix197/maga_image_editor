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
export const SCHEMA_VERSION = 4 as const;

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
   * Per-item text overrides keyed `overlayAssetId → textNodeId → value`. Every
   * text layer is per-item (schema v4 retired the lock model); a missing entry
   * falls back to the template's own text value. Empty `{}` means no overrides.
   */
  itemTextValues: Record<string, Record<string, string>>;
  /**
   * Per-item text STYLE overrides keyed `overlayAssetId → textNodeId → style
   * partial` (schema v3). Mirrors {@link itemTextValues} but carries a
   * {@link TextStyle} partial instead of a string. Every text layer is per-item
   * (schema v4 retired the lock model); a missing/empty entry falls back to the
   * template node's own style. Empty `{}` means no style overrides.
   */
  itemTextStyles: Record<string, Record<string, Partial<TextStyle>>>;
  /**
   * Per-variant hidden node ids keyed `overlayAssetId → nodeId[]`. A text node
   * listed here for a given overlay is excluded from that overlay's canvas
   * preview and Generate All render. Absent means nothing is hidden for that
   * overlay. Added without a schema version bump — purely additive and
   * backward-compatible; absence defaults to `{}` / `[]` at read sites.
   */
  itemHiddenNodeIds?: Record<string, string[]>;
}

/**
 * Extracts the {@link TextStyle} subset from a template {@link TextNode}, used by
 * {@link migrateToV4} to seed each variant's per-item style override from the
 * locked layer's template style. Mirrors the fields of {@link TextStyle} exactly.
 */
function textStyleOf(node: TextNode): TextStyle {
  return {
    fontSize: node.fontSize,
    color: node.color,
    opacity: node.opacity,
    fontFamily: node.fontFamily,
    fontWeight: node.fontWeight,
    fontStyle: node.fontStyle,
    rotation: node.rotation,
    shadow: node.shadow,
    textBackground: node.textBackground,
  };
}

/**
 * Builds the v1→v2 default lock map: every text layer in the template locked
 * (shared) to preserve v1's shared-text behavior. Returns `{}` when there is
 * no template or no text layers. Internal to {@link migrateToV2} — the lock
 * model was retired in v4, so this is no longer part of the public surface; it
 * survives only to feed the v2→v3→v4 fan-out for legacy v1 records.
 */
function v1LockMap(template: EditorState | null): Record<string, boolean> {
  const locks: Record<string, boolean> = {};
  for (const node of template?.nodes ?? []) {
    if (isTextNode(node)) locks[node.id] = true;
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
 *
 * The `textLayerLocks` it emits is a transient migration artifact only — the
 * v4 step ({@link migrateToV4}) fans it into per-item overrides and drops it.
 */
export function migrateToV2<T extends { schemaVersion: number; template: EditorState | null }>(
  project: T,
): T & { schemaVersion: number; itemTextValues: BatchProject["itemTextValues"]; textLayerLocks?: Record<string, boolean> } {
  if (project.schemaVersion >= 2) {
    return project as T & {
      schemaVersion: number;
      itemTextValues: BatchProject["itemTextValues"];
      textLayerLocks?: Record<string, boolean>;
    };
  }
  return {
    ...project,
    schemaVersion: 2,
    itemTextValues: {},
    textLayerLocks: v1LockMap(project.template),
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
 * Upgrades a v3 record to v4 by retiring the lock model: every previously-locked
 * text layer's template value/style is fanned out into each overlay's per-item
 * {@link BatchProject.itemTextValues}/{@link BatchProject.itemTextStyles}, then
 * `textLayerLocks` is dropped from the record. After v4, ALL text layers are
 * per-item — there is no shared/locked concept.
 *
 * Edge cases handled (see plan Dependencies & Risks 6/7/8):
 * - zero overlays: nothing to fan into — locks are simply dropped, no crash;
 * - stale lock key (node id no longer in the template): skipped, never written;
 * - existing per-item override for a locked node: preserved, never overwritten
 *   (keeps the migration idempotent and non-clobbering).
 *
 * Idempotent: a record already at v4 (no `textLayerLocks`) is returned unchanged
 * apart from re-stamping `schemaVersion`. Run after {@link migrateToV3} via
 * {@link migrateProject}.
 */
export function migrateToV4<
  T extends {
    schemaVersion: number;
    template: EditorState | null;
    textLayerLocks?: Record<string, boolean>;
    itemTextValues: BatchProject["itemTextValues"];
    itemTextStyles: BatchProject["itemTextStyles"];
    overlays: BatchProject["overlays"];
  },
>(
  project: T,
): Omit<T, "textLayerLocks"> & Pick<BatchProject, "schemaVersion" | "itemTextValues" | "itemTextStyles"> {
  const { textLayerLocks, ...rest } = project;
  const templateNodeIds = new Set(
    (project.template?.nodes ?? []).filter(isTextNode).map((node) => node.id),
  );
  const itemTextValues: BatchProject["itemTextValues"] = { ...project.itemTextValues };
  const itemTextStyles: BatchProject["itemTextStyles"] = { ...project.itemTextStyles };

  for (const [nodeId, locked] of Object.entries(textLayerLocks ?? {})) {
    if (!locked || !templateNodeIds.has(nodeId as NodeId)) continue;
    const templateNode = project.template?.nodes.find((node) => node.id === nodeId);
    if (!templateNode || !isTextNode(templateNode)) continue;
    for (const overlay of project.overlays) {
      // Copy the nested per-overlay map before writing so the input record's
      // nested objects are never mutated in place (matches v2/v3 immutability).
      const values = (itemTextValues[overlay.id] = { ...(itemTextValues[overlay.id] ?? {}) });
      if (!(nodeId in values)) values[nodeId] = templateNode.content;
      const styles = (itemTextStyles[overlay.id] = { ...(itemTextStyles[overlay.id] ?? {}) });
      if (!(nodeId in styles)) styles[nodeId] = textStyleOf(templateNode);
    }
  }

  return { ...rest, schemaVersion: 4, itemTextValues, itemTextStyles };
}

/**
 * Single forward-migration entry point: chains v1→v2→v3→v4 by composing
 * {@link migrateToV2}, {@link migrateToV3}, then {@link migrateToV4}. Idempotent
 * on an already-current record (existing `itemTextValues` / `itemTextStyles` are
 * preserved, never reset; `textLayerLocks` is dropped). Shared by ZIP import and
 * IDB load so both apply an identical migration path — no forked copies.
 */
export function migrateProject<
  T extends {
    schemaVersion: number;
    template: EditorState | null;
    overlays: BatchProject["overlays"];
    itemTextStyles?: BatchProject["itemTextStyles"];
  },
>(
  project: T,
): Omit<T, "textLayerLocks"> & Pick<BatchProject, "schemaVersion" | "itemTextValues" | "itemTextStyles"> {
  return migrateToV4(migrateToV3(migrateToV2(project)));
}
