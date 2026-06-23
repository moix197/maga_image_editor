"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useBatchProject } from "@/hooks/use-batch-project";
import { useEditorState } from "@/hooks/use-editor-state";
import { useItemText } from "@/hooks/use-item-text";
import { usePreviewEditorState } from "@/hooks/use-preview-editor-state";
import { useSingleComposite } from "@/hooks/use-single-composite";
import { useBatchRender } from "@/hooks/use-batch-render";
import { useZipExport } from "@/hooks/use-zip-export";
import { useProjectPersistence } from "@/hooks/use-project-persistence";
import { fileToDataUrl } from "@/lib/image-helpers";
import { canGenerateBatch } from "@/lib/batch-gating";
import { BatchResultsGallery } from "./BatchResultsGallery";
import { VariantStrip } from "./VariantStrip";
import { TextOverlayCanvas } from "@/components/text-overlay-canvas";
import { WorkspaceActionsBar } from "./WorkspaceActionsBar";
import { WorkspaceSideNav } from "./WorkspaceSideNav";
import { BatchRightPanel } from "./BatchRightPanel";
import { SCHEMA_VERSION, type BatchProject, type GeneratedOutput, type ProjectAsset } from "@maga/projects";
import { isTextNode, isOverlayNode } from "@maga/editor";
import type { NodeId, TextNode, OverlayNode } from "@maga/editor";
import { resolveSection } from "./workspace-sections";
import { makeTextEditHandlers } from "./make-text-edit-handlers";

const DISABLED_GENERATE_HINT =
  "Select a variable slot and upload at least one overlay image to enable generation.";

