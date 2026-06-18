"use client";

import { ImageUploader } from "@/components/image-uploader";
import { ImageDisplay } from "@/components/image-display";

interface ImagePanelProps {
  label: string;
  dataUrl: string | null;
  onFile: (f: File) => void;
  onError: (msg: string) => void;
  onDownload?: () => void;
  emptyLabel?: string;
}

export function ImagePanel({
  label,
  dataUrl,
  onFile,
  onError,
  onDownload,
  emptyLabel = "No image yet",
}: ImagePanelProps) {
  return (
    <div className="rounded-lg border border-border p-4">
      <p className="text-sm font-medium text-muted-foreground mb-2">{label}</p>
      {dataUrl === null ? (
        <>
          {emptyLabel && (
            <p className="text-xs text-muted-foreground mb-2">{emptyLabel}</p>
          )}
          <ImageUploader onFile={onFile} onError={onError} />
        </>
      ) : (
        <ImageDisplay
          src={dataUrl}
          alt={label}
          onDownload={onDownload}
        />
      )}
    </div>
  );
}
