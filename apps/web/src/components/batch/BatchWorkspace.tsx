"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useBatchProject } from "@/hooks/use-batch-project";
import { useCanvasZoom } from "@/hooks/use-canvas-zoom";
import { useEditorState } from "@/hooks/use-editor-state";
import { useItemText } from "@/hooks/use-item-text";
import { usePreviewEditorState } from "@/hooks/use-preview-editor-state";
import { useSingleComposite } from "@/hooks/use-single-composite";
import { useBatchRender } from "@/hooks/use-batch-render";
import { useZipExport } from "@/hooks/use-zip-export";
import { useProjectPersistence } from "@/hooks/use-project-persistence";
import { useFanOutTextHandlers } from "@/hooks/use-fan-out-text-handlers";
import { fileToDataUrl, validateImageFile } from "@/lib/image-helpers";
import { canGenerateBatch } from "@/lib/batch-gating";
import { reconcileVariantSelection } from "@/lib/variant-selection";
import { resolveOverlayFromAssets } from "@/lib/overlay-from-assets";
import { BatchResultsGallery } from "./BatchResultsGallery";
import { VariantStrip } from "./VariantStrip";
import { TextOverlayCanvas } from "@/components/text-overlay-canvas";
import { WorkspaceActionsBar } from "./WorkspaceActionsBar";
import { WorkspaceSideNav } from "./WorkspaceSideNav";
import { BatchRightPanel } from "./BatchRightPanel";
import { SCHEMA_VERSION, type BatchProject, type GeneratedOutput, type ProjectAsset } from "@maga/projects";
import {
  isTextNode,
  isOverlayNode,
  computeContainerSnapTargets,
  computeSiblingSnapTargets,
  resolveSnap,
  resolveEqualSpacingSnap,
} from "@maga/editor";
import type { NodeId, TextNode, OverlayNode, SnapBox, SnapGuide } from "@maga/editor";
import { getIntrinsicRatio, constrainResizeToRatio } from "@/components/overlay-node-layer";
import { resolveSection } from "./workspace-sections";

const DISABLED_GENERATE_HINT =
  "Select a variable slot and upload at least one overlay image to enable generation.";

/**
 * Screen-space snap threshold (px). Converted to canvas-space inside
 * `resolveSnap` via `thresholdPx / scale`, so the pure @maga/editor module
 * never hardcodes it — see plan "Snap threshold default" LOCKED decision.
 */
const SNAP_THRESHOLD_PX = 8;

