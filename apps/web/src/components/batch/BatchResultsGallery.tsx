"use client";

import { Progress } from "@/components/ui/progress";
import { OutputCard } from "./OutputCard";
import type { GeneratedOutput, ProjectAsset } from "@maga/projects";

interface BatchResultsGalleryProps {
  outputs: GeneratedOutput[];
  overlays: ProjectAsset[];
  progress: { current: number; total: number };
  isRunning: boolean;
  selectedOutputId?: string | null;
  onSelectOutput?: (id: string) => void;
}

export function BatchResultsGallery({
  outputs,
  overlays,
  progress,
  isRunning,
  selectedOutputId,
  onSelectOutput,
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
            <OutputCard
              key={output.overlayAssetId}
              output={output}
              overlays={overlays}
              isSelected={output.overlayAssetId === selectedOutputId}
              onClick={onSelectOutput ? () => onSelectOutput(output.overlayAssetId) : undefined}
            />
          ))}
        </div>
      )}
    </div>
  );
}
