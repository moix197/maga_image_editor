import { isTextNode } from "@maga/editor";
import type { EditorState, NodeId, OverlayNode, TextNode } from "@maga/editor";

/**
 * The styleable subset of a {@link TextNode}: every field a per-item override
 * may carry except identity/content/position. Folded into {@link NodeOverride}
 * (and surfaced via `getTextStyle`) so callers (and the render loop) can
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
  | "textAlign"
  | "verticalAlign"
>;

/**
 * A per-(overlay, node) override value: a `Partial` of the overridable fields
 * shared across both node kinds (`TextNode` and `OverlayNode`, minus `id`) plus
 * an optional `hidden` flag that is NOT a real Node field.
 *
 * `id` is `Omit`ted because the override is keyed by nodeId. `hidden: true` means
 * the node is hidden for that variant (absent/`false` = visible); the merge path
 * strips `hidden` before spreading the rest onto a real Node, so the flag never
 * lands on a Node and never reaches the DOM.
 *
 * Field-collision note: `TextNode` and `OverlayNode` overlap only on `x`, `y`,
 * `rotation`, `zIndex`, `opacity`, all typed `number`, so the intersection is
 * well-formed; under `Partial<…>` every field is optional. See decision D2.
 */
export type NodeOverride = Partial<Omit<TextNode & OverlayNode, "id">> & { hidden?: boolean };

/**
 * Schema version for {@link BatchProject}. Bump on any breaking change to the
 * project JSON shape; consumers (ZIP import, IDB restore) gate on this literal
 * to reject incompatible projects.
 */
export const SCHEMA_VERSION = 5 as const;

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
  /** Discriminant pinning the project to its schema version (current: v5). */
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
   * Unified per-(overlay, node) override store keyed
   * `overlayAssetId → nodeId → {@link NodeOverride}` (schema v5). Collapses the
   * former v4 trio (`itemTextValues`, `itemTextStyles`, `itemHiddenNodeIds`)
   * into one map: content lives under `content`, the style partial is spread
   * into the override, and visibility rides on the `hidden` flag. Every node is
   * per-item; a missing entry/field falls back to the template node's own value.
   * Empty `{}` means no overrides.
   */
  itemNodeOverrides: Record<string, Record<string, NodeOverride>>;
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
    textAlign: node.textAlign,
    verticalAlign: node.verticalAlign,
  };
}

/**
 * Builds the v1→v2 default lock map: every text layer in the template locked
 * (shared) to preserve v1's shared-text behavior. Returns `{}` when there is
 * no template or no text layers. Internal to {@link migrateToV2} — the lock
 * model was retired in v4, so this is no longer part of the public surface; it
 * survives only to feed the v2→v3→v4 fan-out for legacy v1 records.
 */
/**
 * Retired v4 per-item text **content** map shape (`overlayId → nodeId → value`).
 * No longer a field on {@link BatchProject} (collapsed into `itemNodeOverrides`
 * in v5); retained as a standalone alias for the migration steps that produce
 * and consume it.
 */
type LegacyItemTextValues = Record<string, Record<string, string>>;

/** Retired v4 per-item text **style** map shape (`overlayId → nodeId → partial`). */
type LegacyItemTextStyles = Record<string, Record<string, Partial<TextStyle>>>;

