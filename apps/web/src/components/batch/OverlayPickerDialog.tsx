"use client";

import { useEffect, useState } from "react";
import type { ProjectAsset } from "@maga/projects";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface OverlayPickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Existing overlay assets available to reuse. */
  assets: ProjectAsset[];
  /** Fires with the picked asset ids when "Add" is confirmed. */
  onConfirm: (ids: string[]) => void;
  /** Fires when "Upload new file" is chosen instead of reusing an asset. */
  onUploadNew: () => void;
}

/**
 * Presentational picker for reusing an existing overlay asset (or falling
 * back to a fresh upload) when adding an image overlay. No business logic —
 * all outcomes are reported to the parent via callbacks.
 */
export function OverlayPickerDialog({
  open,
  onOpenChange,
  assets,
  onConfirm,
  onUploadNew,
}: OverlayPickerDialogProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    setSelectedIds(new Set());
  }, [open]);

  function handleCheckboxChange(id: string, checked: boolean) {
    const next = new Set(selectedIds);
    if (checked) {
      next.add(id);
    } else {
      next.delete(id);
    }
    setSelectedIds(next);
  }

  function handleUploadNew() {
    onUploadNew();
    onOpenChange(false);
  }

  function handleConfirm() {
    onConfirm([...selectedIds]);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Choose an overlay image</DialogTitle>
          <DialogDescription>
            Select one or more images to add as an overlay.
          </DialogDescription>
        </DialogHeader>

        <div
          role="listbox"
          aria-label="Overlay assets"
          aria-multiselectable="true"
          className="grid max-h-80 grid-cols-2 gap-3 overflow-y-auto p-1 sm:grid-cols-3 md:grid-cols-4"
        >
          {assets.map((asset) => {
            const isChecked = selectedIds.has(asset.id);
            return (
              <div key={asset.id} className="relative">
                <button
                  type="button"
                  role="option"
                  aria-selected={isChecked}
                  aria-label={asset.filename}
                  onClick={() => handleCheckboxChange(asset.id, !isChecked)}
                  className={[
                    "block w-full cursor-pointer overflow-hidden rounded-lg border-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
                    isChecked ? "border-primary" : "border-transparent hover:border-border",
                  ].join(" ")}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={asset.blobKey}
                    alt={asset.filename}
                    loading="lazy"
                    className="h-24 w-full object-cover"
                    draggable={false}
                  />
                  <p className="truncate px-2 py-1 text-xs text-muted-foreground">{asset.filename}</p>
                </button>
                <input
                  type="checkbox"
                  className="absolute left-1 top-1 h-4 w-4 cursor-pointer rounded border-border accent-primary"
                  checked={isChecked}
                  aria-label={`Select ${asset.filename}`}
                  onChange={(e) => handleCheckboxChange(asset.id, e.target.checked)}
                />
              </div>
            );
          })}
        </div>

        <Button type="button" variant="outline" onClick={handleUploadNew}>
          Upload new file
        </Button>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={handleConfirm} disabled={selectedIds.size === 0}>
            Add
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
