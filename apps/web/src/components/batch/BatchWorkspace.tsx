"use client";

import { useBatchProject } from "@/hooks/use-batch-project";
import { AssetUploadZone } from "./AssetUploadZone";
import { AssetList } from "./AssetList";

export function BatchWorkspace() {
  const { background, overlays, setBackground, addOverlays } = useBatchProject();

  async function handleBackgroundFiles(files: File[]) {
    const file = files[0];
    if (file) await setBackground(file);
  }

  async function handleOverlayFiles(files: File[]) {
    await addOverlays(files);
  }

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Batch Compositing
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Upload a background and overlay images to batch-composite.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <AssetUploadZone
          label="Background"
          multiple={false}
          onFiles={handleBackgroundFiles}
        />
        <AssetUploadZone
          label="Overlays"
          multiple
          onFiles={handleOverlayFiles}
        />
      </div>

      <div className="flex flex-col gap-6">
        {background && (
          <AssetList label="Background" assets={[background]} />
        )}
        <AssetList label="Overlays" assets={overlays} />
      </div>
    </div>
  );
}