function BatchWorkspaceInner() {
  const searchParams = useSearchParams();
  const activeSection = resolveSection(searchParams.get("section"));

  const { background, overlays, template, variableSlot, outputs, itemNodeOverrides, addOutput, clearOutputs, clearProject, setBackground, addOverlays, reorderOverlays, setEditorTemplate, setProject, setVariableSlot, setNodeOverride, setNodeHidden } =
    useBatchProject();
  const { compositeDataUrl, isRendering, error: compositeError, generate } = useSingleComposite({ overlays });
  const { isExporting, error: exportError, exportZip } = useZipExport();

  // Track which overlay is shown in the live preview canvas.
  // Initialized to the first overlay; falls back to first if the active one is removed.
  const [activeOverlayId, setActiveOverlayId] = useState<string | null>(
    overlays[0]?.id ?? null,
  );

  const [selectedVariantIds, setSelectedVariantIds] = useState<Set<string>>(
    () => new Set(overlays[0]?.id ? [overlays[0].id] : []),
  );

  // Track which generated output is highlighted in the Results big preview.
  // Auto-selects the first output when outputs go from empty to non-empty;
  // resets to null when outputs are cleared. Reconciled during render (React's
  // "adjust state when a prop changes" pattern), not in an effect.
  const [selectedOutputId, setSelectedOutputId] = useState<string | null>(null);
  const [prevOutputsLen, setPrevOutputsLen] = useState(outputs.length);
  if (outputs.length !== prevOutputsLen) {
    const wasEmpty = prevOutputsLen === 0;
    setPrevOutputsLen(outputs.length);
    if (outputs.length === 0) {
      setSelectedOutputId(null);
    } else if (wasEmpty) {
      setSelectedOutputId(outputs[0]!.overlayAssetId);
    }
  }

  // Keep the active overlay valid: fall back to the first overlay when the
  // active one is removed, or null when none remain. Reconciled during render.
  const [prevOverlays, setPrevOverlays] = useState(overlays);
  if (overlays !== prevOverlays) {
    setPrevOverlays(overlays);
    setActiveOverlayId((prev) => {
      if (overlays.length === 0) return null;
      const stillExists = overlays.some((o) => o.id === prev);
      return stillExists ? prev : (overlays[0]?.id ?? null);
    });
  }

  const prevActiveIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (activeOverlayId) {
      const activeChanged = prevActiveIdRef.current !== activeOverlayId;
      prevActiveIdRef.current = activeOverlayId;
      setSelectedVariantIds((prev) =>
        reconcileVariantSelection({
          prev,
          activeId: activeOverlayId,
          overlayIds: overlays.map((o) => o.id),
          activeChanged,
        }),
      );
    }
  }, [activeOverlayId, overlays]);

  // Resolve the ProjectAsset for the active overlay (used to drive the canvas).
  const activeOverlay = useMemo(
    () => overlays.find((o) => o.id === activeOverlayId) ?? overlays[0] ?? null,
    [overlays, activeOverlayId],
  );

  const persistedProject = useMemo<BatchProject | null>(() => {
    if (!background) return null;
    return {
      schemaVersion: SCHEMA_VERSION,
      id: "active",
      name: "Batch project",
      createdAt: 0,
      updatedAt: 0,
      background,
      overlays,
      template,
      variableSlot,
      outputs,
      itemNodeOverrides: itemNodeOverrides ?? {},
    };
  }, [background, overlays, template, variableSlot, outputs, itemNodeOverrides]);

  const { restored, pendingRestore, consumeRestore, clearPersisted, importError, quotaWarning, importZip } = useProjectPersistence({
    project: persistedProject,
    setProject,
  });

  const editorState = useEditorState(template ?? undefined);
  const [selectedNodeId, setSelectedNodeId] = useState<NodeId | null>(null);
  const [overlayError, setOverlayError] = useState<string | null>(null);
  const overlayInputRef = useRef<HTMLInputElement | null>(null);
  const zipInputRef = useRef<HTMLInputElement | null>(null);
  const [variableSlotNodeId, setVariableSlotNodeId] = useState<NodeId | null>(null);
  const originalSlotSrcRef = useRef<string | null>(null);
  // Id of a just-created overlay node awaiting variable-slot designation (set
  // by handleAddOverlayFromAssets below). addOverlayNode returns the id
  // synchronously, but the node itself only lands in editorState.state.nodes
  // once the triggering setState commits — reading state.nodes back in the
  // same call is racy (see Dependencies & Risks). The effect further down
  // designates the slot once the node actually appears.
  const pendingVariableSlotNodeIdRef = useRef<NodeId | null>(null);

  // Designates `nodeId` as the (single) variable slot: clears any prior slot
  // via the same mutual-exclusion path (restoring its stashed `src`), then
  // stashes this node's `src` and swaps in a placeholder. Shared by the
  // checkbox toggle and (in later phases) the overlay picker's 2+ selection.
  const setVariableSlotForNode = useCallback(
    (nodeId: NodeId) => {
      const node = editorState.state.nodes.find((n) => n.id === nodeId);
      if (!node || !isOverlayNode(node)) return;

      if (variableSlotNodeId !== null) {
        const prevNode = editorState.state.nodes.find((n) => n.id === variableSlotNodeId);
        if (prevNode && isOverlayNode(prevNode) && originalSlotSrcRef.current !== null) {
          editorState.updateOverlayNode(variableSlotNodeId, { src: originalSlotSrcRef.current });
        }
      }

      const overlayNode = node as OverlayNode;
      originalSlotSrcRef.current = overlayNode.src;
      // Use the active overlay as the placeholder so the slot reflects the
      // currently previewed variant, not always the first one.
      const placeholderSrc = activeOverlay?.blobKey ?? overlays[0]?.blobKey;
      if (placeholderSrc) {
        editorState.updateOverlayNode(nodeId, { src: placeholderSrc });
      }
      setVariableSlotNodeId(nodeId);
      setVariableSlot({ overlayNodeId: nodeId, width: overlayNode.width, height: overlayNode.height });
    },
    [editorState, variableSlotNodeId, activeOverlay, overlays, setVariableSlot],
  );

  useEffect(() => {
    setEditorTemplate(editorState.state);
  }, [editorState.state, setEditorTemplate]);

  const { replace: replaceEditorState } = editorState;
  useEffect(() => {
    if (!pendingRestore) return;
    // Imperative one-shot restore (consume + replace editor state); the state
    // set below is part of applying that restore, not a render-derived value.
    consumeRestore();
    if (pendingRestore.template) replaceEditorState(pendingRestore.template);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setVariableSlotNodeId(pendingRestore.variableSlot?.overlayNodeId ?? null);
  }, [pendingRestore, consumeRestore, replaceEditorState]);

  // Completes the deferred variable-slot designation for a node just created
  // by the overlay picker's 2+ path (see handleAddOverlayFromAssets): fires
  // once editorState.state.nodes actually includes the pending node id.
  useEffect(() => {
    const pendingId = pendingVariableSlotNodeIdRef.current;
    if (!pendingId) return;
    if (editorState.state.nodes.some((n) => n.id === pendingId)) {
      pendingVariableSlotNodeIdRef.current = null;
      setVariableSlotForNode(pendingId);
    }
  }, [editorState.state.nodes, setVariableSlotForNode]);

  async function handleImportZipFiles(files: File[]) {
    const file = files[0];
    if (file) await importZip(file);
  }

  const liveCanvasRef = useRef<HTMLDivElement | null>(null);
  const liveCanvasCallbackRef = useCallback((el: HTMLDivElement | null) => { liveCanvasRef.current = el; }, []);

  // Live DOM registry for sibling nodes (never the dragged node itself, which
  // already measures its own rect inline — see text-node-layer.tsx
  // handlePointerMove). Lets siblingSnapBox below measure an auto-sized
  // TextNode sibling's real rendered box instead of collapsing to a
  // zero-size point, which was silently breaking Phase 4 equal-spacing
  // detection (crossAxisOverlaps needs a genuine range, not a point) for the
  // app's default text nodes (no stored width/height). Populated by
  // TextNodeLayer via TextOverlayCanvas's registerNodeElement prop.
  const nodeElementsRef = useRef(new Map<NodeId, HTMLElement>());
  const registerNodeElement = useCallback((id: NodeId, el: HTMLElement | null) => {
    if (el) nodeElementsRef.current.set(id, el);
    else nodeElementsRef.current.delete(id);
  }, []);

  // Ephemeral viewport zoom (never persisted — see use-canvas-zoom.ts). The
  // single `zoom` value returned here is threaded both into the CSS scale
  // transform wrapper below and into TextOverlayCanvasProps.zoomScale, so the
  // resize-math fix always reads the same source (see plan "Single scale
  // source of truth").
  const zoom = useCanvasZoom();
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const canvasImageRef = useRef<HTMLImageElement | null>(null);
  const canvasImageCallbackRef = useCallback((el: HTMLImageElement | null) => { canvasImageRef.current = el; }, []);

  // Ephemeral guide-line state (not persisted) reported by the node layers
  // during a drag; cleared to [] on pointer-up (see text-node-layer.tsx /
  // overlay-node-layer.tsx onGuidesChange calls).
  const [activeGuides, setActiveGuides] = useState<SnapGuide[]>([]);

  // Converts a resolved node's stored percent x/y (+ px width/height, where
  // known) into a canvas-space SnapBox for sibling-snap reference building.
  // TextNode width/height are optional (auto-sized) — for those, we measure
  // the sibling's own live-rendered box via nodeElementsRef (registered by
  // TextNodeLayer, see registerNodeElement above) instead of collapsing to a
  // zero-size point, which used to silently disable Phase 4 equal-spacing
  // detection for the app's default (auto-sized) text nodes. If the element
  // isn't registered yet (should be rare — a node must be rendered to be
  // draggable), fall back to the old zero-size behavior rather than crashing.
  // OverlayNode width/height are always defined, so it never needs this path.
  function siblingSnapBox(
    node: TextNode | OverlayNode,
    canvasSize: { width: number; height: number },
  ): SnapBox {
    const x = (node.x / 100) * canvasSize.width;
    const y = (node.y / 100) * canvasSize.height;
    if (!isTextNode(node)) {
      return { x, y, width: node.width, height: node.height };
    }
    if (node.width !== undefined && node.height !== undefined) {
      return { x, y, width: node.width, height: node.height };
    }
    const rect = nodeElementsRef.current.get(node.id)?.getBoundingClientRect();
    return {
      x,
      y,
      width: node.width ?? (rect ? rect.width / zoom.zoom : 0),
      height: node.height ?? (rect ? rect.height / zoom.zoom : 0),
    };
  }

  // Resolves a dragged node's snapped position + active guides against the
  // parent image/canvas edges & center (Phase 2) and sibling nodes' edges &
  // centers (Phase 3). `canvasSize` is measured by the node layers themselves
  // from their shared parent container rect — in this app's current DOM
  // layout the stage wrapper hugs the <img> exactly, so it already represents
  // both "image bounds" and "canvas bounds" as the same rect (see plan Phase 2
  // notes). Reads the SAME `zoom.zoom` value already threaded into
  // `zoomScale` above — never a second scale source (see plan "Single scale
  // source of truth").
  //
  // Sibling boxes are sourced from `previewEditorState.nodes` — the already-
  // resolved, override-applied node list for the ACTIVE VARIANT (what the
  // canvas actually renders, see the LOAD-BEARING comment on the
  // <TextOverlayCanvas> `state` prop below) — never raw `editorState.state.nodes`,
  // or guides would snap to positions that aren't actually on screen for this
  // variant (see plan "Sibling-snap staleness").
  //
  // Self-exclusion: the dragged node is excluded via `selectedNodeId`, which
  // both node layers set synchronously in their pointer-down handler (calling
  // `onSelect()`/`onNodeSelect`) before any pointer-move can fire for that same
  // drag gesture — so by the time this closure runs during the move, the node
  // being dragged always matches `selectedNodeId`. This relies only on state
  // already read in this file; it avoids extending the `computeSnap` prop
  // signature, which would require also editing text-node-layer.tsx /
  // overlay-node-layer.tsx (both out of scope for this phase) to pass the
  // node's own id through.
  // Phase 4 (equal-spacing): tried per axis, and only when that axis wasn't
  // already snapped by resolveSnap above — edge/center alignment against the
  // image/canvas/siblings always takes PRECEDENCE over equal-spacing when
  // both are within threshold on the same axis (LOCKED precedence rule, see
  // plan Phase 4).
  function applyEqualSpacingSnap(
    box: SnapBox,
    siblingBoxes: SnapBox[],
    edgeCenterResult: { x: number; y: number; guides: SnapGuide[] },
  ): { x: number; y: number; guides: SnapGuide[] } {
    let x = edgeCenterResult.x;
    let y = edgeCenterResult.y;
    const guides = [...edgeCenterResult.guides];

    const xSnappedByEdgeOrCenter = edgeCenterResult.guides.some((g) => g.axis === "vertical");
    if (!xSnappedByEdgeOrCenter) {
      const spacingX = resolveEqualSpacingSnap(box, siblingBoxes, "vertical", SNAP_THRESHOLD_PX, zoom.zoom);
      if (spacingX) {
        x = spacingX.position;
        guides.push(spacingX.guide);
      }
    }

    const ySnappedByEdgeOrCenter = edgeCenterResult.guides.some((g) => g.axis === "horizontal");
    if (!ySnappedByEdgeOrCenter) {
      const spacingY = resolveEqualSpacingSnap(box, siblingBoxes, "horizontal", SNAP_THRESHOLD_PX, zoom.zoom);
      if (spacingY) {
        y = spacingY.position;
        guides.push(spacingY.guide);
      }
    }

    return { x, y, guides };
  }

  function computeSnap(
    box: SnapBox,
    canvasSize: { width: number; height: number },
  ): { x: number; y: number; guides: SnapGuide[] } {
    const siblingBoxes = previewEditorState.nodes
      .filter((n) => n.id !== selectedNodeId)
      .map((n) => siblingSnapBox(n, canvasSize));
    const references = [
      ...computeContainerSnapTargets(canvasSize),
      ...computeSiblingSnapTargets(siblingBoxes),
    ];
    const edgeCenterResult = resolveSnap(box, references, SNAP_THRESHOLD_PX, zoom.zoom);
    return applyEqualSpacingSnap(box, siblingBoxes, edgeCenterResult);
  }

  const batchRender = useBatchRender(
    overlays,
    template ?? { nodes: [] },
    variableSlot ?? { overlayNodeId: "" as never, width: 0, height: 0 },
    itemNodeOverrides ?? {},
    editorState.updateTextNode,
    editorState.updateOverlayNode,
  );

  async function handleBackgroundFiles(files: File[]) {
    const file = files[0];
    if (file) await setBackground(file);
  }

  async function handleOverlayFiles(files: File[]) {
    await addOverlays(files);
  }

  async function handleOverlayFile(file: File) {
    const validation = validateImageFile(file);
    if (!validation.valid) {
      setOverlayError(validation.error ?? "Invalid image file.");
      return;
    }
    setOverlayError(null);
    editorState.addOverlayNode({ src: await fileToDataUrl(file), x: 10, y: 10 });
  }

  // Picker "Add": 1 asset → a static overlay node; 2+ assets → one node
  // auto-designated the variable slot cycling the picked assets. Never
  // touches activeOverlayId, so the reconcile effect (below) — which only
  // resets selectedVariantIds when activeOverlayId or overlays changes —
  // can't clobber the selection set here. The slot designation itself is
  // deferred to the effect above (see pendingVariableSlotNodeIdRef) since the
  // new node isn't in editorState.state.nodes until that setState commits.
  function handleAddOverlayFromAssets(ids: string[]) {
    const decision = resolveOverlayFromAssets(ids, overlays);
    if (!decision) return;
    const nodeId = editorState.addOverlayNode({ src: decision.nodeSrc, x: 10, y: 10 });
    if (decision.makeVariableSlot) {
      pendingVariableSlotNodeIdRef.current = nodeId;
      setSelectedVariantIds(new Set(decision.variantIds));
    }
  }

  function handleNodeMove(id: string, x: number, y: number) {
    const node = editorState.state.nodes.find((n) => n.id === id);
    if (!node) return;
    // Both text and image-overlay moves fan out a per-variant x/y override
    // (selected variants only, active always included) — never the shared
    // template.
    fanOut.handleSetNodeOverride(activeOverlayId ?? "", id, { x, y });
  }

  function handleNodeResize(id: string, width: number, height: number) {
    const node = editorState.state.nodes.find((n) => n.id === id);
    if (!node) return;
    // Image-overlay resizes (the only caller of onNodeResize — see
    // text-overlay-canvas.tsx) respect the lock by constraining to the image's
    // intrinsic ratio before writing the override, mirroring the corner-drag
    // handler in overlay-node-layer.tsx.
    const ratio = isOverlayNode(node) && node.aspectRatioLocked ? getIntrinsicRatio(id) : undefined;
    const size = constrainResizeToRatio(width, height, ratio);
    // Both text and image-overlay resizes fan out a per-variant size override
    // (selected variants only, active always included) — never the shared
    // template.
    fanOut.handleSetNodeOverride(activeOverlayId ?? "", id, size);
  }

  function handleToggleVariableSlot(nodeId: NodeId) {
    if (variableSlotNodeId === nodeId) {
      if (originalSlotSrcRef.current !== null) {
        editorState.updateOverlayNode(nodeId, { src: originalSlotSrcRef.current });
      }
      originalSlotSrcRef.current = null;
      setVariableSlotNodeId(null);
      setVariableSlot(null);
      return;
    }

    setVariableSlotForNode(nodeId);
  }

  function handleDeleteOverlayNode(nodeId: NodeId) {
    if (nodeId === variableSlotNodeId) {
      originalSlotSrcRef.current = null;
      setVariableSlotNodeId(null);
      setVariableSlot(null);
    }
    // Hide the overlay node for the selected variants only — the template node
    // survives so unselected variants keep the overlay. Fan-out mirrors the text
    // hide path (trash button → per-variant hidden flag, not a real removeNode).
    fanOut.handleSetNodeHidden(activeOverlayId ?? "", nodeId, true);
    setSelectedNodeId(null);
  }

  async function handleGeneratePreview() {
    if (!liveCanvasRef.current || !template || !variableSlot) return;
    if (!activeOverlay) return;
    await generate(
      liveCanvasRef.current,
      template,
      variableSlot,
      activeOverlay.blobKey,
      () => { const prev = selectedNodeId; setSelectedNodeId(null); return prev; },
      (id) => setSelectedNodeId(id),
      // Pass the active overlay id so the hook resolves the correct source
      // from its overlays list — consistent with VariantStrip selection.
      activeOverlayId ?? undefined,
    );
  }

  const canGenerate = canGenerateBatch(variableSlot, overlays.length);

  async function handleGenerateAll() {
    if (!liveCanvasRef.current) return;
    // Generate All iterates ALL overlays independently — activeOverlayId has no effect here.
    await batchRender.run(
      addOutput,
      clearOutputs,
      liveCanvasRef.current,
      () => { const prev = selectedNodeId; setSelectedNodeId(null); return prev; },
      (id) => setSelectedNodeId(id),
    );
  }

  async function handleExportZip() {
    await exportZip({ background, overlays, template, variableSlot, outputs, itemNodeOverrides: itemNodeOverrides ?? {} });
  }

  async function handleClearProject() {
    const confirmed = window.confirm(
      "Clear this project? This permanently deletes the background, template, overlays, and generated outputs."
    );
    if (!confirmed) return;
    await clearPersisted();
    clearProject();
    setSelectedNodeId(null);
    setVariableSlotNodeId(null);
    originalSlotSrcRef.current = null;
    editorState.replace({ nodes: [] });
  }

  const hasProject = background !== null || overlays.length > 0 || outputs.length > 0;

  const canGeneratePreview =
    background !== null &&
    overlays.length > 0 &&
    template !== null &&
    variableSlot !== null;

  const selectedNode = selectedNodeId ? (editorState.state.nodes.find((n) => n.id === selectedNodeId) ?? null) : null;
  const isSelectedText = selectedNode !== null && isTextNode(selectedNode);
  const isSelectedOverlay = selectedNode !== null && isOverlayNode(selectedNode);

  const itemText = useItemText({
    itemNodeOverrides: itemNodeOverrides ?? {},
    setNodeOverride,
    setNodeHidden,
  });

  const fanOut = useFanOutTextHandlers({
    selectedVariantIds,
    setNodeOverride,
    setNodeHidden,
  });

  const handleNodeTextResize = useCallback((id: string, width: number) => {
    fanOut.handleSetNodeOverride(activeOverlayId ?? "", id, { width });
  }, [fanOut, activeOverlayId]);

  const handleNodeTextHeightResize = useCallback((id: string, height: number) => {
    fanOut.handleSetNodeOverride(activeOverlayId ?? "", id, { height });
  }, [fanOut, activeOverlayId]);

  const handleNodeContentChange = useCallback((id: string, content: string) => {
    fanOut.handleSetItemTextValue(activeOverlayId ?? "", id, content);
  }, [fanOut, activeOverlayId]);

  const fanOutItemText = {
    ...itemText,
    setTextValue: fanOut.handleSetItemTextValue,
    setTextStyle: fanOut.handleSetItemTextStyle,
    setNodeHidden: fanOut.handleSetNodeHidden,
    setNodeOverride: fanOut.handleSetNodeOverride,
  };
  const textNodes = useMemo(
    () => editorState.state.nodes.filter((n): n is TextNode => isTextNode(n)),
    [editorState.state.nodes],
  );

  const overlayNodes = useMemo(
    () => editorState.state.nodes.filter((n): n is OverlayNode => isOverlayNode(n)),
    [editorState.state.nodes],
  );

  const previewEditorState = usePreviewEditorState(
    editorState.state,
    activeOverlayId,
    itemNodeOverrides ?? {},
    variableSlotNodeId,
    activeOverlay?.blobKey ?? null,
  );

  const hasBanner = restored || quotaWarning || importError || compositeError || batchRender.error || exportError || overlayError;

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <WorkspaceActionsBar
        onGeneratePreview={() => void handleGeneratePreview()}
        onGenerateAll={() => void handleGenerateAll()}
        onCancel={() => batchRender.cancel?.()}
        onImportZip={() => zipInputRef.current?.click()}
        onExportZip={() => void handleExportZip()}
        onClearProject={() => void handleClearProject()}
        zoomPercent={Math.round(zoom.zoom * 100)}
        onZoomIn={zoom.zoomIn}
        onZoomOut={zoom.zoomOut}
        onZoomReset={zoom.resetZoom}
        onZoomFit={() => zoom.fitToViewport(scrollContainerRef.current, canvasImageRef.current)}
        generatePreviewDisabled={!canGeneratePreview || isRendering}
        generateAllDisabled={!canGenerate || batchRender.isRunning}
        generatePreviewTitle={!canGeneratePreview ? DISABLED_GENERATE_HINT : undefined}
        generateAllTitle={!canGenerate ? DISABLED_GENERATE_HINT : undefined}
        cancelDisabled={!batchRender.isRunning}
        importZipDisabled={false}
        exportZipDisabled={isExporting || outputs.length === 0}
        clearProjectDisabled={!hasProject}
      />

      {/* Hidden ZIP file input for actions bar */}
      <input
        ref={zipInputRef}
        type="file"
        accept=".zip,application/zip"
        className="hidden"
        aria-label="Import ZIP file"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (file) await handleImportZipFiles([file]);
          e.target.value = "";
        }}
      />

      {/* Status banners strip — always visible */}
      {hasBanner && (
        <div className="flex flex-col gap-2 px-4 pt-3">
          {restored && (
            <div role="status" className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-400">
              Project restored
            </div>
          )}
          {quotaWarning && (
            <div role="alert" className="rounded-md border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-400">
              Storage quota exceeded — images will not be saved between sessions. Consider using smaller images.
            </div>
          )}
          {importError && (
            <div role="alert" className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {importError}
            </div>
          )}
          {compositeError && (
            <div role="alert" className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {compositeError}
            </div>
          )}
          {batchRender.error && (
            <div role="alert" className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {batchRender.error}
            </div>
          )}
          {exportError && (
            <div role="alert" className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {exportError}
            </div>
          )}
          {overlayError && (
            <div role="alert" className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {overlayError}
            </div>
          )}
        </div>
      )}

      {/* 3-column body */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden md:flex-row">
        {/* LEFT: side nav */}
        <WorkspaceSideNav />

        {/* CENTER: canvas (always visible for non-Results) + VariantStrip below */}
        <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
          {activeSection !== "results" ? (
            <>
              <div
                ref={scrollContainerRef}
                className="relative flex-1 overflow-auto p-4"
                onPointerDown={() => setSelectedNodeId(null)}
              >
                {/*
                  Scale-transform wrapper: a strict ANCESTOR of the
                  canvasCallbackRef div (never the same element as it), so the
                  zoom transform can never enter export geometry — html-to-image
                  rasterizes exactly the div TextOverlayCanvas binds
                  canvasCallbackRef to, one level below this wrapper. See plan
                  "Dependencies & Risks -> export non-contamination (a)".
                */}
                <div
                  style={{
                    display: "inline-block",
                    transform: `scale(${zoom.zoom})`,
                    transformOrigin: "top left",
                  }}
                >
                  <TextOverlayCanvas
                    // LOAD-BEARING — do not change. During batch render the loop
                    // mutates editorState per overlay (updateTextNode) and captures
                    // the live DOM. previewEditorState re-pins text to the active
                    // variant, so it must be bypassed here or every captured frame
                    // shows the selected variant's text.
                    state={batchRender.isRunning ? editorState.state : previewEditorState}
                    imageSrc={background?.blobKey ?? ""}
                    selectedNodeId={selectedNodeId}
                    onNodeMove={handleNodeMove}
                    onNodeResize={handleNodeResize}
                    onNodeTextResize={handleNodeTextResize}
                    onNodeTextHeightResize={handleNodeTextHeightResize}
                    onNodeContentChange={handleNodeContentChange}
                    onNodeSelect={(id) => setSelectedNodeId(id as NodeId)}
                    canvasCallbackRef={liveCanvasCallbackRef}
                    zoomScale={zoom.zoom}
                    imageCallbackRef={canvasImageCallbackRef}
                    computeSnap={computeSnap}
                    onGuidesChange={setActiveGuides}
                    activeGuides={activeGuides}
                    registerNodeElement={registerNodeElement}
                  />
                </div>
              </div>
              {overlays.length > 0 && (
                <div className="shrink-0 border-t border-border p-2">
                  <VariantStrip
                    overlays={overlays}
                    activeId={activeOverlayId}
                    onSelect={setActiveOverlayId}
                    selectedIds={selectedVariantIds}
                    onSelectionChange={(ids) => {
                      const next = new Set(ids);
                      if (activeOverlayId) next.add(activeOverlayId);
                      setSelectedVariantIds(next);
                    }}
                  />
                </div>
              )}
            </>
          ) : (
            <div className="flex-1 overflow-auto p-4">
              <ResultsSection
                outputs={outputs}
                overlays={overlays}
                batchRender={batchRender}
                compositeDataUrl={compositeDataUrl}
                selectedOutputId={selectedOutputId}
                onSelectOutput={setSelectedOutputId}
              />
            </div>
          )}
        </main>

        {/* RIGHT: section-specific panel — hidden for Results */}
        {activeSection !== "results" && (
          <aside className="w-80 shrink-0 overflow-y-auto border-l border-border">
            <BatchRightPanel
              activeSection={activeSection}
              // assets props
              background={background}
              overlays={overlays}
              onBackgroundFiles={handleBackgroundFiles}
              onOverlayFiles={handleOverlayFiles}
              onImportZipFiles={handleImportZipFiles}
              onReorderOverlays={reorderOverlays}
              // template props
              template={template}
              editorState={editorState}
              overlayInputRef={overlayInputRef}
              onOverlayFile={handleOverlayFile}
              onAddOverlayFromAssets={handleAddOverlayFromAssets}
              variableSlotNodeId={variableSlotNodeId}
              selectedNodeId={selectedNodeId}
              selectedNode={selectedNode}
              isSelectedText={isSelectedText}
              isSelectedOverlay={isSelectedOverlay}
              onSetSelectedNodeId={setSelectedNodeId}
              onDeleteOverlayNode={handleDeleteOverlayNode}
              onToggleVariableSlot={handleToggleVariableSlot}
              activeOverlay={activeOverlay}
              textNodes={textNodes}
              overlayNodes={overlayNodes}
              itemText={fanOutItemText}
            />
          </aside>
        )}
      </div>
    </div>
  );
}

