"use client";
import { useState } from "react";
import { CompareLayout } from "@/components/compare-layout";
import { ImagePanel } from "@/components/image-panel";
import { fileToDataUrl, downscaleIfNeeded, downloadDataUrl } from "@/lib/image-helpers";

export default function EditorPage() {
  const [sourceDataUrl, setSourceDataUrl] = useState<string | null>(null);
  const [resultDataUrl, setResultDataUrl] = useState<string | null>(null);
  const [sourceError, setSourceError] = useState<string | null>(null);
  const [resultError, setResultError] = useState<string | null>(null);

  async function handleSourceFile(file: File) {
    setSourceError(null);
    const dataUrl = await fileToDataUrl(file);
    setSourceDataUrl(await downscaleIfNeeded(dataUrl));
  }

  async function handleResultFile(file: File) {
    setResultError(null);
    const dataUrl = await fileToDataUrl(file);
    setResultDataUrl(await downscaleIfNeeded(dataUrl));
  }

  return (
    <main className="container mx-auto max-w-5xl px-4 py-10">
      <h1 className="mb-2 text-2xl font-semibold tracking-tight">Image Editor</h1>
      <p className="mb-8 text-sm text-muted-foreground">Upload images to compare.</p>
      {sourceError && <ErrorAlert msg={sourceError} />}
      {resultError && <ErrorAlert msg={resultError} />}
      <CompareLayout
        left={
          <ImagePanel
            label="Source"
            dataUrl={sourceDataUrl}
            onFile={handleSourceFile}
            onError={setSourceError}
            onDownload={sourceDataUrl ? () => downloadDataUrl(sourceDataUrl, "source.png") : undefined}
          />
        }
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
