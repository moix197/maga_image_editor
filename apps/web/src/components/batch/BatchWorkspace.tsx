"use client";

import { useCallback, useRef, useState } from "react";
import { useBatchProject } from "@/hooks/use-batch-project";
import { useSingleComposite } from "@/hooks/use-single-composite";
import { useBatchRender } from "@/hooks/use-batch-render";
import { useZipExport } from "@/hooks/use-zip-export";
import { AssetUploadZone } from "./AssetUploadZone";
import { AssetList } from "./AssetList";
import { TemplateEditor } from "./TemplateEditor";
import { BatchResultsGallery } from "./BatchResultsGallery";
import { Button } from "@/components/ui/button";
import type { EditorState } from "@maga/editor";
import type { VariableSlot } from "@maga/projects";

export function BatchWorkspace() {
  const { background, overlays, template, variableSlot, outputs, addOutput, clearOutputs, setBackground, addOverlays, setTemplate } =
    useBatchProject();
  const { compositeDataUrl, isRendering, error: compositeError, generate } = useSingleComposite();
  const { isExporting, error: exportError, exportZip } = useZipExport();
  const [showTemplateEditor, setShowTemplateEditor] = useState(false);
  const [bgDimensions, setBgDimensions] = useState<{ w: number; h: number } | null>(null);
  const canvasElRef = useRef<HTMLDivElement | null>(null);
  const canvasCallbackRef = useCallback((el: HTMLDivElement | null) => { canvasElRef.current = el; }, []);

  const batchRender = useBatchRender(
    canvasElRef.current,
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

  function handleTemplateSave(editorState: EditorState, slot: VariableSlot) {
    setTemplate(editorState, slot);
    setShowTemplateEditor(false);
  }

  async function handleGeneratePreview() {
    if (!canvasElRef.current || !template || !variableSlot) return;
    const firstOverlay = overlays[0];
    if (!firstOverlay) return;
    await generate(canvasElRef.current, template, variableSlot, firstOverlay.blobKey);
  }

  async function handleGenerateAll() {
    if (!canvasElRef.current || !template || !variableSlot) return;
    await batchRender.run(addOutput, clearOutputs);
  }

  async function handleExportZip() {
    await exportZip({ background, overlays, template, variableSlot, outputs });
  }

  const canGeneratePreview =
    background !== null &&
    overlays.length > 0 &&
    template !== null &&
    variableSlot !== null;

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Batch Compositing</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Upload a background and overlay images to batch-composite.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <AssetUploadZone label="Background" multiple={false} onFiles={handleBackgroundFiles} />
        <AssetUploadZone label="Overlays" multiple onFiles={handleOverlayFiles} />
      </div>

      <div className="flex flex-col gap-6">
        {background && <AssetList label="Background" assets={[background]} />}
        <AssetList label="Overlays" assets={overlays} />
      </div>

      {template !== null && overlays.length === 0 && (
        <p className="text-sm text-amber-600 dark:text-amber-400">No overlay images uploaded</p>
      )}

      {background && !showTemplateEditor && (
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowTemplateEditor(true)}>
            {template ? "Edit Template" : "Set Up Template"}
          </Button>
          {canGeneratePreview && (
            <Button variant="default" size="sm" disabled={isRendering} onClick={handleGeneratePreview}>
              {isRendering ? "Generating..." : "Generate Preview"}
            </Button>
          )}
          {canGeneratePreview && (
            <Button
              variant="default"
              size="sm"
              disabled={batchRender.isRunning || overlays.length === 0}
              onClick={handleGenerateAll}
            >
              {batchRender.isRunning ? "Running..." : "Generate All"}
            </Button>
          )}
          {batchRender.isRunning && (
            <Button variant="ghost" size="sm" onClick={() => batchRender.cancel?.()}>
              Cancel
            </Button>
          )}
        </div>
      )}

      {background && showTemplateEditor && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold">Template Editor</h2>
            <Button variant="ghost" size="sm" onClick={() => setShowTemplateEditor(false)}>Cancel</Button>
          </div>
          <TemplateEditor backgroundSrc={background.blobKey} onSave={handleTemplateSave} />
        </div>
      )}

      {/* Hidden image to capture natural background dimensions */}
      {background && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={background.id}
          src={background.blobKey}
          alt=""
          aria-hidden="true"
          style={{ display: "none" }}
          onLoad={(e) => {
            const img = e.currentTarget;
            setBgDimensions({ w: img.naturalWidth, h: img.naturalHeight });
          }}
        />
      )}

      {/* Hidden canvas for capturing the background during composite generation. */}
      {background && template && variableSlot && (
        <HiddenCompositeCanvas
          backgroundSrc={background.blobKey}
          canvasCallbackRef={canvasCallbackRef}
          width={bgDimensions?.w ?? 800}
          height={bgDimensions?.h ?? 600}
        />
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

      {compositeDataUrl && <PreviewCard dataUrl={compositeDataUrl} />}

      {outputs.length > 0 && (
        <div className="flex items-center gap-2">
          <Button
            variant="default"
            size="sm"
            disabled={isExporting}
            onClick={handleExportZip}
          >
            {isExporting ? "Exporting..." : "Export ZIP"}
          </Button>
        </div>
      )}

      {exportError && (
        <div role="alert" className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {exportError}
        </div>
      )}

      <BatchResultsGallery
        outputs={outputs}
        overlays={overlays}
        progress={batchRender.progress}
        isRunning={batchRender.isRunning}
      />
    </div>
  );
}

function HiddenCompositeCanvas({ backgroundSrc, canvasCallbackRef, width, height }: {
  backgroundSrc: string;
  canvasCallbackRef: (el: HTMLDivElement | null) => void;
  width: number;
  height: number;
}) {
  return (
    <div
      ref={canvasCallbackRef}
      aria-hidden="true"
      style={{ position: "absolute", left: -9999, top: -9999, width, height, overflow: "hidden", pointerEvents: "none" }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={backgroundSrc} alt="" style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }} />
    </div>
  );
}

function PreviewCard({ dataUrl }: { dataUrl: string }) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-card p-4 shadow-sm">
      <h2 className="text-sm font-semibold tracking-tight">Composite Preview</h2>
      <p className="text-xs text-muted-foreground">First overlay composited into template.</p>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={dataUrl} alt="Composite preview" className="max-w-full rounded-md border border-border" style={{ maxHeight: 400, objectFit: "contain" }} />
    </div>
  );
}