/** Retired v4 per-variant **hidden** node-id map shape (`overlayId → nodeId[]`). */
type LegacyItemHiddenNodeIds = Record<string, string[]>;

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
): T & { schemaVersion: number; itemTextValues: LegacyItemTextValues; textLayerLocks?: Record<string, boolean> } {
  if (project.schemaVersion >= 2) {
    return project as T & {
      schemaVersion: number;
      itemTextValues: LegacyItemTextValues;
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
  T extends { schemaVersion: number; itemTextStyles?: LegacyItemTextStyles },
>(project: T): T & { schemaVersion: number; itemTextStyles: LegacyItemTextStyles } {
  return {
    ...project,
    schemaVersion: 3,
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
    itemTextValues: LegacyItemTextValues;
    itemTextStyles: LegacyItemTextStyles;
    overlays: BatchProject["overlays"];
  },
>(
  project: T,
): Omit<T, "textLayerLocks"> & { schemaVersion: number; itemTextValues: LegacyItemTextValues; itemTextStyles: LegacyItemTextStyles } {
  const { textLayerLocks, ...rest } = project;
  const templateNodeIds = new Set(
    (project.template?.nodes ?? []).filter(isTextNode).map((node) => node.id),
  );
  const itemTextValues: LegacyItemTextValues = { ...project.itemTextValues };
  const itemTextStyles: LegacyItemTextStyles = { ...project.itemTextStyles };

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

/** The v5-shaped output of {@link migrateToV5}: legacy maps dropped, unified store added. */
type MigratedToV5<T> = Omit<T, "itemTextValues" | "itemTextStyles" | "itemHiddenNodeIds" | "itemNodeOverrides"> &
  Pick<BatchProject, "schemaVersion" | "itemNodeOverrides">;

/**
 * Upgrades a v4 record to v5 by collapsing the three parallel per-item text maps
 * (`itemTextValues`, `itemTextStyles`, `itemHiddenNodeIds`) into the single
 * unified {@link BatchProject.itemNodeOverrides} store, then dropping the three
 * old maps. For each overlay key present across the three maps:
 * - a content entry folds into `NodeOverride.content`;
 * - the style partial is spread into the override;
 * - each hidden nodeId becomes `hidden: true`.
 *
 * Edge cases (mirror the v3→v4 handling):
 * - **idempotent** — a record already at v5 (`schemaVersion >= 5`) is returned
 *   as-is, so re-running the chain is a no-op;
 * - **no-clobber** — an existing `itemNodeOverrides[overlay][node]` field is
 *   never overwritten by the fold;
 * - **stale keys skipped** — collapse iterates the existing map keys only, so an
 *   overlay/node with no source entry yields nothing;
 * - **zero-overlay safe** — empty maps fold into an empty `itemNodeOverrides`.
 *
 * Run after {@link migrateToV4} via {@link migrateProject}.
 */
export function migrateToV5<
  T extends {
    schemaVersion: number;
    itemTextValues: LegacyItemTextValues;
    itemTextStyles: LegacyItemTextStyles;
    itemHiddenNodeIds?: LegacyItemHiddenNodeIds;
    itemNodeOverrides?: ItemNodeOverrides;
  },
>(
  project: T,
): MigratedToV5<T> {
  if (project.schemaVersion >= 5) {
    // Input is gated to `<= SCHEMA_VERSION` (5) by both ingress points and the
    // `>= 5` guard, so an already-current record is exactly v5; re-stamp the
    // literal and pass `itemNodeOverrides` through untouched (idempotent).
    const {
      itemTextValues: _v,
      itemTextStyles: _s,
      itemHiddenNodeIds: _h,
      ...rest
    } = project;
    return {
      ...rest,
      schemaVersion: SCHEMA_VERSION,
      itemNodeOverrides: project.itemNodeOverrides ?? {},
    } as MigratedToV5<T>;
  }

  const {
    itemTextValues,
    itemTextStyles,
    itemHiddenNodeIds,
    itemNodeOverrides: existing,
    ...rest
  } = project;

  const overrides: BatchProject["itemNodeOverrides"] = { ...(existing ?? {}) };

  /**
   * Returns (creating if absent) the override object for `(overlay, node)`,
   * copying the nested maps before write so the input record is never mutated.
   */
  const overrideFor = (overlayId: string, nodeId: string): NodeOverride => {
    const perOverlay = (overrides[overlayId] = { ...(overrides[overlayId] ?? {}) });
    return (perOverlay[nodeId] = { ...(perOverlay[nodeId] ?? {}) });
  };

  for (const [overlayId, nodeMap] of Object.entries(itemTextValues)) {
    for (const [nodeId, content] of Object.entries(nodeMap)) {
      const override = overrideFor(overlayId, nodeId);
      if (!("content" in override)) override.content = content;
    }
  }

  for (const [overlayId, nodeMap] of Object.entries(itemTextStyles)) {
    for (const [nodeId, style] of Object.entries(nodeMap)) {
      const override = overrideFor(overlayId, nodeId);
      for (const [field, value] of Object.entries(style)) {
        if (!(field in override)) (override as Record<string, unknown>)[field] = value;
      }
    }
  }

  for (const [overlayId, nodeIds] of Object.entries(itemHiddenNodeIds ?? {})) {
    for (const nodeId of nodeIds) {
      const override = overrideFor(overlayId, nodeId);
      if (!("hidden" in override)) override.hidden = true;
    }
  }

  return { ...rest, schemaVersion: 5, itemNodeOverrides: overrides } as MigratedToV5<T>;
}

/**
 * Single forward-migration entry point: chains v1→v2→v3→v4→v5 by composing
 * {@link migrateToV2}, {@link migrateToV3}, {@link migrateToV4}, then
 * {@link migrateToV5}. Idempotent on an already-current record (existing
 * `itemNodeOverrides` is preserved, never reset; `textLayerLocks` is dropped).
 * Shared by ZIP import and IDB load so both apply an identical migration path —
 * no forked copies.
 */
export function migrateProject<
  T extends {
    schemaVersion: number;
    template: EditorState | null;
    overlays: BatchProject["overlays"];
    itemTextStyles?: LegacyItemTextStyles;
  },
>(
  project: T,
): Omit<T, "textLayerLocks" | "itemTextValues" | "itemTextStyles" | "itemHiddenNodeIds"> &
  Pick<BatchProject, "schemaVersion" | "itemNodeOverrides"> {
  const migrated = migrateToV5(migrateToV4(migrateToV3(migrateToV2(project))));
  return migrated as Omit<T, "textLayerLocks" | "itemTextValues" | "itemTextStyles" | "itemHiddenNodeIds"> &
    Pick<BatchProject, "schemaVersion" | "itemNodeOverrides">;
}

/** The unified per-item override store: `overlayId → nodeId → NodeOverride`. */
export type ItemNodeOverrides = BatchProject["itemNodeOverrides"];

/**
 * Reads the override for `(overlayId, nodeId)` from the unified store, or `{}`
 * when none exists. Pure read — never mutates the store.
 */
export function getNodeOverride(
  store: ItemNodeOverrides,
  overlayId: string,
  nodeId: string,
): NodeOverride {
  return store[overlayId]?.[nodeId] ?? {};
}

/**
 * Returns a new store with `patch` merged onto the existing override for
 * `(overlayId, nodeId)` (existing fields kept, patch fields win). Immutable:
 * the input store and its nested maps are never mutated.
 */
export function setNodeOverride(
  store: ItemNodeOverrides,
  overlayId: string,
  nodeId: string,
  patch: NodeOverride,
): ItemNodeOverrides {
  return {
    ...store,
    [overlayId]: {
      ...store[overlayId],
      [nodeId]: { ...store[overlayId]?.[nodeId], ...patch },
    },
  };
}

/**
 * Returns a new store with the `hidden` flag of `(overlayId, nodeId)` set to
 * `hidden`. Immutable and idempotent: a no-op toggle (setting the flag to a
 * value it already holds) returns the same store reference so referential
 * equality is preserved and no re-render is triggered.
 */
export function setNodeHidden(
  store: ItemNodeOverrides,
  overlayId: string,
  nodeId: string,
  hidden: boolean,
): ItemNodeOverrides {
  const current = store[overlayId]?.[nodeId]?.hidden ?? false;
  if (current === hidden) return store;
  return setNodeOverride(store, overlayId, nodeId, { hidden });
}

/**
 * Thin read of a text node's per-item **content** override out of the unified
 * store; returns `""` when none exists (the template node's own content is the
 * fallback at the read site).
 */
export function getTextValue(
  store: ItemNodeOverrides,
  overlayId: string,
  nodeId: string,
): string {
  return store[overlayId]?.[nodeId]?.content ?? "";
}

/**
 * Thin read of a text node's per-item **style** override out of the unified
 * store: the {@link TextStyle} subset of the override, with `content` and
 * `hidden` stripped. Returns `{}` when none exists.
 */
export function getTextStyle(
  store: ItemNodeOverrides,
  overlayId: string,
  nodeId: string,
): Partial<TextStyle> {
  const override = store[overlayId]?.[nodeId];
  if (!override) return {};
  const { content: _content, hidden: _hidden, ...style } = override;
  return style as Partial<TextStyle>;
}

/**
 * True when `(overlayId, nodeId)` is hidden for that variant in the unified
 * store (its override carries `hidden: true`).
 */
export function isNodeHidden(
  store: ItemNodeOverrides,
  overlayId: string,
  nodeId: string,
): boolean {
  return store[overlayId]?.[nodeId]?.hidden === true;
}
