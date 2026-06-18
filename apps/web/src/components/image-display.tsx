import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";

interface ImageDisplayProps {
  src: string | null;
  alt: string;
  onDownload?: () => void;
}

export function ImageDisplay({ src, alt, onDownload }: ImageDisplayProps) {
  if (!src) {
    return (
      <div className="flex min-h-[240px] items-center justify-center rounded-lg border border-dashed border-border bg-muted/30">
        <p className="text-sm text-muted-foreground">No image loaded</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-hidden rounded-lg border border-border">
        {/* plain <img> required — next/image does not support data URLs */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={alt} className="h-auto w-full object-contain" />
      </div>
      {onDownload && (
        <Button variant="outline" onClick={onDownload} className="self-start cursor-pointer">
          <Download className="mr-2 h-4 w-4" aria-hidden="true" />
          Download
        </Button>
      )}
    </div>
  );
}
