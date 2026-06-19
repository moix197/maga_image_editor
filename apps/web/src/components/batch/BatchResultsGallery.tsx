"use client";

import { Download } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { downloadDataUrl } from "@/lib/image-helpers";
import type { GeneratedOutput, ProjectAsset } from "@maga/projects";

interface BatchResultsGalleryProps {
  outputs: GeneratedOutput[];
  overlays: ProjectAsset[];
  progress: { current: number; total: number };
  isRunning: boolean;
}

function OutputCard({ output, overlays }: { output: GeneratedOutput; overlays: ProjectAsset[] }) {
  const asset = overlays.find((o) => o.id === output.overlayAssetId);
  const filename = asset?.filename ?? output.overlayAssetId;
  const stem = filename.replace(/\.[^.]+$/, "");

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3 shadow-sm">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={output.outputBlobKey}
        alt={`Composited ${filename}`}
        className="w-full rounded-md border border-border object-contain"
        style={{ maxHeight: 180 }}
      />
      <p className="truncate text-xs text-muted-foreground" title={filename}>
        {filename}
      </p>
      <Button
        variant="outline"
        size="sm"
        className="w-full cursor-pointer"
        onClick={() => downloadDataUrl(output.outputBlobKey, `${stem}-composite.png`)}
      >
        <Download className="mr-1.5 h-3.5 w-3.5" />
        Download
      </Button>
    </div>
  );
}

export function BatchResultsGallery({
  outputs,
  overlays,
  progress,
  isRunning,
}: BatchResultsGalleryProps) {
  if (outputs.length === 0 && !isRunning) return null;

  const pct = progress.total > 0 ? (progress.current / progress.total) * 100 : 0;

  return (
    <div className="flex flex-col gap-4">
      {(isRunning || progress.current > 0) && (
        <div className="flex flex-col gap-1.5">
          <Progress value={pct} className="h-2" />
          <span
            aria-live="polite"
            aria-atomic="true"
            className="text-xs text-muted-foreground"
          >
            {progress.current} / {progress.total}
          </span>
        </div>
      )}

      {outputs.length > 0 && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {outputs.map((output) => (
            <OutputCard key={output.overlayAssetId} output={output} overlays={overlays} />
          ))}
        </div>
      )}
    </div>
  );
}
