"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useBatchProject } from "@/hooks/use-batch-project";
import { useEditorState } from "@/hooks/use-editor-state";
import { useSingleComposite } from "@/hooks/use-single-composite";
import { useBatchRender } from "@/hooks/use-batch-render";
import { useZipExport } from "@/hooks/use-zip-export";
import { useProjectPersistence } from "@/hooks/use-project-persistence";
import { fileToDataUrl } from "@/lib/image-helpers";
import { canGenerateBatch } from "@/lib/batch-gating";
import { AssetUploadZone } from "./AssetUploadZone";
import { AssetList } from "./AssetList";
import { BatchResultsGallery } from "./BatchResultsGallery";
import { VariantStrip } from "./VariantStrip";
import { TextOverlayCanvas } from "@/components/text-overlay-canvas";
import { TextStylePanel } from "@/components/text-style-panel";
import { OverlayControlsPanel } from "@/components/overlay-controls-panel";
import { Button } from "@/components/ui/button";
import { WorkspaceActionsBar } from "./WorkspaceActionsBar";
import { SCHEMA_VERSION, type BatchProject } from "@maga/projects";
import { isTextNode, isOverlayNode, isBorderOverlay } from "@maga/editor";
import type { NodeId, TextNode, OverlayNode } from "@maga/editor";
import { resolveSection } from "./workspace-sections";

const DISABLED_GENERATE_HINT =
  "Select a variable slot and upload at least one overlay image to enable generation.";

