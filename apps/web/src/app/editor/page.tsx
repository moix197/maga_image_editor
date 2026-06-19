"use client";

import { useRef, useCallback, useState } from "react";
import { CompareLayout } from "@/components/compare-layout";
import { ImagePanel } from "@/components/image-panel";
import { TextOverlayCanvas } from "@/components/text-overlay-canvas";
import { TextStylePanel } from "@/components/text-style-panel";
import { OverlayControlsPanel } from "@/components/overlay-controls-panel";
import { useEditorState } from "@/hooks/use-editor-state";
import { useCartoonize } from "@/hooks/use-cartoonize";
import { exportCanvasElement } from "@/lib/export-helpers";
import { fileToDataUrl, downscaleIfNeeded, downloadDataUrl } from "@/lib/image-helpers";
import { Button } from "@/components/ui/button";
import { isTextNode, isOverlayNode } from "@maga/editor";
import type { NodeId, TextNode, OverlayNode } from "@maga/editor";

export default function EditorPage() {
  const [sourceDataUrl, setSourceDataUrl] = useState<string | null>(null);
  const [resultDataUrl, setResultDataUrl] = useState<string | null>(null);
  const [sourceError, setSourceError] = useState<string | null>(null);
  const [resultError, setResultError] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<NodeId | null>(null);
  const canvasElRef = useRef<HTMLDivElement | null>(null);
  const overlayInputRef = useRef<HTMLInputElement | null>(null);
  const { state, addTextNode, addOverlayNode, addBorderNode, updateTextNode, updateOverlayNode, removeNode, reorderNode } = useEditorState();
  const { loading: cartoonizeLoading, error: cartoonizeError, enabled: cartoonizeEnabled, cartoonize } = useCartoonize();

  const canvasCallbackRef = useCallback((el: HTMLDivElement | null) => { canvasElRef.current = el; }, []);

  async function handleExport() {
    if (!canvasElRef.current) return;
    const prev = selectedNodeId;
    setSelectedNodeId(null);
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    await exportCanvasElement(canvasElRef.current, "export.png");
    setSelectedNodeId(prev);
  }

  async function handleSourceFile(file: File) {
    setSourceError(null);
    setSourceDataUrl(await downscaleIfNeeded(await fileToDataUrl(file)));
  }

  async function handleResultFile(file: File) {
    setResultError(null);
    setResultDataUrl(await downscaleIfNeeded(await fileToDataUrl(file)));
  }

  async function handleOverlayFile(file: File) {
    addOverlayNode({ src: await fileToDataUrl(file), x: 10, y: 10 });
  }

  async function handleCartoonize() {
    if (!sourceDataUrl) return;
    const url = await cartoonize(sourceDataUrl);
    if (url) setResultDataUrl(url);
  }

  const selectedNode = selectedNodeId ? (state.nodes.find((n) => n.id === selectedNodeId) ?? null) : null;
  const isSelectedText = selectedNode !== null && isTextNode(selectedNode);
  const isSelectedOverlay = selectedNode !== null && isOverlayNode(selectedNode);

  const sourcePanel = sourceDataUrl ? (
    <div onPointerDown={() => setSelectedNodeId(null)}>
      <TextOverlayCanvas
        state={state}
        onNodeMove={(id, x, y) => {
          const node = state.nodes.find((n) => n.id === id);
          if (!node) return;
          if (isTextNode(node)) updateTextNode(id as NodeId, { x, y });
          else updateOverlayNode(id as NodeId, { x, y });
        }}
        onNodeResize={(id, width, height) => updateOverlayNode(id as NodeId, { width, height })}
        onNodeSelect={(id) => setSelectedNodeId(id as NodeId)}
        selectedNodeId={selectedNodeId}
        canvasCallbackRef={canvasCallbackRef}
        imageSrc={sourceDataUrl}
      />
    </div>
  ) : (
    <ImagePanel label="Source" dataUrl={null} onFile={handleSourceFile} onError={setSourceError} />
  );

  return (
    <main className="container mx-auto max-w-5xl px-4 py-10">
      <h1 className="mb-2 text-2xl font-semibold tracking-tight">Image Editor</h1>
      <p className="mb-6 text-sm text-muted-foreground">Upload an image, add text or overlays, then export.</p>
      {sourceError && <ErrorAlert msg={sourceError} />}
      {resultError && <ErrorAlert msg={resultError} />}
      {cartoonizeError && <ErrorAlert msg={cartoonizeError} />}
      <div className="mb-4 flex flex-wrap gap-2">
        <Button variant="outline" size="sm" disabled={!sourceDataUrl} onClick={() => addTextNode()}>Add Text</Button>
        <Button variant="outline" size="sm" disabled={!sourceDataUrl} onClick={() => addBorderNode()}>Add Border</Button>
        <Button variant="outline" size="sm" disabled={!sourceDataUrl} onClick={() => overlayInputRef.current?.click()}>Add Image Overlay</Button>
        <input ref={overlayInputRef} type="file" accept="image/png,image/svg+xml" className="hidden" aria-label="Upload image overlay" onChange={async (e) => { const file = e.target.files?.[0]; if (file) await handleOverlayFile(file); e.target.value = ""; }} />
        <span title={!cartoonizeEnabled ? "Add DEEPAI_API_KEY to .env.local to enable" : undefined}>
          <Button variant="outline" size="sm" disabled={!cartoonizeEnabled || cartoonizeLoading || !sourceDataUrl} onClick={handleCartoonize}>
            {cartoonizeLoading ? "Cartoonizing..." : "Cartoonize"}
          </Button>
        </span>
        <Button variant="default" size="sm" disabled={!sourceDataUrl} onClick={handleExport}>Export</Button>
      </div>
      <div className="flex gap-4">
        <div className="flex-1">
          <CompareLayout
            left={sourcePanel}
            right={
              <ImagePanel
                label="Result"
                dataUrl={resultDataUrl}
                onFile={handleResultFile}
                onError={setResultError}
                emptyLabel="No result yet"
                onDownload={resultDataUrl ? () => downloadDataUrl(resultDataUrl, "result.png") : undefined}
              />
            }
          />
          {resultDataUrl && <p className="mt-2 text-xs text-amber-600">This result is temporary — download it before closing or reloading the page.</p>}
        </div>
        {sourceDataUrl && (
          <div className="w-64 shrink-0">
            {isSelectedText && (
              <TextStylePanel
                node={selectedNode as TextNode}
                onChange={(patch) => updateTextNode(selectedNodeId!, patch)}
                onDelete={() => { removeNode(selectedNodeId!); setSelectedNodeId(null); }}
                onReorder={(dir) => reorderNode(selectedNodeId!, dir)}
              />
            )}
            {isSelectedOverlay && (
              <OverlayControlsPanel
                node={selectedNode as OverlayNode}
                onChange={(patch) => updateOverlayNode(selectedNodeId!, patch)}
                onDelete={() => { removeNode(selectedNodeId!); setSelectedNodeId(null); }}
                onReorder={(dir) => reorderNode(selectedNodeId!, dir)}
              />
            )}
            {!isSelectedText && !isSelectedOverlay && (
              <p className="text-sm text-muted-foreground">Select a layer to edit its properties.</p>
            )}
          </div>
        )}
      </div>
    </main>
  );
}

function ErrorAlert({ msg }: { msg: string }) {
  return (
    <div role="alert" className="mb-6 rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">{msg}</div>
  );
}