interface ResultsSectionProps {
  outputs: GeneratedOutput[];
  overlays: ProjectAsset[];
  batchRender: ReturnType<typeof useBatchRender>;
  compositeDataUrl: string | null;
  selectedOutputId: string | null;
  onSelectOutput: (id: string) => void;
}

export function ResultsSection({
  outputs,
  overlays,
  batchRender,
  compositeDataUrl,
  selectedOutputId,
  onSelectOutput,
}: ResultsSectionProps) {
  // Three-level fallback: selected output → first output → compositeDataUrl
  const selectedOutput = selectedOutputId != null
    ? outputs.find((o) => o.overlayAssetId === selectedOutputId) ?? null
    : null;
  const previewDataUrl =
    (selectedOutput?.outputBlobKey ?? outputs[0]?.outputBlobKey ?? compositeDataUrl) || null;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Results</h1>
        <p className="mt-1 text-sm text-muted-foreground">Generated composite images.</p>
      </div>
      {previewDataUrl && <PreviewCard dataUrl={previewDataUrl} />}
      <BatchResultsGallery
        outputs={outputs}
        overlays={overlays}
        progress={batchRender.progress}
        isRunning={batchRender.isRunning}
        selectedOutputId={selectedOutputId}
        onSelectOutput={onSelectOutput}
      />
    </div>
  );
}

function PreviewCard({ dataUrl }: { dataUrl: string }) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-card p-4 shadow-sm">
      <h2 className="text-sm font-semibold tracking-tight">Composite Preview</h2>
      <p className="text-xs text-muted-foreground">Active overlay composited into template.</p>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={dataUrl} alt="Composite preview" className="max-w-full rounded-md border border-border" style={{ maxHeight: 400, objectFit: "contain" }} />
    </div>
  );
}

export function BatchWorkspace() {
  return (
    <Suspense fallback={null}>
      <BatchWorkspaceInner />
    </Suspense>
  );
}