function BatchWorkspaceInner() {
  const searchParams = useSearchParams();
  const activeSection = resolveSection(searchParams.get("section"));

  const { background, overlays, template, variableSlot, outputs, addOutput, clearOutputs, clearProject, setBackground, addOverlays, setEditorTemplate, setProject, setVariableSlot } =
    useBatchProject();
  const { compositeDataUrl, isRendering, error: compositeError, generate } = useSingleComposite({ overlays });
  const { isExporting, error: exportError, exportZip } = useZipExport();

  // Track which overlay is shown in the live preview canvas.
  // Initialized to the first overlay; falls back to first if the active one is removed.
  const [activeOverlayId, setActiveOverlayId] = useState<string | null>(
    overlays[0]?.id ?? null,
  );

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
    };
  }, [background, overlays, template, variableSlot, outputs]);

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
    await exportZip({ background, overlays, template, variableSlot, outputs });
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

  return (
    <div className="flex flex-col">
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

      <div className="flex flex-col gap-6 p-6">
        {/* Status banners — always visible */}
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

        {/* Section content */}
        {activeSection === "assets" && (
          <div className="flex flex-col gap-6">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">Assets</h1>
              <p className="mt-1 text-sm text-muted-foreground">Upload background and overlay images.</p>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <AssetUploadZone label="Background" multiple={false} onFiles={handleBackgroundFiles} />
              <AssetUploadZone label="Overlays" multiple onFiles={handleOverlayFiles} />
            </div>
            {!background && (
              <div className="flex flex-col gap-2">
                <p className="text-sm text-muted-foreground">Or resume a previously exported project:</p>
                <AssetUploadZone label="Import ZIP" multiple={false} accept=".zip,application/zip" onFiles={handleImportZipFiles} />
              </div>
            )}
            <div className="flex flex-col gap-6">
              {background && <AssetList label="Background" assets={[background]} />}
              <AssetList label="Overlays" assets={overlays} />
            </div>
            {template !== null && overlays.length === 0 && (
              <p className="text-sm text-amber-600 dark:text-amber-400">No overlay images uploaded</p>
            )}
          </div>
        )}

        {activeSection === "template" && (
          <div className="flex flex-col gap-4">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">Template</h1>
              <p className="mt-1 text-sm text-muted-foreground">Design the compositing template.</p>
            </div>
            {background ? (
              <div className="flex flex-col gap-3">
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" onClick={() => editorState.addTextNode()}>Add Text</Button>
                  <Button variant="outline" size="sm" onClick={() => editorState.addBorderNode()}>Add Border</Button>
                  <Button variant="outline" size="sm" onClick={() => overlayInputRef.current?.click()}>Add Image Overlay</Button>
                  <input
                    ref={overlayInputRef}
                    type="file"
                    accept="image/png,image/svg+xml"
                    className="hidden"
                    aria-label="Upload image overlay"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (file) await handleOverlayFile(file);
                      e.target.value = "";
                    }}
                  />
                </div>

                {/* Variant strip — switches the live canvas to the selected overlay */}
                {overlays.length > 0 && (
                  <VariantStrip
                    overlays={overlays}
                    activeId={activeOverlayId}
                    onSelect={setActiveOverlayId}
                  />
                )}

                <div className="flex gap-4">
                  <div className="flex flex-col gap-3">
                    <div style={{ position: "relative" }} onPointerDown={() => setSelectedNodeId(null)}>
                      <TextOverlayCanvas
                        state={editorState.state}
                        imageSrc={background.blobKey}
                        selectedNodeId={selectedNodeId}
                        onNodeMove={handleNodeMove}
                        onNodeResize={handleNodeResize}
                        onNodeSelect={(id) => setSelectedNodeId(id as NodeId)}
                        canvasCallbackRef={liveCanvasCallbackRef}
                      />
                    </div>
                  </div>
                  {(isSelectedText || isSelectedOverlay) && (
                    <div className="w-64 shrink-0">
                      {isSelectedText && (
                        <TextStylePanel
                          node={selectedNode as TextNode}
                          onChange={(patch) => editorState.updateTextNode(selectedNodeId!, patch)}
                          onDelete={() => { editorState.removeNode(selectedNodeId!); setSelectedNodeId(null); }}
                          onReorder={(dir) => editorState.reorderNode(selectedNodeId!, dir)}
                        />
                      )}
                      {isSelectedOverlay && (
                        <OverlayControlsPanel
                          node={selectedNode as OverlayNode}
                          onChange={(patch) => editorState.updateOverlayNode(selectedNodeId!, patch)}
                          onDelete={() => handleDeleteOverlayNode(selectedNodeId!)}
                          onReorder={(dir) => editorState.reorderNode(selectedNodeId!, dir)}
                          {...(!isBorderOverlay(selectedNode as OverlayNode) && {
                            isVariableSlot: variableSlotNodeId === selectedNodeId,
                            onToggleVariableSlot: () => handleToggleVariableSlot(selectedNodeId!),
                          })}
                        />
                      )}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Upload a background image first in the Assets section.</p>
            )}
          </div>
        )}

        {activeSection === "text" && (
          <div className="flex flex-col gap-4">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">Text</h1>
              <p className="mt-1 text-sm text-muted-foreground">Edit text layer properties.</p>
            </div>
            {isSelectedText ? (
              <TextStylePanel
                node={selectedNode as TextNode}
                onChange={(patch) => editorState.updateTextNode(selectedNodeId!, patch)}
                onDelete={() => { editorState.removeNode(selectedNodeId!); setSelectedNodeId(null); }}
                onReorder={(dir) => editorState.reorderNode(selectedNodeId!, dir)}
              />
            ) : (
              <p className="text-sm text-muted-foreground">Select a text layer on the canvas to edit its properties.</p>
            )}
          </div>
        )}

        {activeSection === "results" && (
          <div className="flex flex-col gap-6">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">Results</h1>
              <p className="mt-1 text-sm text-muted-foreground">Generated composite images.</p>
            </div>
            {compositeDataUrl && <PreviewCard dataUrl={compositeDataUrl} />}
            <BatchResultsGallery
              outputs={outputs}
              overlays={overlays}
              progress={batchRender.progress}
              isRunning={batchRender.isRunning}
            />
          </div>
        )}
      </div>
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
