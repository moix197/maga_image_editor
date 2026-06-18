"use client";

import { useState } from "react";
import { ImageUploader } from "@/components/image-uploader";
import { ImageDisplay } from "@/components/image-display";
import { fileToDataUrl, downscaleIfNeeded, downloadDataUrl } from "@/lib/image-helpers";

export default function EditorPage() {
  const [sourceDataUrl, setSourceDataUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File) {
    setError(null);
    const dataUrl = await fileToDataUrl(file);
    const scaled = await downscaleIfNeeded(dataUrl);
    setSourceDataUrl(scaled);
  }

  function handleError(msg: string) {
    setError(msg);
  }

  function handleDownload() {
    if (sourceDataUrl) downloadDataUrl(sourceDataUrl, "image.png");
  }

  return (
    <main className="container mx-auto max-w-3xl px-4 py-10">
      <h1 className="mb-2 text-2xl font-semibold tracking-tight">Image Editor</h1>
      <p className="mb-8 text-sm text-muted-foreground">Upload an image to get started.</p>
      {error && (
        <div role="alert" className="mb-6 rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}
      {!sourceDataUrl ? (
        <ImageUploader onFile={handleFile} onError={handleError} />
      ) : (
        <ImageDisplay src={sourceDataUrl} alt="Uploaded image" onDownload={handleDownload} />
      )}
      {sourceDataUrl && (
        <button
          className="mt-4 text-xs text-muted-foreground underline cursor-pointer hover:text-foreground transition-colors"
          onClick={() => { setSourceDataUrl(null); setError(null); }}
        >
          Remove image
        </button>
      )}
    </main>
  );
}
