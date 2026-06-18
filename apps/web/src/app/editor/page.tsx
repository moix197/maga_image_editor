"use client";

import { useRef, useCallback, useState } from "react";
import { CompareLayout } from "@/components/compare-layout";
import { ImagePanel } from "@/components/image-panel";
import { TextOverlayCanvas } from "@/components/text-overlay-canvas";
import { useEditorState } from "@/hooks/use-editor-state";
import { exportCanvasElement } from "@/lib/export-helpers";
import { fileToDataUrl, downscaleIfNeeded, downloadDataUrl } from "@/lib/image-helpers";
import { Button } from "@/components/ui/button";
import type { NodeId } from "@maga/editor";

export default function EditorPage() {
  const [sourceDataUrl, setSourceDataUrl] = useState<string | null>(null);
  const [resultDataUrl, setResultDataUrl] = useState<string | null>(null);
  const [sourceError, setSourceError] = useState<string | null>(null);
  const [resultError, setResultError] = useState<string | null>(null);
  const canvasElRef = useRef<HTMLDivElement | null>(null);
  const { state, addTextNode, updateTextNode } = useEditorState();

  const canvasCallbackRef = useCallback((el: HTMLDivElement | null) => {
    canvasElRef.current = el;
  }, []);

  async function handleSourceFile(file: File) {
    setSourceError(null);
    setSourceDataUrl(await downscaleIfNeeded(await fileToDataUrl(file)));
  }

  async function handleResultFile(file: File) {
    setResultError(null);
    setResultDataUrl(await downscaleIfNeeded(await fileToDataUrl(file)));
  }

  const sourcePanel = sourceDataUrl ? (
    <TextOverlayCanvas
      state={state}
      onNodeMove={(id, x, y) => updateTextNode(id as NodeId, { x, y })}
      canvasCallbackRef={canvasCallbackRef}
      imageSrc={sourceDataUrl}
    />
  ) : (
    <ImagePanel label="Source" dataUrl={null} onFile={handleSourceFile} onError={setSourceError} />
  );

  return (
    <main className="container mx-auto max-w-5xl px-4 py-10">
      <h1 className="mb-2 text-2xl font-semibold tracking-tight">Image Editor</h1>
      <p className="mb-6 text-sm text-muted-foreground">Upload an image, add text, then export.</p>
      {sourceError && <ErrorAlert msg={sourceError} />}
      {resultError && <ErrorAlert msg={resultError} />}
      <div className="mb-4 flex flex-wrap gap-2">
        <Button variant="outline" size="sm" disabled={!sourceDataUrl} onClick={() => addTextNode()}>
          Add Text
        </Button>
        <Button
          variant="default"
          size="sm"
          disabled={!sourceDataUrl}
          onClick={() => canvasElRef.current && exportCanvasElement(canvasElRef.current, "export.png")}
        >
          Export
        </Button>
      </div>
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
    </main>
  );
}

function ErrorAlert({ msg }: { msg: string }) {
  return (
    <div role="alert" className="mb-6 rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
      {msg}
    </div>
  );
}
