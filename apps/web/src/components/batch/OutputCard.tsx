"use client";

import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { downloadDataUrl } from "@/lib/image-helpers";
import type { GeneratedOutput, ProjectAsset } from "@maga/projects";

interface OutputCardProps {
  output: GeneratedOutput;
  overlays: ProjectAsset[];
  isSelected?: boolean;
  onClick?: () => void;
}

export function OutputCard({ output, overlays, isSelected = false, onClick }: OutputCardProps) {
  const asset = overlays.find((o) => o.id === output.overlayAssetId);
  const filename = asset?.filename ?? output.overlayAssetId;
  const stem = filename.replace(/\.[^.]+$/, "");

  function handleKeyDown(e: React.KeyboardEvent) {
    if (onClick && (e.key === "Enter" || e.key === " ")) {
      e.preventDefault();
      onClick();
    }
  }

  return (
    <div
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      aria-pressed={onClick ? isSelected : undefined}
      onClick={onClick}
      onKeyDown={onClick ? handleKeyDown : undefined}
      className={[
        "flex flex-col gap-2 rounded-lg border bg-card p-3 shadow-sm",
        onClick ? "cursor-pointer" : "",
        isSelected
          ? "border-primary ring-2 ring-primary"
          : "border-border",
      ]
        .filter(Boolean)
        .join(" ")}
    >
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
        onClick={(e) => {
          // Prevent the card's onClick from firing when the download button is clicked
          e.stopPropagation();
          downloadDataUrl(output.outputBlobKey, `${stem}-composite.png`);
        }}
      >
        <Download className="mr-1.5 h-3.5 w-3.5" />
        Download
      </Button>
    </div>
  );
}