function BatchWorkspaceInner() {
  const searchParams = useSearchParams();
  const activeSection = resolveSection(searchParams.get("section"));

  const { background, overlays, template, variableSlot, outputs, itemTextValues, textLayerLocks, itemTextStyles, addOutput, clearOutputs, clearProject, setBackground, addOverlays, reorderOverlays, setEditorTemplate, setProject, setVariableSlot, setItemTextValue, setItemTextStyle, setTextLayerLock } =
    useBatchProject();
  const { compositeDataUrl, isRendering, error: compositeError, generate } = useSingleComposite({ overlays });
  const { isExporting, error: exportError, exportZip } = useZipExport();

  // Track which overlay is shown in the live preview canvas.
  // Initialized to the first overlay; falls back to first if the active one is removed.
  const [activeOverlayId, setActiveOverlayId] = useState<string | null>(
    overlays[0]?.id ?? null,
  );

  // Track which generated output is highlighted in the Results big preview.
  // Auto-selects the first output when outputs go from empty to non-empty.
  // Resets to null when outputs are cleared.
  const [selectedOutputId, setSelectedOutputId] = useState<string | null>(null);
  const prevOutputsLengthRef = useRef<number>(outputs.length);
  useEffect(() => {
    const prevLen = prevOutputsLengthRef.current;
    const curLen = outputs.length;
    prevOutputsLengthRef.current = curLen;
    if (curLen === 0) {
      setSelectedOutputId(null);
    } else if (prevLen === 0 && curLen > 0) {
      setSelectedOutputId(outputs[0]!.overlayAssetId);
    }
  }, [outputs]);

  useEffect(() => {
    setActiveOverlayId((prev) => {
      if (overlays.length === 0) return null;
      const stillExists = overlays.some((o) => o.id === prev);
      return stillExists ? prev : (overlays[0]?.id ?? null);
    });
  }, [overlays]);

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
      itemTextValues: itemTextValues ?? {},
      textLayerLocks: textLayerLocks ?? {},
      itemTextStyles: itemTextStyles ?? {},
    };
  }, [background, overlays, template, variableSlot, outputs, itemTextValues, textLayerLocks, itemTextStyles]);

  const { restored, pendingRestore, consumeRestore, clearPersisted, importError, quotaWarning, importZip } = useProjectPersistence({
    project: persistedProject,
    setProject,
  });

  const editorState = useEditorState(template ?? undefined);
  const [selectedNodeId, setSelectedNodeId] = useState<NodeId | null>(null);
  const overlayInputRef = useRef<HTMLInputElement | null>(null);
  const zipInputRef = useRef<HTMLInputElement | null>(null);
  const [variableSlotNodeId, setVariableSlotNodeId] = useState<NodeId | null>(null);
  const originalSlotSrcRef = useRef<string | null>(null);

  useEffect(() => {
    setEditorTemplate(editorState.state);
  }, [editorState.state, setEditorTemplate]);

  const { replace: replaceEditorState } = editorState;
  useEffect(() => {
    if (!pendingRestore) return;
    consumeRestore();
    if (pendingRestore.template) replaceEditorState(pendingRestore.template);
    setVariableSlotNodeId(pendingRestore.variableSlot?.overlayNodeId ?? null);
  }, [pendingRestore, consumeRestore, replaceEditorState]);

  async function handleImportZipFiles(files: File[]) {
    const file = files[0];
    if (file) await importZip(file);
  }

  const liveCanvasRef = useRef<HTMLDivElement | null>(null);
  const liveCanvasCallbackRef = useCallback((el: HTMLDivElement | null) => { liveCanvasRef.current = el; }, []);

  const batchRender = useBatchRender(
    overlays,
    template ?? { nodes: [] },
    variableSlot ?? { overlayNodeId: "" as never, width: 0, height: 0 },
    itemTextValues ?? {},
    textLayerLocks ?? {},
    editorState.updateTextNode,
    itemTextStyles ?? {},
  );

  async function handleBackgroundFiles(files: File[]) {
    const file = files[0];
    if (file) await setBackground(file);
  }

  async function handleOverlayFiles(files: File[]) {
    await addOverlays(files);
  }

  async function handleOverlayFile(file: File) {
    editorState.addOverlayNode({ src: await fileToDataUrl(file), x: 10, y: 10 });
  }

  function handleNodeMove(id: string, x: number, y: number) {
    const node = editorState.state.nodes.find((n) => n.id === id);
    if (!node) return;
    if (isTextNode(node)) editorState.updateTextNode(id as NodeId, { x, y });
    else editorState.updateOverlayNode(id as NodeId, { x, y });
  }

  function handleNodeResize(id: string, width: number, height: number) {
    editorState.updateOverlayNode(id as NodeId, { width, height });
  }

  function handleToggleVariableSlot(nodeId: NodeId) {
    const node = editorState.state.nodes.find((n) => n.id === nodeId);
    if (!node || !isOverlayNode(node)) return;

    if (variableSlotNodeId === nodeId) {
      if (originalSlotSrcRef.current !== null) {
        editorState.updateOverlayNode(nodeId, { src: originalSlotSrcRef.current });
      }
      originalSlotSrcRef.current = null;
      setVariableSlotNodeId(null);
      setVariableSlot(null);
      return;
    }

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
  }

  function handleDeleteOverlayNode(nodeId: NodeId) {
    if (nodeId === variableSlotNodeId) {
      originalSlotSrcRef.current = null;
      setVariableSlotNodeId(null);
      setVariableSlot(null);
    }
    editorState.removeNode(nodeId);
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
    await exportZip({ background, overlays, template, variableSlot, outputs, itemTextValues: itemTextValues ?? {}, textLayerLocks: textLayerLocks ?? {}, itemTextStyles: itemTextStyles ?? {} });
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
    itemTextValues: itemTextValues ?? {},
    textLayerLocks: textLayerLocks ?? {},
    itemTextStyles: itemTextStyles ?? {},
    setItemTextValue,
    setItemTextStyle,
    setTextLayerLock,
  });
  const textNodes = useMemo(
    () => editorState.state.nodes.filter((n): n is TextNode => isTextNode(n)),
    [editorState.state.nodes],
  );

  const previewEditorState = usePreviewEditorState(
    editorState.state,
    activeOverlayId,
    itemTextValues ?? {},
    itemTextStyles ?? {},
    textLayerLocks ?? {},
    variableSlotNodeId,
    activeOverlay?.blobKey ?? null,
  );

  const { routedSetItemTextValue, routedSetItemTextStyle } = useMemo(
    () =>
      makeTextEditHandlers({
        textLayerLocks: textLayerLocks ?? {},
        setItemTextValue,
        setItemTextStyle,
        updateTextNode: editorState.updateTextNode,
      }),
    [textLayerLocks, setItemTextValue, setItemTextStyle, editorState.updateTextNode],
  );

  const hasBanner = restored || quotaWarning || importError || compositeError || batchRender.error || exportError;

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <WorkspaceActionsBar
        onGeneratePreview={() => void handleGeneratePreview()}
        onGenerateAll={() => void handleGenerateAll()}
        onCancel={() => batchRender.cancel?.()}
        onImportZip={() => zipInputRef.current?.click()}
        onExportZip={() => void handleExportZip()}
        onClearProject={() => void handleClearProject()}
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
                className="relative flex-1 overflow-auto p-4"
                onPointerDown={() => setSelectedNodeId(null)}
              >
                <TextOverlayCanvas
                  // During batch render the loop mutates editorState per overlay
                  // (updateTextNode) and captures the live DOM. previewEditorState
                  // re-pins text to the active variant, so it must be bypassed here
                  // or every captured frame shows the selected variant's text.
                  state={batchRender.isRunning ? editorState.state : previewEditorState}
                  imageSrc={background?.blobKey ?? ""}
                  selectedNodeId={selectedNodeId}
                  onNodeMove={handleNodeMove}
                  onNodeResize={handleNodeResize}
                  onNodeSelect={(id) => setSelectedNodeId(id as NodeId)}
                  canvasCallbackRef={liveCanvasCallbackRef}
                />
              </div>
              {overlays.length > 0 && (
                <div className="shrink-0 border-t border-border p-2">
                  <VariantStrip
                    overlays={overlays}
                    activeId={activeOverlayId}
                    onSelect={setActiveOverlayId}
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
              itemText={itemText}
              // text props
              itemTextValues={itemTextValues ?? {}}
              itemTextStyles={itemTextStyles ?? {}}
              textLayerLocks={textLayerLocks ?? {}}
              setItemTextValue={routedSetItemTextValue}
              setItemTextStyle={routedSetItemTextStyle}
              setTextLayerLock={setTextLayerLock}
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
